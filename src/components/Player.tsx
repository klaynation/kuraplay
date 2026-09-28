/**
 * Player.tsx — in-app local video player for AnimeOffline.
 * ---------------------------------------------------------------------------
 * Why this exists: mpv was fire-and-forget, so the app could never know where
 * you stopped. Every Phase-1 feature (exact resume positions, completion state,
 * next-up auto-advance, media hotkeys) hangs off this component.
 *
 * Playback goes through the Tauri asset protocol (convertFileSrc), which serves
 * the file over http://asset.localhost with Range support — so seeking works on
 * multi-GB files without loading them into memory.
 *
 * Codec reality check (WebView2 == Chromium):
 *   plays   : mp4 / webm / mkv with H.264 + AAC/AC3/Opus/Vorbis
 *   won't   : HEVC/x265 (unless the HEVC extension is installed), 10-bit x264,
 *             MPEG-TS (.ts), most .avi codecs
 * When <video> errors, the player degrades to a card offering "Open in mpv"
 * at the exact timestamp, so nothing is ever unplayable.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

export type WatchStatus = "unwatched" | "in_progress" | "completed";

export interface PlayerEpisode {
  name: string;
  path: string;
  episodeNumber: number | null;
}

type Props = {
  animeTitle: string;
  episodes: PlayerEpisode[];
  startIndex: number;
  /** Seconds to resume from for a given episode path. */
  resumeSeconds: (path: string) => number;
  /** Throttled progress persistence. status is derived here, not in the app. */
  onProgress: (
    path: string,
    seconds: number,
    duration: number | null,
    status: WatchStatus
  ) => void;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** When a codec fails, hand straight to mpv instead of showing the card. */
  autoHandoff: boolean;
  /** Roll into the next episode on a countdown when one finishes. */
  autoAdvance: boolean;
  /** Fraction of runtime (0..1) at which an episode counts as completed. */
  completeAt: number;
  initialVolume: number;
  initialRate: number;
  /** Reports volume/speed changes so the app can remember them. */
  onPrefs: (volume: number, rate: number) => void;
  /** Hand off to the external player at the current timestamp. */
  onOpenExternal: (path: string, seconds: number) => void;
};

const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75];
const HIDE_CONTROLS_MS = 2600;
const PERSIST_EVERY_S = 5;
const NEXT_COUNTDOWN_S = 6;

export function formatClock(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const s = Math.floor(t % 60);
  const m = Math.floor((t / 60) % 60);
  const h = Math.floor(t / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function Player({
  animeTitle,
  episodes,
  startIndex,
  resumeSeconds,
  onProgress,
  onIndexChange,
  onClose,
  onOpenExternal,
  autoHandoff,
  autoAdvance,
  completeAt,
  initialVolume,
  initialRate,
  onPrefs,
}: Props) {
  const [index, setIndex] = useState(startIndex);
  const episode = episodes[index];

  const shellRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hideTimer = useRef<number | null>(null);
  const lastPersist = useRef(0);
  const clock = useRef({ time: 0, duration: 0 });

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(initialVolume);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(initialRate);
  const [controlsOn, setControlsOn] = useState(true);
  const [failed, setFailed] = useState(false);
  const [nextIn, setNextIn] = useState<number | null>(null);
  const [nextUpOpen, setNextUpOpen] = useState(false);

  const hasNext = index < episodes.length - 1;
  const hasPrev = index > 0;

  /* ------------------------------------------------------------- persist */

  const statusFor = useCallback(
    (seconds: number, dur: number): WatchStatus => {
      if (dur > 0 && seconds >= dur * completeAt) return "completed";
      if (seconds > 3) return "in_progress";
      return "unwatched";
    },
    [completeAt]
  );

  const persist = useCallback(
    (force = false) => {
      const v = videoRef.current;
      if (!v || !episode) return;
      const { time: t, duration: d } = clock.current;
      if (!force && t - lastPersist.current < PERSIST_EVERY_S) return;
      lastPersist.current = t;
      onProgress(episode.path, Math.floor(t), d > 0 ? Math.floor(d) : null, statusFor(t, d));
    },
    [episode, onProgress, statusFor]
  );

  // Final write when the player closes or switches episode.
  useEffect(() => {
    return () => {
      persist(true);
    };
  }, [persist]);

  /* -------------------------------------------------------------- navigate */

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= episodes.length) return;
      persist(true);
      setIndex(next);
      onIndexChange(next);
      setTime(0);
      setDuration(0);
      setFailed(false);
      setNextIn(null);
      setNextUpOpen(false);
      clock.current = { time: 0, duration: 0 };
      lastPersist.current = 0;
      setControlsOn(true);
    },
    [episodes.length, onIndexChange, persist]
  );

  const next = useCallback(() => hasNext && goTo(index + 1), [goTo, hasNext, index]);
  const prev = useCallback(() => hasPrev && goTo(index - 1), [goTo, hasPrev, index]);

  /* --------------------------------------------------------------- actions */

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || failed) return;
    if (v.paused) void v.play().catch(() => setFailed(true));
    else v.pause();
  }, [failed]);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void el.requestFullscreen().catch(() => undefined);
  }, []);

  const cycleRate = useCallback(() => {
    setRate((r) => RATES[(RATES.indexOf(r) + 1) % RATES.length]);
  }, []);

  /* ------------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT")) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          seekBy(e.shiftKey ? 30 : 10);
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekBy(e.shiftKey ? -30 : -10);
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume((v) => Math.min(1, +(v + 0.1).toFixed(2)));
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume((v) => Math.max(0, +(v - 0.1).toFixed(2)));
          break;
        case "f":
          toggleFullscreen();
          break;
        case "m":
          setMuted((m) => !m);
          break;
        case "n":
          next();
          break;
        case "p":
          prev();
          break;
        case ">":
          cycleRate();
          break;
        case "Escape":
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
          else onClose();
          return;
        default:
          if (/^[0-9]$/.test(e.key)) {
            const v = videoRef.current;
            if (v && v.duration) v.currentTime = v.duration * (Number(e.key) / 10);
          } else return;
      }
      setControlsOn(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycleRate, next, onClose, prev, seekBy, toggleFullscreen, togglePlay]);

  /* ------------------------------------------------- auto-hide the chrome */

  const poke = useCallback(() => {
    setControlsOn(true);
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) setControlsOn(false);
    }, HIDE_CONTROLS_MS);
  }, []);

  useEffect(() => {
    poke();
    return () => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    };
  }, [poke]);

  /* ------------------------------------------------------ video callbacks */

  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v || !episode) return;
    setDuration(v.duration || 0);
    clock.current.duration = v.duration || 0;
    const resume = resumeSeconds(episode.path);
    // Don't resume into the last 10s — that just replays the outro.
    if (resume > 5 && v.duration && resume < v.duration - 10) v.currentTime = resume;
  }, [episode, resumeSeconds]);

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setTime(v.currentTime);
    clock.current.time = v.currentTime;
    persist();
  }, [persist]);

  const onEnded = useCallback(() => {
    const v = videoRef.current;
    if (!v || !episode) return;
    clock.current.time = v.duration || 0;
    onProgress(episode.path, Math.floor(v.duration || 0), Math.floor(v.duration || 0), "completed");
    setPlaying(false);
    if (hasNext) {
      setNextUpOpen(true);
      if (autoAdvance) setNextIn(NEXT_COUNTDOWN_S);
    }
  }, [autoAdvance, episode, hasNext, onProgress]);

  // Countdown to the next episode, cancelable.
  useEffect(() => {
    if (nextIn === null) return;
    if (nextIn <= 0) {
      setNextIn(null);
      next();
      return;
    }
    const t = window.setTimeout(() => setNextIn((n) => (n === null ? null : n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [next, nextIn]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = rate;
  }, [rate, index]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.volume = volume;
      v.muted = muted;
    }
  }, [volume, muted, index]);

  useEffect(() => {
    onPrefs(volume, rate);
  }, [onPrefs, rate, volume]);

  if (!episode) return null;

  const epLabel = episode.episodeNumber != null ? `Episode ${episode.episodeNumber}` : episode.name;
  const pct = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <div
      ref={shellRef}
      className={`pl-shell${controlsOn ? " controls-on" : ""}`}
      onMouseMove={poke}
      onClick={poke}
      role="dialog"
      aria-modal="true"
      aria-label={`Playing ${animeTitle}, ${epLabel}`}
    >
      {!failed ? (
        <video
          key={episode.path}
          ref={videoRef}
          className="pl-video"
          src={convertFileSrc(episode.path)}
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          onError={() => {
            setFailed(true);
            if (autoHandoff) onOpenExternal(episode.path, resumeSeconds(episode.path));
          }}
          onPlay={() => { setPlaying(true); poke(); }}
          onPause={() => { setPlaying(false); setControlsOn(true); }}
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
          playsInline
        />
      ) : (
        <div className="pl-fallback">
          <div className="pl-fallback-card">
            <h3>This file can't play in the built-in player</h3>
            <p>
              The webview decodes H.264/AAC in mp4, webm and mkv. HEVC, 10-bit
              x264 and MPEG-TS need the external player.
            </p>
            <p className="pl-fallback-path">{episode.path}</p>
            <div className="pl-fallback-actions">
              <button className="primary-button" onClick={() => onOpenExternal(episode.path, clock.current.time)}>
                Open in mpv at {formatClock(clock.current.time)}
              </button>
              <button className="secondary-button" onClick={() => setFailed(false)}>
                Retry built-in
              </button>
              <button className="secondary-button" onClick={onClose}>Close player</button>
            </div>
          </div>
        </div>
      )}

      {/* top bar */}
      <div className="pl-top">
        <div className="pl-title">
          <strong>{animeTitle}</strong>
          <span>{epLabel}</span>
        </div>
        <button className="pl-btn" onClick={onClose} aria-label="Close player" title="Close (Esc)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* next-up countdown */}
      {nextUpOpen && (
        <div className="pl-nextup">
          <p>
            Next up: <strong>
              {episodes[index + 1]?.episodeNumber != null
                ? `Episode ${episodes[index + 1].episodeNumber}`
                : episodes[index + 1]?.name}
            </strong>
          </p>
          <div className="pl-nextup-actions">
            <button className="primary-button" onClick={() => { setNextUpOpen(false); setNextIn(null); next(); }}>
              {autoAdvance && nextIn !== null ? `Play now (${nextIn})` : "Play next"}
            </button>
            <button className="secondary-button" onClick={() => { setNextUpOpen(false); setNextIn(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* control bar */}
      {!failed && (
        <div className="pl-controls">
          <input
            className="pl-seek"
            type="range"
            min={0}
            max={duration || 0}
            step={1}
            value={time}
            aria-label="Seek"
            onChange={(e) => {
              const v = videoRef.current;
              if (!v) return;
              v.currentTime = Number(e.target.value);
              setTime(v.currentTime);
              clock.current.time = v.currentTime;
            }}
            style={{
              background: `linear-gradient(to right, var(--accent) ${pct}%, rgba(255,255,255,0.22) ${pct}%)`,
            }}
          />
          <div className="pl-row">
            <div className="pl-cluster">
              <button className="pl-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} title="Play/Pause (Space)">
                {playing ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1.2" /><rect x="14" y="4.5" width="4" height="15" rx="1.2" /></svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.2v13.6a1 1 0 0 0 1.52.85l10.9-6.8a1 1 0 0 0 0-1.7L9.52 4.35A1 1 0 0 0 8 5.2Z" /></svg>
                )}
              </button>
              <button className="pl-btn" onClick={() => seekBy(-10)} aria-label="Back 10 seconds" title="-10s (←)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 17a5 5 0 1 0 1-9.9V4L7.5 7.5 12 11V8.1" /><text x="9.6" y="16.4" fontSize="6.5" fill="currentColor" stroke="none" fontWeight="700">10</text></svg>
              </button>
              <button className="pl-btn" onClick={() => seekBy(10)} aria-label="Forward 10 seconds" title="+10s (→)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 17a5 5 0 1 1-1-9.9V4l4.5 3.5L12 11V8.1" /><text x="9.6" y="16.4" fontSize="6.5" fill="currentColor" stroke="none" fontWeight="700">10</text></svg>
              </button>
              <button className="pl-btn" onClick={prev} disabled={!hasPrev} aria-label="Previous episode" title="Previous (P)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2.4v14H6zM18 5.6v12.8a1 1 0 0 1-1.53.85l-9.2-6.4a1 1 0 0 1 0-1.7l9.2-6.4A1 1 0 0 1 18 5.6Z" transform="scale(-1,1) translate(-24,0)" /></svg>
              </button>
              <button className="pl-btn" onClick={next} disabled={!hasNext} aria-label="Next episode" title="Next (N)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2.4v14H6zM18 5.6v12.8a1 1 0 0 1-1.53.85l-9.2-6.4a1 1 0 0 1 0-1.7l9.2-6.4A1 1 0 0 1 18 5.6Z" /></svg>
              </button>
              <span className="pl-time">{formatClock(time)} / {formatClock(duration)}</span>
            </div>

            <div className="pl-cluster">
              <button className="pl-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"} title="Mute (M)">
                {muted || volume === 0 ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" /><path d="m16 9 5 6M21 9l-5 6" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" /></svg>
                )}
              </button>
              <input
                className="pl-vol"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                aria-label="Volume"
                onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }}
              />
              <button className="pl-btn pl-rate" onClick={cycleRate} aria-label="Playback speed" title="Speed (&gt;)">
                {rate}×
              </button>
              <button className="pl-btn" onClick={() => onOpenExternal(episode.path, clock.current.time)} aria-label="Open in external player" title="Open in mpv at current time">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H11" /></svg>
              </button>
              <button className="pl-btn" onClick={toggleFullscreen} aria-label="Fullscreen" title="Fullscreen (F)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M8 21H4a1 1 0 0 1-1-1v-4M16 21h4a1 1 0 0 0 1-1v-4" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Player;
