/**
 * ContinueWatchingStrip.tsx
 * ---------------------------------------------------------------------------
 * Horizontal-scroll shell for the "Continue Watching" row.
 *
 * Drop-in: it wraps the JSX your `renderWatchCard()` already produces, so no
 * card markup has to change. Integration is two lines (see INTEGRATION_NOTES.md):
 *
 *   <ContinueWatchingStrip label="Continue Watching">
 *     {resumeList.map((item) => renderWatchCard(item))}
 *   </ContinueWatchingStrip>
 *
 * Solves, in order:
 *   1. Scroll-wheel mouse trap  -> wheel-to-horizontal translation + prev/next
 *      arrows + pointer drag-to-scroll + an auto-hiding thin scrollbar.
 *   2. Keyboard nav             -> roving tabindex (ONE tab stop for the whole
 *      row) + Arrow/Home/End, with deterministic scroll-into-view. Does not
 *      rely on the browser snapping a focused element into view.
 *   3. Snap vs. drag fighting   -> snap is disabled while dragging.
 *   4. Scroll offset lost when `scanLibrary()` re-renders the row -> persisted.
 *
 * ZERO CHANGES NEEDED to renderWatchCard: cards are auto-detected as the direct
 * children of the strip. If you'd rather be explicit, add `data-cw-card` to the
 * card root and that takes precedence over auto-detection.
 *
 * Verified against React 19 + TypeScript strict. Do NOT hardcode tabIndex on the
 * cards — the strip owns tabIndex (roving tabindex) and will overwrite it.
 */
import {
  Children,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

const CARD = "[data-cw-card]";
const DRAG_THRESHOLD_PX = 5; // below this, a pointer gesture is a click, not a drag

type Props = {
  children: ReactNode;
  /** Accessible name for the row. */
  label?: string;
  /** sessionStorage key used to restore the scroll offset after a library rescan. */
  storageKey?: string | null;
  /** Arrow buttons hide themselves when the row fits without scrolling. */
  hideArrowsWhenNotScrollable?: boolean;
};

/* ------------------------------------------------------------------ hooks */

/** Live `prefers-reduced-motion` (not a one-shot read: the OS setting can change). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

/* -------------------------------------------------------------- component */

export function ContinueWatchingStrip({
  children,
  label = "Continue Watching",
  storageKey = "cw-strip-scroll",
  hideArrowsWhenNotScrollable = true,
}: Props) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    startScroll: 0,
    pointerId: -1,
  });

  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const [dragging, setDragging] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const rawId = useId();
  const stripId = `cw-strip-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const scrollable = !(atStart && atEnd);
  const behavior: ScrollBehavior = reducedMotion ? "auto" : "smooth";

  /**
   * Resolve the card elements. Prefers explicit `data-cw-card` markers; falls
   * back to the strip's direct element children so renderWatchCard needs no
   * edits at all.
   */
  const cards = useCallback((): HTMLElement[] => {
    const el = stripRef.current;
    if (!el) return [];
    const marked = Array.from(el.querySelectorAll<HTMLElement>(CARD));
    if (marked.length > 0) return marked;
    return Array.from(el.children).filter(
      (n): n is HTMLElement => n instanceof HTMLElement
    );
  }, []);

  /* ---------------------------------------------- edge + size measurement */

  const measure = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const fits = max <= 1;
    const left = el.scrollLeft;

    setAtStart((prev) => (prev === (fits || left <= 1) ? prev : fits || left <= 1));
    setAtEnd((prev) => {
      const next = fits || left >= max - 1;
      return prev === next ? prev : next;
    });

    if (storageKey) {
      try {
        sessionStorage.setItem(storageKey, String(Math.round(left)));
      } catch {
        /* private mode / disabled storage — non-fatal */
      }
    }
  }, [storageKey]);

  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;

    const onScroll = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        measure();
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onScroll) : null;
    ro?.observe(el);

    // Posters decode async and change scrollWidth after first paint — re-measure
    // once they land, otherwise the "next" arrow stays disabled on a full row.
    const imgs = Array.from(el.querySelectorAll("img"));
    imgs.forEach((img) => {
      if (!img.complete) img.addEventListener("load", onScroll, { once: true });
    });

    measure();

    return () => {
      el.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      imgs.forEach((img) => img.removeEventListener("load", onScroll));
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [measure]);

  /* ------------------------------------------- restore offset after rescan */

  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el || !storageKey) return;
    try {
      const saved = Number(sessionStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved > 0) el.scrollLeft = saved;
    } catch {
      /* ignore */
    }
    measure();
    // Deliberately mount-only: re-running on every render would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------ wheel: vertical -> horizontal */

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1) return; // row fits: never hijack the gesture
      if (e.deltaX !== 0) return; // shift+wheel / trackpad: already horizontal
      if (Math.abs(e.deltaY) < 1) return;
      // Don't steal a gesture aimed at a nested scroller (tooltip, sub-list).
      const path = e.composedPath() as Element[];
      const nested = path.slice(0, path.indexOf(el)).some((node) => {
        if (!(node instanceof HTMLElement)) return false;
        const oy = getComputedStyle(node).overflowY;
        return (oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight;
      });
      if (nested) return;

      const atLeft = el.scrollLeft <= 0;
      const atRight = el.scrollLeft >= max - 1;
      // At the edges, hand the gesture back to the page instead of dead-ending it.
      if ((atLeft && e.deltaY < 0) || (atRight && e.deltaY > 0)) return;

      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      el.scrollLeft += e.deltaY * unit;
      e.preventDefault(); // only when we actually consumed it
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* ------------------------------------------- roving tabindex (one stop) */

  useEffect(() => {
    const list = cards();
    if (!list.length) return;
    const activeIdx = list.findIndex((c) => c.tabIndex === 0);
    const keep = activeIdx === -1 ? 0 : activeIdx;
    list.forEach((c, i) => {
      const want = i === keep ? 0 : -1;
      if (c.tabIndex !== want) c.tabIndex = want;
    });
  });

  /* --------------------------------------------------------- scroll helper */

  const revealCard = useCallback(
    (card: HTMLElement) => {
      const el = stripRef.current;
      if (!el) return;
      const cs = getComputedStyle(el);
      const elR = el.getBoundingClientRect();
      const cR = card.getBoundingClientRect();
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;

      let delta = 0;
      if (cR.left < elR.left + padL) delta = cR.left - (elR.left + padL);
      else if (cR.right > elR.right - padR) delta = cR.right - (elR.right - padR);

      // Manual scrollBy (not scrollIntoView) so ancestors never get yanked.
      if (Math.abs(delta) > 0.5) el.scrollBy({ left: delta, behavior });
    },
    [behavior]
  );

  const stepByViewport = useCallback(
    (dir: 1 | -1) => {
      const el = stripRef.current;
      if (!el) return;
      const first = cards()[0];
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const cardW = first ? first.getBoundingClientRect().width + gap : 0;

      // Move in whole cards when we can measure them, else ~90% of the viewport.
      const perView = cardW > 0 ? Math.max(1, Math.floor(el.clientWidth / cardW)) : 1;
      const distance = cardW > 0 ? cardW * perView : el.clientWidth * 0.9;

      el.scrollBy({ left: dir * distance, behavior });
    },
    [behavior, cards]
  );

  /* ------------------------------------------------------- drag to scroll */

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = stripRef.current;
    if (!el || e.button !== 0) return;
    if (e.pointerType === "touch") return; // touch pans natively; don't double-handle
    if ((e.target as HTMLElement).closest("[data-cw-arrow]")) return;
    if (el.scrollWidth - el.clientWidth <= 1) return;

    drag.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      pointerId: e.pointerId,
    };
    // Capture on the strip so the drag survives the pointer leaving a card.
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* older WebKitGTK builds may throw if the pointer is already gone */
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = stripRef.current;
    if (!el || !d.active || e.pointerId !== d.pointerId) return;

    const dx = e.clientX - d.startX;
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return; // still a click
      d.moved = true;
      setDragging(true);
    }
    el.scrollLeft = d.startScroll - dx;
    e.preventDefault();
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = stripRef.current;
    if (!d.active) return;
    if (el && el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    d.active = false;

    if (d.moved) {
      setDragging(false);
      // Swallow the click that the browser fires at the end of a drag, then
      // clear the latch on the next tick so genuine clicks still work.
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
        d.moved = false;
      }, 0);
    }
  };

  const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
  };

  /* ------------------------------------------------------- keyboard (a11y) */

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = cards();
    if (!list.length) return;
    const current = list.indexOf(document.activeElement as HTMLElement);
    if (current === -1) return;

    let next: number;
    switch (e.key) {
      case "ArrowRight":
        next = Math.min(current + 1, list.length - 1);
        break;
      case "ArrowLeft":
        next = Math.max(current - 1, 0);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = list.length - 1;
        break;
      default:
        return; // let Tab / Enter / Space behave normally
    }
    e.preventDefault();
    if (next === current) return;

    list.forEach((c, i) => {
      c.tabIndex = i === next ? 0 : -1;
    });
    // preventScroll: we position the card ourselves, so the browser can't
    // scroll the page vertically behind the user's back.
    list[next].focus({ preventScroll: true });
    revealCard(list[next]);
  };

  // React's onFocus is backed by `focusin`, so it bubbles from the cards.
  const onFocusIn = (e: React.FocusEvent<HTMLDivElement>) => {
    const card = (e.target as HTMLElement).closest?.(CARD) as HTMLElement | null;
    if (!card || !stripRef.current?.contains(card)) return;
    cards().forEach((c) => {
      c.tabIndex = c === card ? 0 : -1;
    });
    // Covers engines that do NOT re-snap a snapped container on focus.
    revealCard(card);
  };

  /* ------------------------------------------------------------- render */

  if (Children.count(children) === 0) return null;

  return (
    <div
      className="cw-shell"
      data-scrollable={String(scrollable)}
      data-at-start={String(atStart)}
      data-at-end={String(atEnd)}
    >
      {!hideArrowsWhenNotScrollable || scrollable ? (
        <button
          type="button"
          className="cw-arrow cw-arrow--prev"
          data-cw-arrow=""
          aria-controls={stripId}
          aria-label={`Scroll ${label} left`}
          disabled={atStart}
          onClick={() => stepByViewport(-1)}
        >
          <svg className="cw-arrow-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}

      <div className="cw-viewport">
        <div
          id={stripId}
          ref={stripRef}
          className={`cw-strip${dragging ? " is-dragging" : ""}`}
          /* role="list" pairs with the role="listitem" on your .cw-item wrappers */
          role="list"
          aria-label={label}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClickCapture={onClickCapture}
          onKeyDown={onKeyDown}
          onFocus={onFocusIn}
        >
          {children}
        </div>
      </div>

      {!hideArrowsWhenNotScrollable || scrollable ? (
        <button
          type="button"
          className="cw-arrow cw-arrow--next"
          data-cw-arrow=""
          aria-controls={stripId}
          aria-label={`Scroll ${label} right`}
          disabled={atEnd}
          onClick={() => stepByViewport(1)}
        >
          <svg className="cw-arrow-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

export default ContinueWatchingStrip;
