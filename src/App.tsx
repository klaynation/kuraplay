import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { ContinueWatchingStrip } from "./components/ContinueWatchingStrip";
import { Player, formatClock, type WatchStatus } from "./components/Player";
import "./App.css";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --------------------------------------------------
// TOAST COMPONENT
// --------------------------------------------------
const Toast = ({
  message,
  duration = 4000,
  onClose,
}: {
  message: string;
  duration?: number;
  onClose?: () => void;
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      setVisible(false);
      onClose?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onClose]);

  return visible ? (
    <div
      className="floating-toast"
      onClick={() => {
        setVisible(false);
        onClose?.();
      }}
    >
      <CheckCircleIcon size={16} />
      <span>{message}</span>
    </div>
  ) : null;
};

// --------------------------------------------------
// ICONS
// --------------------------------------------------
type IconProps = { size?: number; className?: string };

const Svg = ({
  size = 18,
  className,
  strokeWidth = 1.8,
  fill = "none",
  children,
}: IconProps & { strokeWidth?: number; fill?: string; children: React.ReactNode }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const HomeIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.7}>
    {/* .duo = fill copy of the silhouette; CSS fades it in on hover/active */}
    <path className="duo" d="M12 4.4 4.6 10.3v8.3A1.8 1.8 0 0 0 6.4 20.4h11.2a1.8 1.8 0 0 0 1.8-1.8v-8.3L12 4.4Z" fill="currentColor" stroke="none" />
    <path d="M3.8 10.5 12 4l8.2 6.5" />
    <path d="M6.1 9.3v9.3a1.8 1.8 0 0 0 1.8 1.8h8.2a1.8 1.8 0 0 0 1.8-1.8V9.3" />
    <path d="M9.9 20.4v-4.2a2.1 2.1 0 0 1 4.2 0v4.2" />
  </Svg>
);

const HeartIcon = ({ filled = false, size = 16, className }: IconProps & { filled?: boolean }) => (
  <Svg size={size} className={className} strokeWidth={1.7} fill={filled ? "currentColor" : "none"}>
    {!filled && (
      <path className="duo" d="M12 20.4S4.5 15.9 2 11.5C.5 8.6 1.4 5 4.8 4.1c2.2-.6 4.4.4 5.7 2.2L12 8.1l1.5-1.8c1.3-1.8 3.5-2.8 5.7-2.2 3.4.9 4.3 4.5 2.8 7.4-2.5 4.4-10 8.9-10 8.9Z" fill="currentColor" stroke="none" />
    )}
    <path d="M12 20.4S4.5 15.9 2 11.5C.5 8.6 1.4 5 4.8 4.1c2.2-.6 4.4.4 5.7 2.2L12 8.1l1.5-1.8c1.3-1.8 3.5-2.8 5.7-2.2 3.4.9 4.3 4.5 2.8 7.4-2.5 4.4-10 8.9-10 8.9Z" />
  </Svg>
);

const ClockIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.7}>
    <circle className="duo" cx="12" cy="12" r="8.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="8.4" />
    <path d="M12 7.4V12l3.2 2" strokeWidth={2} />
  </Svg>
);

const SlidersIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.7}>
    <path d="M4 7h8.1M16.9 7H20M4 12h3.1M11.9 12H20M4 17h10.1M18.9 17H20" />
    <circle className="duo" cx="14.5" cy="7" r="2.4" fill="currentColor" stroke="none" />
    <circle className="duo" cx="9.5" cy="12" r="2.4" fill="currentColor" stroke="none" />
    <circle className="duo" cx="16.5" cy="17" r="2.4" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="7" r="2.4" />
    <circle cx="9.5" cy="12" r="2.4" />
    <circle cx="16.5" cy="17" r="2.4" />
  </Svg>
);

const ChevronDownIcon = () => (
  <Svg size={14} className="select-chevron" strokeWidth={2}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

const FolderIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z" />
  </Svg>
);

const SparkleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.9 15.5A2 2 0 0 0 8.5 14.1L2.4 12.5a.5.5 0 0 1 0-1l6.1-1.6a2 2 0 0 0 1.4-1.4l1.6-6.1a.5.5 0 0 1 1 0l1.6 6.1a2 2 0 0 0 1.4 1.4l6.1 1.6a.5.5 0 0 1 0 1l-6.1 1.6a2 2 0 0 0-1.4 1.4l-1.6 6.1a.5.5 0 0 1-1 0Z" />
  </Svg>
);

const PaletteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.7 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H16a4 4 0 0 0 4-4c0-4.4-3.6-8-8-8Z" />
    <circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="10.5" cy="7" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="11.5" r="1.1" fill="currentColor" stroke="none" />
  </Svg>
);

const DatabaseIcon = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
    <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
  </Svg>
);

const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="11" x2="12" y2="16" />
    <circle cx="12" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
);

const SunIcon = ({ size = 15, className }: IconProps) => (
  <Svg size={size} className={className} strokeWidth={2}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </Svg>
);

const OledIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" />
  </Svg>
);

const DimIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M4 17.5h16" />
    <path d="M7.5 17.5a4.5 4.5 0 0 1 9 0" />
    <path d="M12 9V6.5M6.6 11.2 5.2 9.8M17.4 11.2l1.4-1.4" />
  </Svg>
);

const MoonIcon = ({ size = 15, className }: IconProps) => (
  <Svg size={size} className={className} strokeWidth={2}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </Svg>
);

const RefreshIcon = ({ size = 16, className }: IconProps) => (
  <Svg size={size} className={className} strokeWidth={2}>
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  </Svg>
);

const PlayIcon = ({ size = 14, className }: IconProps) => (
  <Svg size={size} className={className} fill="currentColor" strokeWidth={1.5}>
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" />
  </Svg>
);

const CheckIcon = ({ size = 14, className }: IconProps) => (
  <Svg size={size} className={className} strokeWidth={2.6}>
    <polyline points="20 6 9 17 4 12" />
  </Svg>
);

const CheckCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Svg>
);

const PanelLeftIcon = ({ collapsed = false, size = 18 }: IconProps & { collapsed?: boolean }) => (
  <Svg size={size}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M9 3v18" />
    {collapsed ? <path d="m14 9 3 3-3 3" /> : <path d="m17 15-3-3 3-3" />}
  </Svg>
);

const SearchIcon = ({ size = 16, className }: IconProps) => (
  <Svg size={size} className={className} strokeWidth={2}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.8-3.8" />
  </Svg>
);

const XIcon = ({ size = 16, className }: IconProps) => (
  <Svg size={size} className={className} strokeWidth={2}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

const ArrowLeftIcon = ({ size = 16, className }: IconProps) => (
  <Svg size={size} className={className} strokeWidth={2}>
    <path d="m12 19-7-7 7-7M19 12H5" />
  </Svg>
);

const StarIcon = ({ size = 12, className }: IconProps) => (
  <Svg size={size} className={className} fill="currentColor" strokeWidth={1.2}>
    <path d="M12 2.8l2.84 5.76 6.36.92-4.6 4.48 1.08 6.33L12 17.3l-5.68 2.99 1.08-6.33-4.6-4.48 6.36-.92z" />
  </Svg>
);

const DiceIcon = ({ size = 16, className }: IconProps) => (
  <Svg size={size} className={className}>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
);

const FilmIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.5}>
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4" />
  </Svg>
);

const AlertIcon = ({ size = 14, className }: IconProps) => (
  <Svg size={size} className={className} strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4M12 16h.01" />
  </Svg>
);

const TrashIcon = ({ size = 15, className }: IconProps) => (
  <Svg size={size} className={className} strokeWidth={2}>
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
  </Svg>
);

const WandIcon = ({ size = 16, className }: IconProps) => (
  <Svg size={size} className={className} strokeWidth={2}>
    <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
    <path d="m14 7 3 3M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9" />
  </Svg>
);

const SortIcon = ({ size = 15, className }: IconProps) => (
  <Svg size={size} className={className} strokeWidth={2}>
    <path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16" />
  </Svg>
);

const TagIcon = ({ size = 15, className }: IconProps) => (
  <Svg size={size} className={className} strokeWidth={2}>
    <path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z" />
    <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
  </Svg>
);

const LogoGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="anivault-mark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#c084fc" />
        <stop offset="50%" stopColor="#8b5cf6" />
        <stop offset="100%" stopColor="#38bdf8" />
      </linearGradient>
    </defs>
    <path d="M7 4.9v14.2a1.5 1.5 0 0 0 2.28 1.28l11.1-7.1a1.5 1.5 0 0 0 0-2.56L9.28 3.62A1.5 1.5 0 0 0 7 4.9Z" fill="url(#anivault-mark)" />
    <path d="M3.4 8.6h2M3.4 12h2M3.4 15.4h2" stroke="url(#anivault-mark)" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const Poster = ({ src, alt, iconSize = 28 }: { src?: string; alt: string; iconSize?: number }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  
  if (!src || failed) {
    return (
      <div className="poster-fallback">
        <FilmIcon size={iconSize} />
      </div>
    );
  }
  
  return (
    <img 
      src={src} 
      alt={alt} 
      loading="lazy" 
      onError={() => setFailed(true)} 
      style={{ 
        width: "100%", 
        height: "100%", 
        objectFit: "cover", 
        display: "block" 
      }}
    />
  );
};

// --------------------------------------------------
// INTERFACES & TYPES
// --------------------------------------------------

interface AnimeMetadata {
  title: string;
  alternativeTitles: string[];
  synopsis: string;
  episodeCount: number;
  duration: number;
  rating: number;
  genres: string[];
  /** Provider-ranked descriptive tags (AniList rank / Jikan themes). Oldest
      caches simply lack this and fall back to genres only. */
  tags?: string[];
  status: "Completed" | "Airing" | "Not yet released";
  season: string;
  year: number;
  studio: string;
  posterUrl?: string;
}

interface Episode {
  name: string;
  path: string;
  episodeNumber: number | null;
}

interface AnimeFolder {
  name: string;
  path: string;
  episodes: Episode[];
  missingEpisodes: number;
  metadata?: AnimeMetadata;
  isMatched: boolean;
  matchConfidence: number;
}

type Page = "home" | "favorites" | "history" | "settings";
type NoticeType = "success" | "error" | "info";

interface Notice {
  id: number;
  type: NoticeType;
  text: string;
}

type EpisodeProgress = {
  episodePath: string;
  /** Derived from `status`; kept so older UI code keeps working. */
  watched: boolean;
  lastOpenedAt: number;
  /** 0..1 fraction of the episode watched. */
  progress: number;
  duration: number | null;
  /** Exact resume position in seconds. */
  progressSeconds: number;
  durationSeconds: number | null;
  status: WatchStatus;
  playCount: number;
};

type EpisodeProgressMap = Record<string, EpisodeProgress>;

const VIDEO_EXTENSIONS = [".ts", ".mkv", ".mp4", ".webm", ".avi"];
const EPISODE_PROGRESS_KEY = "animeoffline:episode-progress:v1";
const METADATA_CACHE_KEY = "animeoffline:metadata-cache:v1";
const FAVORITES_KEY = "animeoffline:favorites:v1";
const THEME_KEY = "animeoffline:theme:v1";
const SIDEBAR_KEY = "animeoffline:sidebar-collapsed:v1";
const DEFAULT_PAGE_KEY = "animeoffline:default-page:v1";
const DENSITY_KEY = "animeoffline:density:v1";
const SHOW_CW_KEY = "animeoffline:show-continue:v1";
const MOTION_KEY = "animeoffline:reduce-motion:v1";
type ThemeName = "dark" | "light" | "oled" | "dim";
type Density = "compact" | "cozy" | "large";
const ACCENT_KEY = "animeoffline:accent:v1";
const PLAYER_KEY = "animeoffline:player:v1";
const PLAYER_FALLBACK_KEY = "animeoffline:player-fallback:v1";
const AUTONEXT_KEY = "animeoffline:auto-next:v1";
const COMPLETE_AT_KEY = "animeoffline:complete-at:v1";
const REMEMBER_PREFS_KEY = "animeoffline:remember-prefs:v1";
const PLAYBACK_PREFS_KEY = "animeoffline:playback-prefs:v1";
type PlayerPref = "builtin" | "mpv";
type FallbackPref = "ask" | "auto";
type AccentName = "violet" | "blue" | "pink" | "emerald" | "amber";
const ACCENT_PRESETS: { id: AccentName; label: string; swatch: string }[] = [
  { id: "violet", label: "Violet", swatch: "#8b5cf6" },
  { id: "blue", label: "Blue", swatch: "#3b82f6" },
  { id: "pink", label: "Pink", swatch: "#ec4899" },
  { id: "emerald", label: "Emerald", swatch: "#10b981" },
  { id: "amber", label: "Amber", swatch: "#f59e0b" },
];

const THEME_OPTIONS: { id: ThemeName; label: string; Icon: (p: IconProps) => React.JSX.Element }[] = [
  { id: "dark", label: "Dark", Icon: MoonIcon },
  { id: "light", label: "Light", Icon: SunIcon },
  { id: "oled", label: "OLED Black", Icon: OledIcon },
  { id: "dim", label: "Dim", Icon: DimIcon },
];

const SETTINGS_SECTIONS = [
  { id: "general", label: "General", Icon: HomeIcon },
  { id: "library", label: "Library", Icon: FolderIcon },
  { id: "metadata", label: "Metadata", Icon: SparkleIcon },
  { id: "playback", label: "Playback", Icon: PlayIcon },
  { id: "appearance", label: "Appearance", Icon: PaletteIcon },
  { id: "data", label: "Data & Storage", Icon: DatabaseIcon },
  { id: "about", label: "About", Icon: InfoIcon },
];

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

const LOCAL_POSTER_NAMES = ["poster", "cover", "folder", "thumb", "fanart"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

function findLocalPoster(folderContents: any[], folderPath: string): string | undefined {
  for (const file of folderContents) {
    if (!file.isDirectory && file.name) {
      const lower = file.name.toLowerCase();
      const isImage = IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
      const isPosterName = LOCAL_POSTER_NAMES.some((name) => lower.includes(name));

      if (isImage && isPosterName) {
        const cleanPath = `${folderPath.replace(/[/\\]+$/, "")}/${file.name}`;
        return convertFileSrc(cleanPath);
      }
    }
  }
  return undefined;
}

// --------------------------------------------------
// HELPERS & LOCAL STORAGE
// --------------------------------------------------
function getEpisodeNumber(filename: string): number | null {
  const patterns = [
    /[sS]\d+[eE](\d+)/,
    /[eE](\d+)/,
    /\s-\s(\d+)\s/,
    /\[(\d{1,4})\]/,
    /_(\d+)\.[^.]+$/,
    /\b(\d{1,4})\b(?=\.[^.]+$)/
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }
  return null;
}

/** Promotes v1 records (watched:boolean only) to the v2 shape. */
function migrateProgressRecord(rec: any): EpisodeProgress {
  const seconds = typeof rec?.progressSeconds === "number" ? rec.progressSeconds : 0;
  const durationSeconds = typeof rec?.durationSeconds === "number" ? rec.durationSeconds : null;
  let status: WatchStatus = rec?.status;
  if (status !== "unwatched" && status !== "in_progress" && status !== "completed") {
    status = rec?.watched ? "completed" : seconds > 3 ? "in_progress" : "unwatched";
  }
  // One-time repair for records clobbered by the round-3 unmount bug: opened
  // (playCount > 0) but stamped unwatched with no position. Promote them back
  // so Continue Watching repopulates without re-watching anything.
  if (status === "unwatched" && seconds === 0 && typeof rec?.playCount === "number" && rec.playCount > 0) {
    status = "in_progress";
  }
  return {
    episodePath: String(rec?.episodePath ?? ""),
    watched: status === "completed",
    lastOpenedAt: typeof rec?.lastOpenedAt === "number" ? rec.lastOpenedAt : 0,
    progress:
      typeof rec?.progress === "number" && rec.progress > 0
        ? rec.progress
        : durationSeconds
          ? Math.min(1, seconds / durationSeconds)
          : 0,
    duration: durationSeconds,
    progressSeconds: seconds,
    durationSeconds,
    status,
    playCount: typeof rec?.playCount === "number" ? rec.playCount : rec?.watched ? 1 : 0,
  };
}

function loadEpisodeProgress(): EpisodeProgressMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(EPISODE_PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || Array.isArray(parsed) || !parsed) return {};
    const out: EpisodeProgressMap = {};
    for (const [key, value] of Object.entries(parsed)) out[key] = migrateProgressRecord(value);
    return out;
  } catch {
    return {};
  }
}

function loadMetadataCache(): Map<string, AnimeMetadata> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(METADATA_CACHE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function saveMetadataCache(cache: Map<string, AnimeMetadata>) {
  try {
    const obj = Object.fromEntries(cache);
    window.localStorage.setItem(METADATA_CACHE_KEY, JSON.stringify(obj));
  } catch (error) {
    console.warn("AnimeOffline: failed to save metadata cache:", error);
  }
}

function loadFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadTheme(): ThemeName {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = window.localStorage.getItem(THEME_KEY) as ThemeName | null;
    return THEME_OPTIONS.some((t) => t.id === raw) ? (raw as ThemeName) : "dark";
  } catch {
    return "dark";
  }
}

function loadDefaultPage(): Page {
  if (typeof window === "undefined") return "home";
  try {
    const raw = window.localStorage.getItem(DEFAULT_PAGE_KEY) as Page | null;
    return raw === "favorites" || raw === "history" ? raw : "home";
  } catch {
    return "home";
  }
}

function loadDensity(): Density {
  if (typeof window === "undefined") return "cozy";
  try {
    const raw = window.localStorage.getItem(DENSITY_KEY) as Density | null;
    return raw === "compact" || raw === "large" ? raw : "cozy";
  } catch {
    return "cozy";
  }
}

function loadShowContinue(): boolean {
  if (typeof window === "undefined") return true;
  try { return window.localStorage.getItem(SHOW_CW_KEY) !== "0"; } catch { return true; }
}

function loadReduceMotion(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(MOTION_KEY) === "1"; } catch { return false; }
}

function loadAccent(): AccentName {
  if (typeof window === "undefined") return "violet";
  try {
    const raw = window.localStorage.getItem(ACCENT_KEY);
    return ACCENT_PRESETS.some((p) => p.id === raw) ? (raw as AccentName) : "violet";
  } catch {
    return "violet";
  }
}

function loadPreferredPlayer(): PlayerPref {
  if (typeof window === "undefined") return "builtin";
  try {
    return window.localStorage.getItem(PLAYER_KEY) === "mpv" ? "mpv" : "builtin";
  } catch {
    return "builtin";
  }
}

function loadPlayerAutoHandoff(): FallbackPref {
  if (typeof window === "undefined") return "ask";
  try {
    return window.localStorage.getItem(PLAYER_FALLBACK_KEY) === "auto" ? "auto" : "ask";
  } catch {
    return "ask";
  }
}

function loadAutoNext(): boolean {
  if (typeof window === "undefined") return true;
  try { return window.localStorage.getItem(AUTONEXT_KEY) !== "0"; } catch { return true; }
}
function loadCompleteAt(): number {
  if (typeof window === "undefined") return 90;
  try {
    const v = Number(window.localStorage.getItem(COMPLETE_AT_KEY));
    return v === 85 || v === 90 || v === 95 ? v : 90;
  } catch { return 90; }
}
function loadRememberPrefs(): boolean {
  if (typeof window === "undefined") return true;
  try { return window.localStorage.getItem(REMEMBER_PREFS_KEY) !== "0"; } catch { return true; }
}
function loadPlaybackPrefs(): { volume: number; rate: number } {
  if (typeof window === "undefined") return { volume: 1, rate: 1 };
  try {
    const raw = window.localStorage.getItem(PLAYBACK_PREFS_KEY);
    if (!raw) return { volume: 1, rate: 1 };
    const p = JSON.parse(raw);
    return {
      volume: typeof p?.volume === "number" ? Math.min(1, Math.max(0, p.volume)) : 1,
      rate: typeof p?.rate === "number" ? p.rate : 1,
    };
  } catch { return { volume: 1, rate: 1 }; }
}

function loadSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60_000, hour = 3_600_000, day = 86_400_000;
  if (diff < minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < day * 2) return "Yesterday";
  if (diff < day * 7) return `${Math.floor(diff / day)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatRating(rating: number): string {
  return (Math.round(rating * 10) / 10).toFixed(1);
}

/* ---------------------------------------------------------------------------
   Item 21 — relink engine.
   Every storage key (watch progress, favorites, metadata cache) is an absolute
   path, so moving the library to another drive letter or folder used to orphan
   all of it. After each scan we rebuild an index of what actually exists on
   disk, relative to the library root, and re-match dangling keys by suffix
   (series folder + everything under it). Longest suffix wins, matches must sit
   on a path-separator boundary, and a key that already resolves is untouched.
   --------------------------------------------------------------------------- */
function normPath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

function relFrom(root: string, abs: string): string {
  const r = normPath(root).replace(/\/+$/, "");
  const a = normPath(abs);
  return a.startsWith(r + "/") ? a.slice(r.length + 1) : a;
}

interface RelinkIndex {
  exact: Set<string>;
  bySuffix: { rel: string; abs: string }[];
}

function buildRelinkIndex(root: string, entries: { abs: string }[]): RelinkIndex {
  const list = entries.map((e) => ({ rel: relFrom(root, e.abs), abs: e.abs }));
  list.sort((a, b) => b.rel.length - a.rel.length);
  return { exact: new Set(list.map((l) => normPath(l.abs))), bySuffix: list };
}

function matchRelink(index: RelinkIndex, key: string): string | null {
  const nk = normPath(key);
  if (index.exact.has(nk)) return null;
  for (const cand of index.bySuffix) {
    if (!nk.endsWith(cand.rel)) continue;
    const before = nk[nk.length - cand.rel.length - 1];
    if (before === undefined || before === "/") return cand.abs;
  }
  return null;
}

function computeRenames(keys: string[], index: RelinkIndex): Record<string, string> {
  const out: Record<string, string> = {};
  // Guards against two stale keys claiming the same file. Deliberately NOT
  // seeded with index.exact: the rename targets are scanned paths by
  // definition, and live-key collisions are handled by the apply step.
  const taken = new Set<string>();
  for (const k of keys) {
    const t = matchRelink(index, k);
    if (t && !taken.has(normPath(t))) {
      out[k] = t;
      taken.add(normPath(t));
    }
  }
  return out;
}

/**
 * Item 20 — offline metadata. Kodi-style .nfo files (`<movie>` / `<tvshow>`)
 * are parsed locally with DOMParser so unmatched folders still get a title,
 * year, plot, genres, studio and tags with zero network access.
 */
function parseNfoMetadata(xml: string, folderName: string): AnimeMetadata | null {
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    if (doc.querySelector("parsererror") || !doc.documentElement) return null;
    const root = doc.documentElement;
    const text = (sel: string) => root.querySelector(sel)?.textContent?.trim() || "";
    const list = (sel: string, limit?: number) =>
      Array.from(root.querySelectorAll(sel))
        .map((n) => n.textContent?.trim() || "")
        .filter(Boolean)
        .slice(0, limit ?? 99);
    const premieredYear = (text("premiered").match(/(\d{4})/) || [])[1] || "";
    const seasonFromFolder = /Season\s+(\d+)/i.exec(folderName)?.[0];
    return {
      title: text("title") || folderName,
      alternativeTitles: [text("originaltitle"), text("sorttitle")].filter(Boolean),
      synopsis: text("plot") || text("outline") || `Local anime collection: ${folderName}`,
      episodeCount: parseInt(text("episode"), 10) || 0,
      duration: parseInt(text("runtime"), 10) || 24,
      rating: 0,
      genres: list("genre"),
      tags: list("tag", 6),
      status: "Completed",
      season: text("season") ? `Season ${text("season")}` : seasonFromFolder || "Season 1",
      year: parseInt(text("year"), 10) || parseInt(premieredYear, 10) || new Date().getFullYear(),
      studio: text("studio") || text("company") || "Local Folder",
    };
  } catch {
    return null;
  }
}

/**
 * AniList and Jikan both return genres alphabetically, which is why every card
 * read "Action, Drama". This ordering puts the genres that actually define a
 * show first (an action-heavy title leads with Action) and pushes the
 * everything-buckets (Drama, Comedy, Slice of Life) to the back.
 */
const GENRE_PROMINENCE = [
  "Action", "Mecha", "Sports", "Horror", "Mystery", "Psychological", "Thriller",
  "Romance", "Sci-Fi", "Fantasy", "Adventure", "Supernatural", "Music", "Ecchi",
  "Harem", "Iyashikei", "Avant Garde", "Comedy", "Drama", "Slice of Life",
  "Mahou Shoujo", "Kids", "Shounen", "Shoujo", "Seinen", "Josei",
];

function orderGenres(genres: string[]): string[] {
  const rank = (g: string) => {
    const i = GENRE_PROMINENCE.indexOf(g);
    return i === -1 ? GENRE_PROMINENCE.length : i;
  };
  return [...genres].sort((a, b) => rank(a) - rank(b));
}

/**
 * Width for the per-episode bar. mpv-handed-off episodes never report a
 * duration, so "started but unknown" gets a small hint segment instead of a
 * fabricated percentage.
 */
function episodeProgressPct(rec: EpisodeProgress | undefined): string {
  if (!rec || rec.status === "unwatched") return "0%";
  if (rec.status === "completed") return "100%";
  if (rec.durationSeconds && rec.durationSeconds > 0) {
    return `${Math.min(100, Math.round((rec.progressSeconds / rec.durationSeconds) * 100))}%`;
  }
  return "10%";
}

function episodeProgressLabel(rec: EpisodeProgress | undefined): string {
  if (!rec || rec.status === "unwatched") return "Not started";
  if (rec.status === "completed") {
    return rec.durationSeconds ? `Watched · ${formatClock(rec.durationSeconds)}` : "Watched";
  }
  if (rec.durationSeconds && rec.durationSeconds > 0) {
    return `${formatClock(rec.progressSeconds)} / ${formatClock(rec.durationSeconds)} · ${formatRelativeTime(rec.lastOpenedAt)}`;
  }
  return "In progress";
}

interface Chip { label: string; isTag: boolean }

/**
 * Card mode: 2 defining genres + 2 ranked tags (or 4 genres when there are no
 * tags, e.g. pre-existing caches). Full mode: every genre + up to 6 tags.
 */
function chipList(meta: AnimeMetadata | undefined, mode: "card" | "full"): Chip[] {
  if (!meta) return [];
  const genres = orderGenres(meta.genres || []);
  const tags = (meta.tags || []).filter((t) => !genres.includes(t));
  if (mode === "full") {
    return [
      ...genres.map((g) => ({ label: g, isTag: false })),
      ...tags.slice(0, 6).map((t) => ({ label: t, isTag: true })),
    ];
  }
  if (tags.length === 0) return genres.slice(0, 4).map((g) => ({ label: g, isTag: false }));
  return [
    ...genres.slice(0, 2).map((g) => ({ label: g, isTag: false })),
    ...tags.slice(0, 2).map((t) => ({ label: t, isTag: true })),
  ];
}

function getSeriesWatchStats(anime: AnimeFolder, watchProgress: EpisodeProgressMap) {
  const total = anime.episodes.length;
  const watchedCount = anime.episodes.filter((ep) => watchProgress[ep.path]?.status === "completed").length;
  const isComplete = total > 0 && watchedCount >= total;
  const percent = total > 0 ? Math.min(100, Math.round((watchedCount / total) * 100)) : 0;
  return { total, watchedCount, isComplete, percent };
}

function isVideoFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function extractBasicMetadata(folder: AnimeFolder): AnimeMetadata {
  const folderName = folder.name;
  const yearMatch = folderName.match(/\((\d{4})\)/);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

  const seasonMatch = folderName.match(/Season\s+(\d+)/i);
  const season = seasonMatch ? `Season ${seasonMatch[1]}` : "Season 1";

  return {
    title: folderName.replace(/\[.*?\]/g, "").trim() || folderName,
    alternativeTitles: [],
    synopsis: `Local anime collection: ${folderName}`,
    episodeCount: folder.episodes.length,
    duration: 24,
    rating: 0,
    genres: [],
    tags: [],
    status: "Completed",
    season: season,
    year: year,
    studio: "Local Folder",
  };
}

// --------------------------------------------------
// METADATA PROVIDERS & DISK SYNC
// --------------------------------------------------

async function fetchAniListMetadata(query: string): Promise<AnimeMetadata[]> {
  const graphqlQuery = `
    query ($search: String) {
      Page(perPage: 5) {
        media(search: $search, type: ANIME) {
          id
          title { romaji english native }
          description
          episodes
          duration
          averageScore
          genres
          tags { name rank isMediaSpoiler }
          status
          season
          seasonYear
          studios(isMain: true) { nodes { name } }
          coverImage { extraLarge large }
        }
      }
    }
  `;

  try {
    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: graphqlQuery, variables: { search: query } }),
    });

    if (!response.ok) return [];

    const json = await response.json();
    const mediaList = json?.data?.Page?.media || [];

    return mediaList.map((item: any) => ({
      title: item.title?.english || item.title?.romaji || query,
      alternativeTitles: [item.title?.romaji, item.title?.native].filter(Boolean),
      synopsis: item.description ? item.description.replace(/<[^>]*>?/gm, "") : "No synopsis available.",
      episodeCount: item.episodes || 0,
      duration: item.duration || 24,
      rating: item.averageScore ? item.averageScore / 10 : 0,
      genres: item.genres || [],
      tags: (item.tags || [])
        .filter((t: any) => t && t.name && !t.isMediaSpoiler && typeof t.rank === "number" && t.rank >= 55)
        .sort((a: any, b: any) => b.rank - a.rank)
        .slice(0, 6)
        .map((t: any) => String(t.name)),
      status: item.status === "FINISHED" ? "Completed" : "Airing",
      season: item.season && item.seasonYear ? `${item.season} ${item.seasonYear}` : "Unknown",
      year: item.seasonYear || new Date().getFullYear(),
      studio: item.studios?.nodes?.[0]?.name || "Unknown",
      posterUrl: item.coverImage?.extraLarge || item.coverImage?.large,
    }));
  } catch (err) {
    return [];
  }
}

async function fetchJikanMetadata(query: string): Promise<AnimeMetadata[]> {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`);
    if (!res.ok) return [];

    const json = await res.json();
    return (json.data || []).map((item: any) => ({
      title: item.title_english || item.title || query,
      alternativeTitles: [item.title_japanese, item.title_english].filter(Boolean),
      synopsis: item.synopsis ? item.synopsis.replace(/<[^>]*>?/gm, "") : "No synopsis available.",
      episodeCount: item.episodes || 0,
      duration: item.duration ? parseInt(item.duration) || 24 : 24,
      rating: item.score || 0,
      genres: item.genres?.map((g: any) => g.name) || [],
      tags: [...(item.themes || []), ...(item.demographics || [])]
        .map((g: any) => g?.name)
        .filter(Boolean)
        .slice(0, 6),
      status: item.status === "Finished Airing" ? "Completed" : "Airing",
      season: item.season ? `${item.season} ${item.year || ""}`.trim() : "Unknown",
      year: item.year || new Date().getFullYear(),
      studio: item.studios?.[0]?.name || "Unknown",
      posterUrl: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url,
    }));
  } catch (err) {
    return [];
  }
}

async function matchAnimeMetadata(folder: AnimeFolder): Promise<{ metadata: AnimeMetadata; matchConfidence: number }> {
  const cleanSearchTerm = folder.name
    .replace(/\(\d{4}\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/v\d+/gi, "")
    .trim();

  let results = await fetchAniListMetadata(cleanSearchTerm);
  if (results.length > 0) return { metadata: results[0], matchConfidence: 95 };

  results = await fetchJikanMetadata(cleanSearchTerm);
  if (results.length > 0) return { metadata: results[0], matchConfidence: 85 };

  return { metadata: extractBasicMetadata(folder), matchConfidence: 30 };
}

async function saveMetadataToDisk(folderPath: string, metadata: AnimeMetadata) {
  try {
    await invoke("save_anilist_metadata", {
      path: folderPath,
      data: {
        anilist_id: 0,
        title: metadata.title,
        title_romaji: metadata.alternativeTitles[0] || null,
        title_english: metadata.title,
        title_native: null,
        description: metadata.synopsis,
        episodes: metadata.episodeCount,
        duration: metadata.duration,
        season: metadata.season,
        season_year: metadata.year,
        genres: metadata.genres,
        status: metadata.status,
        format: "TV",
        poster_url: metadata.posterUrl,
        banner_url: null,
        studio: metadata.studio,
        metadata_source: "Multi-Source",
      },
    });
  } catch (err) {
    console.error("Failed to write animeoffline.json to disk:", err);
  }
}

// --------------------------------------------------
// MAIN APP COMPONENT
// --------------------------------------------------

function App() {
  const [libraryPath, setLibraryPath] = useState<string | null>(null);
  const [animeFolders, setAnimeFolders] = useState<AnimeFolder[]>([]);
  const [scanning, setScanning] = useState(false);
  const [, setScanMessage] = useState("Checking for saved library...");
  const [currentPage, setCurrentPage] = useState<Page>(() => loadDefaultPage());
  const [selectedAnime, setSelectedAnime] = useState<AnimeFolder | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => loadSidebarCollapsed());
  const [metadataCache, setMetadataCache] = useState<Map<string, AnimeMetadata>>(() => loadMetadataCache());
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
  const [matching, setMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState({ current: 0, total: 0 });

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Completed" | "Airing" | "Not yet released">("All");
  const [genreFilter, setGenreFilter] = useState<string>("All");
  const [matchFilter, setMatchFilter] = useState<"All" | "Matched" | "Unmatched">("All");
  const [sortBy, setSortBy] = useState<"title" | "rating" | "year" | "episodes">("title");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const manualSearchInputRef = useRef<HTMLInputElement>(null);
  const settingsScrollRef = useRef<HTMLDivElement>(null);
  // FIX: the scan-message timer used to be a bare setTimeout(), which survived
  // unmount and could fire after a second scan had already started.
  const scanTimer = useRef<number | null>(null);
  const [activeSettingsSection, setActiveSettingsSection] = useState("library");

  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [manualSearchResults, setManualSearchResults] = useState<AnimeMetadata[]>([]);
  const [isSearchingManual, setIsSearchingManual] = useState(false);

  const [notice, setNotice] = useState<Notice | null>(null);
  const [toastMessage, setToastMessage] = useState<string>("");
  const [isToastVisible, setIsToastVisible] = useState(false);

  const [watchProgress, setWatchProgress] = useState<EpisodeProgressMap>(() => loadEpisodeProgress());
  const BACKUP_KEYS = [EPISODE_PROGRESS_KEY, METADATA_CACHE_KEY, FAVORITES_KEY, THEME_KEY, SIDEBAR_KEY, ACCENT_KEY];
  // Last snapshot pushed to / pulled from SQLite, used for diffing writes.
  const lastSyncedProgress = useRef<EpisodeProgressMap | null>(null);
  const dbHydrated = useRef(false);
  const [theme, setTheme] = useState<ThemeName>(() => loadTheme());
  const [accent, setAccent] = useState<AccentName>(() => loadAccent());
  const [defaultPage, setDefaultPage] = useState<Page>(() => loadDefaultPage());
  const [density, setDensity] = useState<Density>(() => loadDensity());
  const [showContinue, setShowContinue] = useState<boolean>(() => loadShowContinue());
  const [reduceMotion, setReduceMotion] = useState<boolean>(() => loadReduceMotion());
  const [preferredPlayer, setPreferredPlayer] = useState<PlayerPref>(() => loadPreferredPlayer());
  const [playerAutoHandoff, setPlayerAutoHandoff] = useState<FallbackPref>(() => loadPlayerAutoHandoff());
  const [autoNext, setAutoNext] = useState<boolean>(() => loadAutoNext());
  const [completeAtPct, setCompleteAtPct] = useState<number>(() => loadCompleteAt());
  const [rememberPlayback, setRememberPlayback] = useState<boolean>(() => loadRememberPrefs());
  const [playbackPrefs, setPlaybackPrefs] = useState<{ volume: number; rate: number }>(() => loadPlaybackPrefs());
  const [mpvPath, setMpvPath] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editSeconds, setEditSeconds] = useState(0);

  const totalEpisodes = animeFolders.reduce((total, anime) => total + anime.episodes.length, 0);
  const emptyFolders = animeFolders.filter((anime) => anime.episodes.length === 0).length;
  const matchedCount = animeFolders.filter((anime) => anime.isMatched).length;
  const matchedPercent = animeFolders.length ? Math.round((matchedCount / animeFolders.length) * 100) : 0;

  const allHistory = Object.values(watchProgress)
    .reduce((acc, progress) => {
      for (const anime of animeFolders) {
        const episode = anime.episodes.find((ep) => ep.path === progress.episodePath);
        if (episode) {
          const existing = acc.find((item) => item.animeName === anime.name);
          if (!existing || progress.lastOpenedAt > existing.progress.lastOpenedAt) {
            if (existing) {
              const index = acc.indexOf(existing);
              acc[index] = { animeName: anime.name, episode, progress, anime };
            } else {
              acc.push({ animeName: anime.name, episode, progress, anime });
            }
          }
        }
      }
      return acc;
    }, [] as { animeName: string; episode: Episode; progress: EpisodeProgress; anime: AnimeFolder }[])
    .sort((a, b) => b.progress.lastOpenedAt - a.progress.lastOpenedAt);

  // Item 17, take two: series-level Continue Watching.
  // Round 3 deduped history to ONE episode per series and then filtered by
  // status — so finishing any single episode made its representative record
  // "completed" and hid the whole show. A title now stays in the strip until
  // the entire series is completed: resume the in-progress episode, or queue
  // the next unwatched one once the latest is finished.
  const continueWatching = animeFolders
    .map((anime) => {
      const touched = anime.episodes
        .map((episode) => ({ episode, rec: watchProgress[episode.path] }))
        .filter((x) => x.rec && x.rec.status !== "unwatched");
      if (touched.length === 0) return null;
      const allDone =
        touched.length === anime.episodes.length &&
        touched.every((x) => x.rec!.status === "completed");
      if (allDone) return null;
      const inProgress = touched
        .filter((x) => x.rec!.status === "in_progress")
        .sort((a, b) => b.rec!.lastOpenedAt - a.rec!.lastOpenedAt)[0];
      const nextUp = anime.episodes.find(
        (episode) => !watchProgress[episode.path] || watchProgress[episode.path].status === "unwatched"
      );
      const pickEpisode = inProgress?.episode ?? nextUp;
      if (!pickEpisode) return null;
      const latestAt = touched.reduce((m, x) => Math.max(m, x.rec!.lastOpenedAt), 0);
      const progress: EpisodeProgress = watchProgress[pickEpisode.path] ?? {
        episodePath: pickEpisode.path,
        watched: false,
        lastOpenedAt: latestAt,
        progress: 0,
        duration: null,
        progressSeconds: 0,
        durationSeconds: null,
        status: "unwatched",
        playCount: 0,
      };
      return { animeName: anime.name, episode: pickEpisode, progress, anime };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.progress.lastOpenedAt - a.progress.lastOpenedAt)
    .slice(0, 8);

  // FIX: clear the scan timer if the app unmounts mid-flight.
  useEffect(() => {
    return () => {
      if (scanTimer.current != null) window.clearTimeout(scanTimer.current);
    };
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(EPISODE_PROGRESS_KEY, JSON.stringify(watchProgress)); }
    catch (error) { console.warn("AnimeOffline: failed to save watch progress:", error); }
  }, [watchProgress]);

  // Item 15, write-through: localStorage stays the synchronous cache, SQLite is
  // the source of truth. Every change (player ticks, menus, migrations) is
  // diffed against the last synced snapshot and persisted, debounced so a
  // scrubbing player can't flood the database.
  useEffect(() => {
    const previous = lastSyncedProgress.current;
    lastSyncedProgress.current = watchProgress;
    if (previous === null) return;
    const changed = Object.entries(watchProgress)
      .filter(([key, value]) => previous[key] !== value)
      .map(([, value]) => value);
    const deleted = Object.keys(previous).filter((key) => !(key in watchProgress));
    if (changed.length === 0 && deleted.length === 0) return;
    const timer = window.setTimeout(() => {
      for (const rec of changed) void invoke("save_watch_record", { record: rec }).catch(() => undefined);
      for (const path of deleted) void invoke("delete_watch_record", { path }).catch(() => undefined);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [watchProgress]);

  // Item 15, hydrate: reconcile SQLite against the localStorage cache on
  // launch. Newest lastOpenedAt wins per episode; records only one side knows
  // about are pushed back to the database so nothing is ever lost.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await invoke<EpisodeProgress[]>("load_watch_records");
        if (!cancelled) {
          const local = lastSyncedProgress.current ?? {};
          const merged: EpisodeProgressMap = { ...local };
          const pushBack: EpisodeProgress[] = [];
          const inDb = new Set(rows.map((r) => r.episodePath));
          for (const row of rows) {
            const mine = local[row.episodePath];
            if (!mine || row.lastOpenedAt >= mine.lastOpenedAt) merged[row.episodePath] = row;
            else pushBack.push(mine);
          }
          for (const [key, value] of Object.entries(local)) {
            if (!inDb.has(key)) pushBack.push(value);
          }
          setWatchProgress(merged);
          if (pushBack.length > 0) {
            window.setTimeout(() => {
              for (const rec of pushBack) void invoke("save_watch_record", { record: rec }).catch(() => undefined);
            }, 0);
          }
        }
      } catch {
        /* database unavailable — localStorage-only mode */
      }
      try {
        const dbFavorites = await invoke<string[]>("load_favorites");
        if (!cancelled) setFavorites((localFavs) => Array.from(new Set([...localFavs, ...dbFavorites])));
      } catch {
        /* ignore */
      }
      dbHydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); }
    catch (error) { console.warn("AnimeOffline: failed to save favorites:", error); }
    // Skipped until hydration finishes, so the mount write can't clobber
    // favorites that only the database knows about.
    if (dbHydrated.current) void invoke("save_favorites", { paths: favorites }).catch(() => undefined);
  }, [favorites]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { window.localStorage.setItem(THEME_KEY, theme); }
    catch (error) { console.warn("AnimeOffline: failed to save theme:", error); }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
    try { window.localStorage.setItem(ACCENT_KEY, accent); }
    catch (error) { console.warn("AnimeOffline: failed to save accent:", error); }
  }, [accent]);

  useEffect(() => {
    try { window.localStorage.setItem(PLAYER_KEY, preferredPlayer); }
    catch { /* ignore */ }
  }, [preferredPlayer]);

  useEffect(() => {
    try { window.localStorage.setItem(PLAYER_FALLBACK_KEY, playerAutoHandoff); }
    catch { /* ignore */ }
  }, [playerAutoHandoff]);

  useEffect(() => {
    try { window.localStorage.setItem(AUTONEXT_KEY, autoNext ? "1" : "0"); }
    catch { /* ignore */ }
  }, [autoNext]);

  useEffect(() => {
    try { window.localStorage.setItem(COMPLETE_AT_KEY, String(completeAtPct)); }
    catch { /* ignore */ }
  }, [completeAtPct]);

  useEffect(() => {
    try { window.localStorage.setItem(REMEMBER_PREFS_KEY, rememberPlayback ? "1" : "0"); }
    catch { /* ignore */ }
  }, [rememberPlayback]);

  useEffect(() => {
    if (!rememberPlayback) return;
    try { window.localStorage.setItem(PLAYBACK_PREFS_KEY, JSON.stringify(playbackPrefs)); }
    catch { /* ignore */ }
  }, [playbackPrefs, rememberPlayback]);

  useEffect(() => {
    try { window.localStorage.setItem(SIDEBAR_KEY, isSidebarCollapsed ? "1" : "0"); }
    catch { /* ignore */ }
  }, [isSidebarCollapsed]);

  useEffect(() => { document.title = "KuraPlay"; }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
    try { window.localStorage.setItem(DENSITY_KEY, density); }
    catch { /* ignore */ }
  }, [density]);

  useEffect(() => {
    document.documentElement.setAttribute("data-motion", reduceMotion ? "reduced" : "full");
    try { window.localStorage.setItem(MOTION_KEY, reduceMotion ? "1" : "0"); }
    catch { /* ignore */ }
  }, [reduceMotion]);

  useEffect(() => {
    try { window.localStorage.setItem(DEFAULT_PAGE_KEY, defaultPage); }
    catch { /* ignore */ }
  }, [defaultPage]);

  useEffect(() => {
    try { window.localStorage.setItem(SHOW_CW_KEY, showContinue ? "1" : "0"); }
    catch { /* ignore */ }
  }, [showContinue]);

  useEffect(() => {
    function handleGlobalKeydown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "k" && (currentPage === "home" || currentPage === "favorites") && !selectedAnime) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (key === "b") {
        e.preventDefault();
        setIsSidebarCollapsed((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleGlobalKeydown);
    return () => window.removeEventListener("keydown", handleGlobalKeydown);
  }, [currentPage, selectedAnime]);

  useEffect(() => {
    if (!isSearchModalOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsSearchModalOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    const focusTimer = setTimeout(() => manualSearchInputRef.current?.focus(), 60);
    return () => { window.removeEventListener("keydown", handleKey); clearTimeout(focusTimer); };
  }, [isSearchModalOpen]);

  useEffect(() => {
    async function loadSavedLibrary() {
      try {
        const result = await invoke<any>("load_library_path");
        let savedPath = null;
        if (typeof result === "string") {
          savedPath = result;
        } else if (result && typeof result === "object" && result.library_path) {
          savedPath = result.library_path;
        }

        if (!savedPath) {
          setScanMessage("No library selected. Add your anime library to get started.");
          return;
        }

        setLibraryPath(savedPath);
        setScanMessage(`Loading library: ${savedPath}`);
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        await scanLibrary(savedPath);
        // FIX: tracked in a ref so it is cancelled on unmount instead of
        // firing into a component that no longer exists.
        if (scanTimer.current != null) window.clearTimeout(scanTimer.current);
        scanTimer.current = window.setTimeout(() => {
          scanTimer.current = null;
          setScanMessage("");
        }, 4000);
      } catch (error) {
        setScanMessage(`Failed to load library: ${String(error)}`);
      }
    }
    loadSavedLibrary();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  function notify(type: NoticeType, text: string) { setNotice({ id: Date.now(), type, text }); }

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setIsToastVisible(true);
  };

  const toggleFavorite = (folderPath: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setFavorites((prev) => {
      if (prev.includes(folderPath)) {
        showToast("Removed from Favorites");
        return prev.filter((p) => p !== folderPath);
      } else {
        showToast("Added to Favorites");
        return [...prev, folderPath];
      }
    });
  };

  const pickRandomAnime = () => {
    if (animeFolders.length === 0) return;
    const randomAnime = animeFolders[Math.floor(Math.random() * animeFolders.length)];
    setSelectedAnime(randomAnime);
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setStatusFilter("All");
    setGenreFilter("All");
    setMatchFilter("All");
    setSortBy("title");
  };

  const handleClearMetadataCache = () => {
    if (!window.confirm("Clear all cached metadata? You'll need to re-match anime to fetch it again.")) return;
    setMetadataCache(new Map());
    try { window.localStorage.removeItem(METADATA_CACHE_KEY); } catch { /* ignore */ }
    showToast("Metadata cache cleared.");
  };

  const handleClearWatchHistory = () => {
    if (!window.confirm("Clear all watch history? This can't be undone.")) return;
    setWatchProgress({});
    showToast("Watch history cleared.");
  };

  const handleClearFavorites = () => {
    if (favorites.length === 0) return;
    if (!window.confirm("Remove all favorites?")) return;
    setFavorites([]);
    showToast("Favorites cleared.");
  };

  async function exportBackup() {
    try {
      const target = await saveDialog({
        defaultPath: `kuraplay-backup-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!target) return;
      const data: Record<string, unknown> = {};
      for (const key of BACKUP_KEYS) {
        const raw = window.localStorage.getItem(key);
        if (raw) data[key] = JSON.parse(raw);
      }
      const payload = { app: "kuraplay", version: 1, exportedAt: new Date().toISOString(), data };
      await writeTextFile(target, JSON.stringify(payload, null, 2));
      showToast("Backup exported.");
    } catch (error) {
      notify("error", "Export failed:\n\n" + String(error));
    }
  }

  async function importBackup() {
    try {
      const source = await open({
        multiple: false,
        title: "Choose a backup file",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof source !== "string") return;
      const parsed = JSON.parse(await readTextFile(source));
      if (!["kuraplay", "anivault", "animeoffline"].includes(parsed?.app) || typeof parsed.data !== "object" || !parsed.data) {
        notify("error", "That file is not an AnimeOffline backup.");
        return;
      }
      for (const key of BACKUP_KEYS) {
        if (key in parsed.data) window.localStorage.setItem(key, JSON.stringify(parsed.data[key]));
      }
      setWatchProgress(loadEpisodeProgress());
      setFavorites(loadFavorites());
      setMetadataCache(loadMetadataCache());
      setTheme(loadTheme());
      setAccent(loadAccent());
      setIsSidebarCollapsed(loadSidebarCollapsed());
      showToast("Backup restored.");
    } catch (error) {
      notify("error", "Import failed:\n\n" + String(error));
    }
  }

  const goToPage = (page: Page) => {
    setSelectedAnime(null);
    setCurrentPage(page);
  };

  const scrollToSettingsSection = (id: string) => {
    const el = document.getElementById(`settings-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSettingsSection(id);
  };

  const handleSettingsScroll = () => {
    const container = settingsScrollRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    let current = SETTINGS_SECTIONS[0].id;
    for (const section of SETTINGS_SECTIONS) {
      const el = document.getElementById(`settings-${section.id}`);
      if (el && el.getBoundingClientRect().top - containerTop <= 140) current = section.id;
    }
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 4) {
      current = SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id;
    }
    setActiveSettingsSection(current);
  };

  // --------------------------------------------------
  // PLAYBACK — built-in player first, mpv as the escape hatch
  // --------------------------------------------------
  const [nowPlaying, setNowPlaying] = useState<{ anime: AnimeFolder; index: number } | null>(null);

  function openPlayerFor(anime: AnimeFolder, episode: Episode) {
    const index = anime.episodes.findIndex((ep) => ep.path === episode.path);
    if (index === -1) return;
    // Stamp in_progress immediately so Continue Watching picks it up even if
    // the player is closed before the first timeupdate tick.
    setWatchProgress((prev) => {
      const old = prev[episode.path];
      return {
        ...prev,
        [episode.path]: {
          episodePath: episode.path,
          watched: old?.watched ?? false,
          lastOpenedAt: Date.now(),
          progress: old?.progress ?? 0,
          duration: old?.duration ?? null,
          progressSeconds: old?.progressSeconds ?? 0,
          durationSeconds: old?.durationSeconds ?? null,
          status: old && old.status !== "unwatched" ? old.status : "in_progress",
          playCount: (old?.playCount ?? 0) + (old && old.status !== "unwatched" ? 0 : 1),
        },
      };
    });
    launchPlayer(anime, episode, index);
  }

  function launchPlayer(anime: AnimeFolder, episode: Episode, index?: number) {
    const idx = index ?? anime.episodes.findIndex((ep) => ep.path === episode.path);
    if (idx === -1) return;
    if (preferredPlayer === "mpv") {
      void playInMpv(episode.path, watchProgress[episode.path]?.progressSeconds ?? 0);
      return;
    }
    setNowPlaying({ anime, index: idx });
  }

  /** Single writer for episode records; patch=null deletes the record. */
  function writeRecord(path: string, patch: Partial<EpisodeProgress> | null) {
    setWatchProgress((prev) => {
      const nextMap = { ...prev };
      if (patch === null) {
        delete nextMap[path];
        return nextMap;
      }
      const old = prev[path];
      nextMap[path] = {
        episodePath: path,
        watched: false,
        lastOpenedAt: Date.now(),
        progress: 0,
        duration: old?.duration ?? null,
        progressSeconds: 0,
        durationSeconds: old?.durationSeconds ?? null,
        status: "unwatched",
        playCount: old?.playCount ?? 0,
        ...patch,
      };
      return nextMap;
    });
  }

  function rewatchEpisode(anime: AnimeFolder, episode: Episode) {
    const old = watchProgress[episode.path];
    writeRecord(episode.path, {
      watched: false,
      progress: 0,
      progressSeconds: 0,
      durationSeconds: old?.durationSeconds ?? null,
      duration: old?.duration ?? null,
      status: "in_progress",
      playCount: (old?.playCount ?? 0) + 1,
    });
    launchPlayer(anime, episode);
  }

  function setEpisodeWatched(episode: Episode, watched: boolean) {
    if (!watched) {
      writeRecord(episode.path, null);
      return;
    }
    const old = watchProgress[episode.path];
    const dur = old?.durationSeconds ?? null;
    writeRecord(episode.path, {
      watched: true,
      progress: 1,
      progressSeconds: dur ?? old?.progressSeconds ?? 0,
      durationSeconds: dur,
      duration: dur,
      status: "completed",
      playCount: old?.playCount ?? 0,
    });
  }

  function savePositionEdit(episode: Episode, seconds: number) {
    const dur = watchProgress[episode.path]?.durationSeconds ?? 0;
    const pct = dur > 0 ? seconds / dur : 0;
    const status: WatchStatus = pct * 100 >= completeAtPct ? "completed" : seconds > 3 ? "in_progress" : "unwatched";
    writeRecord(episode.path, {
      watched: status === "completed",
      progress: pct,
      progressSeconds: seconds,
      durationSeconds: dur || null,
      duration: dur || null,
      status,
    });
    showToast(`Resume position set to ${formatClock(seconds)}.`);
  }

  const handlePlaybackPrefs = useCallback((volume: number, rate: number) => {
    setPlaybackPrefs((prev) => (prev.volume === volume && prev.rate === rate ? prev : { volume, rate }));
  }, []);

  function handlePlayerIndex(index: number) {
    setNowPlaying((cur) => (cur ? { ...cur, index } : cur));
  }

  function handlePlayerProgress(path: string, seconds: number, durationSeconds: number | null, status: WatchStatus) {
    // A player that closed without ever decoding a frame used to write
    // status:"unwatched" over the in_progress stamp from openPlayerFor —
    // which is why mpv-handed-off episodes vanished from Continue Watching
    // while staying in History. Drop those no-op writes.
    if (status === "unwatched" && seconds === 0 && durationSeconds === null) return;
    setWatchProgress((prev) => {
      const old = prev[path];
      return {
        ...prev,
        [path]: {
          episodePath: path,
          watched: status === "completed",
          lastOpenedAt: Date.now(),
          progress: durationSeconds ? Math.min(1, seconds / durationSeconds) : old?.progress ?? 0,
          duration: durationSeconds ?? old?.duration ?? null,
          progressSeconds: seconds,
          durationSeconds: durationSeconds ?? old?.durationSeconds ?? null,
          status,
          playCount: (old?.playCount ?? 0) + (old && old.status !== "unwatched" ? 0 : 1),
        },
      };
    });
  }

  async function playInMpv(episodePath: string, startSeconds = 0) {
    // Item 30: the binary is resolved in Rust (user override -> bundled copy ->
    // PATH -> common install folders), so nothing depends on shell scope perms.
    try {
      await invoke("spawn_player", { mediaPath: episodePath, startSeconds });
    } catch (error) {
      notify("error", "Could not start the external player:\n\n" + String(error));
    }
  }

  const refreshMpvPath = useCallback(() => {
    invoke<string>("resolve_player")
      .then((p) => setMpvPath(p))
      .catch(() => setMpvPath(null));
  }, []);

  useEffect(() => {
    refreshMpvPath();
  }, [refreshMpvPath]);

  const toastEl = notice ? (
    <div className="toast-stack">
      <div key={notice.id} className={"toast " + notice.type}>
        {notice.type === "error" ? <AlertIcon size={16} /> : <CheckCircleIcon size={16} />}
        <span>{notice.text}</span>
      </div>
    </div>
  ) : null;

  async function scanLibrary(path: string) {
    if (!path) { setScanMessage("No library folder selected."); return; }
    setScanning(true);
    setScanMessage("Scanning library...");

    try {
      const entries = await readDir(path);
      const folders: AnimeFolder[] = [];
      const cleanRootPath = path.replace(/[/\\]+$/, "");

      for (const entry of entries) {
        if (!entry.isDirectory || !entry.name) continue;
        const folderPath = `${cleanRootPath}/${entry.name}`;

        try {
          const folderContents = await readDir(folderPath);
          const localPosterUrl = findLocalPoster(folderContents, folderPath);

          // Item 20: offline metadata from a Kodi-style .nfo, if the folder has one.
          let nfoMeta: AnimeMetadata | null = null;
          const nfoEntry = folderContents.find((f) => !f.isDirectory && !!f.name && f.name.toLowerCase().endsWith(".nfo"));
          if (nfoEntry) {
            try {
              const xml = await readTextFile(`${folderPath.replace(/[/\\]+$/, "")}/${nfoEntry.name}`);
              nfoMeta = parseNfoMetadata(xml, entry.name);
            } catch { nfoMeta = null; }
          }
          const episodes: Episode[] = folderContents
            .filter((file) => !file.isDirectory && !!file.name && isVideoFile(file.name))
            .map((file) => ({
              name: file.name!,
              path: `${folderPath.replace(/[/\\]+$/, "")}/${file.name}`,
              episodeNumber: getEpisodeNumber(file.name!),
            }))
            .sort((a, b) => {
              if (a.episodeNumber !== null && b.episodeNumber !== null) return a.episodeNumber - b.episodeNumber;
              if (a.episodeNumber !== null) return -1;
              if (b.episodeNumber !== null) return 1;
              return a.name.localeCompare(b.name, undefined, { numeric: true });
            });

          const existenceResults = await Promise.all(
            episodes.map(async (ep) => {
              try { return await invoke<boolean>("check_file_exists", { path: ep.path }); }
              catch { return true; }
            })
          );
          const missingEpisodes = existenceResults.filter((exists) => !exists).length;

          let savedMeta: AnimeMetadata | null = null;
          try {
            const rustMeta = await invoke<any>("load_anilist_metadata", { path: folderPath });
            if (rustMeta) {
              savedMeta = {
                title: rustMeta.title || entry.name,
                alternativeTitles: [rustMeta.title_romaji, rustMeta.title_english, rustMeta.title_native].filter(Boolean),
                synopsis: rustMeta.description || "This anime is stored locally in your library.",
                episodeCount: rustMeta.episodes || episodes.length,
                duration: rustMeta.duration || 24,
                rating: 0,
                genres: rustMeta.genres || [],
                tags: Array.isArray(rustMeta.tags) ? rustMeta.tags : undefined,
                status: rustMeta.status === "FINISHED" || rustMeta.status === "Completed" ? "Completed" : "Airing",
                season: rustMeta.season || "Unknown",
                year: rustMeta.season_year || new Date().getFullYear(),
                studio: rustMeta.studio || "Unknown",
                posterUrl: rustMeta.poster_url || undefined,
              };
            }
          } catch { savedMeta = null; }

          const cachedMeta = metadataCache.get(folderPath);
          if (savedMeta && cachedMeta?.rating && !savedMeta.rating) savedMeta.rating = cachedMeta.rating;
          const initialMeta: AnimeMetadata = savedMeta ? savedMeta : cachedMeta
            ? { ...cachedMeta, posterUrl: cachedMeta.posterUrl || localPosterUrl }
            : nfoMeta
              ? { ...nfoMeta, posterUrl: nfoMeta.posterUrl || localPosterUrl }
              : {
                  ...extractBasicMetadata({ name: entry.name, path: folderPath, episodes, missingEpisodes, isMatched: false, matchConfidence: 0 }),
                  posterUrl: localPosterUrl,
                };

          folders.push({
            name: entry.name,
            path: folderPath,
            episodes,
            missingEpisodes,
            metadata: initialMeta,
            isMatched: !!(savedMeta || cachedMeta || nfoMeta),
            matchConfidence: savedMeta ? 100 : cachedMeta ? 90 : nfoMeta ? 70 : 0,
          });
        } catch (error) { 
          console.error(`Failed to scan subfolder ${entry.name}:`, error); 
        }
      }

      folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      // Item 21: heal storage keys whose paths no longer exist (moved drives,
      // renamed roots). Runs on every scan; no-ops when nothing is dangling.
      const epIndex = buildRelinkIndex(
        path,
        folders.flatMap((f) => f.episodes.map((ep) => ({ abs: ep.path })))
      );
      const seriesIndex = buildRelinkIndex(path, folders.map((f) => ({ abs: f.path })));
      const epRenames = computeRenames(Object.keys(watchProgress), epIndex);
      const favRenames = computeRenames(favorites, seriesIndex);
      const cacheRenames = computeRenames(Array.from(metadataCache.keys()), seriesIndex);
      const relinkedCount =
        Object.keys(epRenames).length + Object.keys(favRenames).length + Object.keys(cacheRenames).length;
      if (relinkedCount > 0) {
        setWatchProgress((prev) => {
          const nextMap: EpisodeProgressMap = { ...prev };
          for (const [oldKey, newKey] of Object.entries(epRenames)) {
            const rec = nextMap[oldKey];
            if (!rec || nextMap[newKey]) continue;
            delete nextMap[oldKey];
            nextMap[newKey] = { ...rec, episodePath: newKey };
          }
          return nextMap;
        });
        setFavorites((prev) => prev.map((p) => favRenames[p] ?? p));
        setMetadataCache((prev) => {
          const moved = new Map<string, AnimeMetadata>();
          for (const [k, v] of prev) moved.set(cacheRenames[k] ?? k, v);
          return moved;
        });
        notify(
          "success",
          `Library move detected — relinked ${Object.keys(epRenames).length} history, ` +
            `${Object.keys(favRenames).length} favorite(s) and ${Object.keys(cacheRenames).length} metadata record(s).`
        );
      }

      setAnimeFolders(folders);
      setScanMessage(`Scan complete — found ${folders.length} folder(s).`);
    } catch (error) {
      setScanMessage(`Scan failed: ${String(error)}`);
      notify("error", "Library scan failed.");
    } finally { 
      setScanning(false); 
    }
  }

  async function handleRefreshLibrary() {
    if (!libraryPath) { showToast("No library folder set."); return; }
    showToast("Refreshing library & checking for new items...");
    await scanLibrary(libraryPath);
  }

  async function matchAllAnime() {
    setMatching(true);
    setMatchProgress({ current: 0, total: animeFolders.length });

    const newCache = new Map(metadataCache);
    let updatedFolders = [...animeFolders];

    for (let i = 0; i < updatedFolders.length; i++) {
      const folder = updatedFolders[i];
      if (!folder.isMatched) {
        let success = false;
        let attempts = 0;
        let backoffDelay = 3000;

        while (!success && attempts < 3) {
          attempts++;
          try {
            const { metadata, matchConfidence } = await matchAnimeMetadata(folder);
            if (metadata && matchConfidence > 50) {
              newCache.set(folder.path, metadata);
              updatedFolders[i] = { ...folder, metadata, isMatched: true, matchConfidence };
              await saveMetadataToDisk(folder.path, metadata);
              success = true;
              await delay(2500);
            }
          } catch {
            await delay(backoffDelay);
            backoffDelay *= 2;
          }
        }
      }
      setMatchProgress({ current: i + 1, total: updatedFolders.length });
      setAnimeFolders([...updatedFolders]);
    }

    setMetadataCache(newCache);
    saveMetadataCache(newCache);
    setMatching(false);
    showToast("Batch matching finished!");
  }

  const openManualSearch = () => {
    if (!selectedAnime) return;
    const initialQuery = selectedAnime.metadata?.title || selectedAnime.name.replace(/\(\d{4}\)/g, "").replace(/\[.*?\]/g, "").trim();
    setManualSearchQuery(initialQuery);
    setIsSearchModalOpen(true);
    executeManualSearch(initialQuery);
  };

  const executeManualSearch = async (queryText: string) => {
    if (!queryText.trim()) return;
    setIsSearchingManual(true);
    let results = await fetchAniListMetadata(queryText);
    if (results.length === 0) results = await fetchJikanMetadata(queryText);
    setManualSearchResults(results);
    setIsSearchingManual(false);
  };

  const applyManualMatch = async (selectedMeta: AnimeMetadata) => {
    if (!selectedAnime) return;
    const updatedFolder: AnimeFolder = { ...selectedAnime, metadata: selectedMeta, isMatched: true, matchConfidence: 100 };
    setSelectedAnime(updatedFolder);
    setAnimeFolders((prev) => prev.map((f) => (f.path === selectedAnime.path ? updatedFolder : f)));

    const newCache = new Map(metadataCache);
    newCache.set(selectedAnime.path, selectedMeta);
    setMetadataCache(newCache);
    saveMetadataCache(newCache);

    await saveMetadataToDisk(selectedAnime.path, selectedMeta);
    setIsSearchModalOpen(false);
    showToast("Metadata updated and saved to folder!");
  };

  async function addAnimeLibrary() {
    try {
      const selected = await open({ directory: true, multiple: false, title: "Select your anime library" });
      if (typeof selected !== "string") return;
      
      setLibraryPath(selected);
      setSelectedAnime(null);
      setScanMessage("Saving library location...");
      
      await invoke("save_library_path", { libraryPath: selected, library_path: selected });
      
      notify("success", "Library saved.");
      await scanLibrary(selected);
      setCurrentPage("home");
    } catch (error) {
      notify("error", "Could not save library folder.");
    }
  }

  // --------------------------------------------------
  // SHARED UI PIECES
  // --------------------------------------------------

  const activeTheme = THEME_OPTIONS.find((t) => t.id === theme) ?? THEME_OPTIONS[0];

  const refreshButton = (
    <button
      className={`icon-button ${scanning ? "is-busy" : ""}`}
      onClick={handleRefreshLibrary}
      title="Refresh library"
      aria-label="Refresh library"
      disabled={scanning}
    >
      <span className={scanning ? "spin" : ""}><RefreshIcon size={16} /></span>
    </button>
  );

  const renderSidebar = () => {
    const navItems: { page: Page; label: string; icon: React.ReactNode; badge?: number }[] = [
      { page: "home", label: "Home", icon: <HomeIcon /> },
      { page: "favorites", label: "Favorites", icon: <HeartIcon size={18} />, badge: favorites.length || undefined },
      { page: "history", label: "History", icon: <ClockIcon /> },
    ];

    return (
      <aside className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-mark"><LogoGlyph /></span>
            <div className="logo-text">
              <span className="logo-title">Kura<span>Play</span></span>
              <span className="logo-sub">Your anime. Offline.</span>
            </div>
          </div>
          <button
            className="sidebar-collapse"
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            title={`${isSidebarCollapsed ? "Expand" : "Collapse"} sidebar (${IS_MAC ? "⌘" : "Ctrl+"}B)`}
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!isSidebarCollapsed}
          >
            <PanelLeftIcon collapsed={isSidebarCollapsed} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <p className="nav-section-label">Browse</p>
          {navItems.map((item) => (
            <button
              key={item.page}
              className={`nav-item ${currentPage === item.page && !selectedAnime ? "active" : ""}`}
              onClick={() => goToPage(item.page)}
              data-tip={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
            </button>
          ))}
        </nav>

        {libraryPath && (
          <div className="sidebar-stats">
            <p className="sidebar-stats-title">Your library</p>
            <div className="sidebar-stats-row">
              <span className="stat-label"><FolderIcon size={14} /> Titles</span>
              <strong>{animeFolders.length}</strong>
            </div>
            <div className="sidebar-stats-row">
              <span className="stat-label"><FilmIcon size={14} /> Episodes</span>
              <strong>{totalEpisodes}</strong>
            </div>
            <div className="sidebar-stats-row">
              <span className="stat-label"><CheckCircleIcon size={14} /> Matched</span>
              <strong>{matchedPercent}%</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${matchedPercent}%` }} />
            </div>
          </div>
        )}

        <div className="sidebar-footer">
          <button
            className={`nav-item ${currentPage === "settings" && !selectedAnime ? "active" : ""}`}
            onClick={() => goToPage("settings")}
            data-tip="Settings"
          >
            <span className="nav-icon"><SlidersIcon /></span>
            <span className="nav-label">Settings</span>
          </button>

          {isSidebarCollapsed ? (
            <button
              className="nav-item"
              onClick={() => {
                const idx = THEME_OPTIONS.findIndex((t) => t.id === theme);
                setTheme(THEME_OPTIONS[(idx + 1) % THEME_OPTIONS.length].id);
              }}
              data-tip={`Theme: ${activeTheme.label} — click to cycle`}
            >
              <span className="nav-icon"><activeTheme.Icon size={18} /></span>
            </button>
          ) : (
            <div className="theme-switch" role="radiogroup" aria-label="Theme">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={theme === opt.id ? "active" : ""}
                  onClick={() => setTheme(opt.id)}
                  role="radio"
                  aria-checked={theme === opt.id}
                  title={opt.label}
                >
                  <opt.Icon size={15} />
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    );
  };

  const renderWatchCard = (item: { animeName: string; episode: Episode; progress: EpisodeProgress; anime: AnimeFolder }) => {
    const stats = getSeriesWatchStats(item.anime, watchProgress);
    const title = item.anime.metadata?.title || item.animeName;
    const epLabel = item.episode.episodeNumber != null ? `Ep ${item.episode.episodeNumber}` : "Ep —";
    return (
      <div
        className="watch-card"
        key={item.anime.path}
        role="button"
        tabIndex={0}
        data-cw-card
        title={title}
        aria-label={`${title}, ${epLabel}${stats.total > 0 ? `, ${stats.watchedCount} of ${stats.total} episodes watched` : ""}`}
        onClick={() => setSelectedAnime(item.anime)}
        onKeyDown={(e) => {
          // FIX: role="button" must activate on Space as well as Enter.
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedAnime(item.anime);
          }
        }}
      >
        <div className="watch-card-poster">
          <Poster src={item.anime.metadata?.posterUrl} alt={title} />

          {/* Resume button — appears on hover */}
          <button
            className="watch-card-play-btn"
            aria-label={`${stats.isComplete ? "Rewatch" : "Resume"} ${title}`}
            onClick={(e) => { e.stopPropagation(); openPlayerFor(item.anime, item.episode); }}
          >
            <PlayIcon size={16} />
          </button>

          {/* Progress bar pinned to bottom */}
          {stats.total > 0 && (
            <div className="watch-progress-track">
              <div
                className={`watch-progress-fill${stats.isComplete ? " is-complete" : ""}`}
                style={{ width: `${stats.percent}%` }}
              />
            </div>
          )}
        </div>

        {/* Title + episode + timestamp */}
        <div className="watch-card-info">
          <p className="watch-card-title">{title}</p>
          <p className="watch-card-sub">{epLabel}{stats.total > 0 ? ` / ${stats.total}` : ""} · {formatRelativeTime(item.progress.lastOpenedAt)}</p>
        </div>
      </div>
    );
  };

  const searchModalEl = isSearchModalOpen ? (
    <div className="modal-overlay" onClick={() => setIsSearchModalOpen(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Find metadata</h2>
            <p>Search AniList and MyAnimeList for the right match.</p>
          </div>
          <button className="icon-button ghost" onClick={() => setIsSearchModalOpen(false)} aria-label="Close">
            <XIcon />
          </button>
        </div>
        <div className="search-bar-row">
          <div className="search-box">
            <SearchIcon className="search-box-icon" />
            <input
              ref={manualSearchInputRef}
              type="text"
              value={manualSearchQuery}
              onChange={(e) => setManualSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && executeManualSearch(manualSearchQuery)}
              placeholder="Type an anime title…"
            />
          </div>
          <button className="primary-button" onClick={() => executeManualSearch(manualSearchQuery)} disabled={isSearchingManual}>
            {isSearchingManual ? <span className="spin"><RefreshIcon size={14} /></span> : <SearchIcon size={14} />}
            {isSearchingManual ? "Searching" : "Search"}
          </button>
        </div>
        <div className="search-results-list">
          {isSearchingManual ? (
            <p className="loading-text">Searching databases…</p>
          ) : manualSearchResults.length === 0 ? (
            <p className="empty-text">No matching anime found.</p>
          ) : (
            manualSearchResults.map((item, idx) => (
              <div key={idx} className="search-result-item">
                <div className="result-poster"><Poster src={item.posterUrl} alt={item.title} iconSize={18} /></div>
                <div className="result-info">
                  <h4>{item.title}</h4>
                  <p className="result-meta">
                    <span>{item.year}</span>
                    <span className="dot" />
                    <span>{item.season}</span>
                    {item.rating > 0 && (<><span className="dot" /><span className="rating-inline"><StarIcon size={11} /> {formatRating(item.rating)}</span></>)}
                  </p>
                  <p className="result-synopsis">{item.synopsis}</p>
                </div>
                <button className="secondary-button" onClick={() => applyManualMatch(item)}>Select</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  ) : null;

  const renderShell = (children: React.ReactNode) => (
    <div className="app">
      {nowPlaying && (
        <Player
          animeTitle={nowPlaying.anime.metadata?.title || nowPlaying.anime.name}
          episodes={nowPlaying.anime.episodes}
          startIndex={nowPlaying.index}
          resumeSeconds={(path) => watchProgress[path]?.progressSeconds ?? 0}
          onProgress={handlePlayerProgress}
          onIndexChange={handlePlayerIndex}
          onClose={() => setNowPlaying(null)}
          onOpenExternal={(path, seconds) => {
            setNowPlaying(null);
            void playInMpv(path, seconds);
          }}
          autoHandoff={playerAutoHandoff === "auto"}
          autoAdvance={autoNext}
          completeAt={completeAtPct / 100}
          initialVolume={playbackPrefs.volume}
          initialRate={playbackPrefs.rate}
          onPrefs={handlePlaybackPrefs}
        />
      )}
      {toastEl}
      {searchModalEl}
      {isToastVisible && <Toast message={toastMessage} onClose={() => setIsToastVisible(false)} />}
      {renderSidebar()}
      <main className="main">{children}</main>
    </div>
  );

  // --------------------------------------------------
  // DETAILS VIEW
  // --------------------------------------------------
  if (selectedAnime) {
    const isFav = favorites.includes(selectedAnime.path);
    const meta = selectedAnime.metadata;
    const stats = getSeriesWatchStats(selectedAnime, watchProgress);
    return renderShell(
      <>
        <header className="topbar">
          <button className="back-button" onClick={() => setSelectedAnime(null)}>
            <ArrowLeftIcon /> Back
          </button>
          <div className="topbar-actions">
            <button className={`secondary-button ${isFav ? "is-active" : ""}`} onClick={(e) => toggleFavorite(selectedAnime.path, e)}>
              <HeartIcon filled={isFav} /> {isFav ? "Favorited" : "Add to Favorites"}
            </button>
            <button className="secondary-button" onClick={openManualSearch}>
              <WandIcon size={15} /> Fix Metadata
            </button>
          </div>
        </header>
        <div className="content">
          <section className="anime-details">
            <div className="details-poster"><Poster src={meta?.posterUrl} alt={meta?.title || selectedAnime.name} iconSize={40} /></div>
            <div className="details-info">
              <div className="details-eyebrow">
                <span className="eyebrow">Local anime</span>
                {selectedAnime.isMatched ? (
                  <span className="chip chip-soft"><CheckIcon size={11} /> Matched {selectedAnime.matchConfidence}%</span>
                ) : (
                  <span className="chip chip-soft is-warn"><AlertIcon size={11} /> Not matched</span>
                )}
              </div>
              <h1>{meta?.title || selectedAnime.name}</h1>
              {meta && (
                <div className="meta-tiles">
                  {meta.rating > 0 && (
                    <div className="meta-tile highlight"><span>Rating</span><strong><StarIcon size={13} /> {formatRating(meta.rating)}</strong></div>
                  )}
                  <div className="meta-tile"><span>Year</span><strong>{meta.year}</strong></div>
                  <div className="meta-tile"><span>Season</span><strong>{meta.season}</strong></div>
                  <div className="meta-tile"><span>Episodes</span><strong>{selectedAnime.episodes.length}</strong></div>
                  <div className="meta-tile"><span>Status</span><strong>{meta.status}</strong></div>
                  <div className="meta-tile"><span>Studio</span><strong>{meta.studio}</strong></div>
                </div>
              )}
              <p className="details-description">{meta?.synopsis || "This anime is stored locally in your library."}</p>
              {chipList(meta, "full").length > 0 && (
                <div className="genre-tags">
                  {chipList(meta, "full").map((chip, index) => (
                    <span key={index} className={`genre-tag${chip.isTag ? " is-tag" : ""}`}>{chip.label}</span>
                  ))}
                </div>
              )}
              {stats.total > 0 && (
                <div className="details-progress">
                  <div className="details-progress-head">
                    <span>Watch progress</span>
                    <strong>{stats.watchedCount} / {stats.total}</strong>
                  </div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${stats.percent}%` }} /></div>
                </div>
              )}
            </div>
          </section>
          <section>
            <div className="section-header">
              <h2>Episodes</h2>
              <span className="count-pill">{selectedAnime.episodes.length}</span>
            </div>
            {selectedAnime.episodes.length === 0 ? (
              <div className="empty-card">
                <div className="empty-icon"><AlertIcon size={22} /></div>
                <h3>No episodes found</h3>
                <p>No supported video files were found in this folder.</p>
              </div>
            ) : (
              <div className="episode-list">
                {selectedAnime.episodes.map((episode, index) => {
                  const rec = watchProgress[episode.path];
                  const isWatched = rec?.status === "completed";
                  const isInProgress = rec?.status === "in_progress";
                  const canEditPosition = (rec?.durationSeconds ?? 0) > 0;
                  const editPct = canEditPosition ? (editSeconds / (rec?.durationSeconds || 1)) * 100 : 0;
                  return (
                    <div className="episode-row" key={episode.path}>
                      <button className={`episode-item ${isWatched ? "watched" : ""}`} onClick={() => openPlayerFor(selectedAnime, episode)}>
                        <div className="episode-number">{isWatched ? <CheckIcon size={14} /> : episode.episodeNumber ?? index + 1}</div>
                        <div className="episode-info">
                          <h3>
                            Episode {episode.episodeNumber ?? index + 1}
                            {isWatched && <span className="watched-tag">Watched</span>}
                            {isInProgress && <span className="watched-tag progress-tag">In progress</span>}
                          </h3>
                          <p>{episode.name}</p>
                        </div>
                        <div className="episode-progress" aria-hidden="true">
                          <div className={`episode-progress-track is-${rec?.status ?? "unwatched"}`}>
                            <div className="episode-progress-fill" style={{ width: episodeProgressPct(rec) }} />
                          </div>
                          <span className="episode-progress-time">{episodeProgressLabel(rec)}</span>
                        </div>
                        <div className="episode-play"><PlayIcon size={12} /></div>
                      </button>

                      <button
                        className="episode-menu-btn"
                        aria-label={`Options for episode ${episode.episodeNumber ?? index + 1}`}
                        aria-haspopup="menu"
                        aria-expanded={menuFor === episode.path}
                        onClick={() => setMenuFor(menuFor === episode.path ? null : episode.path)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <circle cx="12" cy="5.5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="18.5" r="1.7" />
                        </svg>
                      </button>

                      {menuFor === episode.path && (
                        <div className="episode-menu" role="menu">
                          <button role="menuitem" onClick={() => { setMenuFor(null); rewatchEpisode(selectedAnime, episode); }}>
                            Rewatch from start
                          </button>
                          <button role="menuitem" onClick={() => { setMenuFor(null); setEpisodeWatched(episode, true); }}>
                            Mark as watched
                          </button>
                          <button role="menuitem" onClick={() => { setMenuFor(null); setEpisodeWatched(episode, false); }}>
                            Mark as not watched
                          </button>
                          <button
                            role="menuitem"
                            disabled={!canEditPosition}
                            title={canEditPosition ? "Move the saved resume position" : "No duration recorded yet — play it once in the built-in player first"}
                            onClick={() => {
                              setMenuFor(null);
                              setEditSeconds(rec?.progressSeconds ?? 0);
                              setEditingPath(episode.path);
                            }}
                          >
                            Set position…
                          </button>
                        </div>
                      )}

                      {editingPath === episode.path && canEditPosition && (
                        <div className="episode-editor">
                          <span className="episode-editor-label">Resume position</span>
                          <input
                            className="pl-seek"
                            type="range"
                            min={0}
                            max={rec?.durationSeconds ?? 0}
                            step={5}
                            value={editSeconds}
                            aria-label="Resume position"
                            onChange={(e) => setEditSeconds(Number(e.target.value))}
                            style={{
                              background: `linear-gradient(to right, var(--accent) ${editPct}%, rgba(255,255,255,0.22) ${editPct}%)`,
                            }}
                          />
                          <span className="episode-progress-time">{formatClock(editSeconds)} / {formatClock(rec?.durationSeconds ?? 0)}</span>
                          <button className="secondary-button" onClick={() => { savePositionEdit(episode, editSeconds); setEditingPath(null); }}>
                            Save
                          </button>
                          <button className="secondary-button" onClick={() => setEditingPath(null)}>Cancel</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {menuFor && <div className="menu-scrim" onClick={() => setMenuFor(null)} />}
          </section>
        </div>
      </>
    );
  }

  // --------------------------------------------------
  // SETTINGS VIEW
  // --------------------------------------------------
  if (currentPage === "settings") {
    const trackedEpisodes = Object.keys(watchProgress).length;
    return renderShell(
      <>
        <header className="topbar">
          <div className="page-heading">
            <div className="page-title">Settings</div>
          </div>
          <div className="topbar-actions">{refreshButton}</div>
        </header>
        <div className="content" ref={settingsScrollRef} onScroll={handleSettingsScroll}>
          <div className="settings-layout">
            <nav className="settings-nav" aria-label="Settings sections">
              {SETTINGS_SECTIONS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={`settings-nav-item ${activeSettingsSection === id ? "active" : ""}`}
                  onClick={() => scrollToSettingsSection(id)}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>

            <div className="settings-main">
              <div className="settings-hero">
                <h1>Settings</h1>
                <p>Manage your library, metadata, appearance and the data stored on this device.</p>
              </div>

              {/* General */}
              <section id="settings-general" className="settings-section">
                <div className="settings-section-head">
                  <h2>General</h2>
                  <p>How KuraPlay behaves day to day.</p>
                </div>
                <div className="settings-group">
                  <div className="settings-row">
                    <div className="row-icon"><HomeIcon size={17} /></div>
                    <div className="row-text">
                      <div className="row-title">Start on</div>
                      <div className="row-sub">The page shown when KuraPlay launches.</div>
                    </div>
                    <div className="segmented">
                      {(["home", "favorites", "history"] as Page[]).map((p) => (
                        <button key={p} className={defaultPage === p ? "active" : ""} onClick={() => setDefaultPage(p)}>
                          {p === "home" ? "Home" : p === "favorites" ? "Favorites" : "History"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="row-icon"><ClockIcon size={17} /></div>
                    <div className="row-text">
                      <div className="row-title">Continue Watching on Home</div>
                      <div className="row-sub">Show the in-progress strip above the library grid.</div>
                    </div>
                    <div className="segmented">
                      <button className={showContinue ? "active" : ""} onClick={() => setShowContinue(true)}>Show</button>
                      <button className={!showContinue ? "active" : ""} onClick={() => setShowContinue(false)}>Hide</button>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="row-icon"><SparkleIcon size={17} /></div>
                    <div className="row-text">
                      <div className="row-title">Reduce motion</div>
                      <div className="row-sub">Flatten animations and transitions everywhere, regardless of the OS setting.</div>
                    </div>
                    <div className="segmented">
                      <button className={reduceMotion ? "active" : ""} onClick={() => setReduceMotion(true)}>On</button>
                      <button className={!reduceMotion ? "active" : ""} onClick={() => setReduceMotion(false)}>Off</button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Library */}
              <section id="settings-library" className="settings-section">
                <div className="settings-section-head">
                  <h2>Library</h2>
                  <p>The folder AnimeOffline scans for your local collection.</p>
                </div>
                <div className="settings-group">
                  <div className="settings-row">
                    <div className="row-icon"><FolderIcon /></div>
                    <div className="row-text">
                      <div className="row-title">Library folder</div>
                      <div className={`row-sub ${libraryPath ? "mono" : ""}`}>{libraryPath || "No library folder selected yet."}</div>
                    </div>
                    <button className="primary-button" onClick={addAnimeLibrary} disabled={scanning}>
                      <FolderIcon size={15} /> {libraryPath ? "Change" : "Choose folder"}
                    </button>
                  </div>
                  <div className="settings-row stats-row">
                    <div className="stat-tile">
                      <span className="stat-tile-label">Titles</span>
                      <strong>{animeFolders.length}</strong>
                    </div>
                    <div className="stat-tile">
                      <span className="stat-tile-label">Episodes</span>
                      <strong>{totalEpisodes}</strong>
                    </div>
                    <div className="stat-tile">
                      <span className="stat-tile-label">Empty folders</span>
                      <strong className={emptyFolders > 0 ? "is-warn" : ""}>{emptyFolders}</strong>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="row-icon"><RefreshIcon size={17} /></div>
                    <div className="row-text">
                      <div className="row-title">Rescan library</div>
                      <div className="row-sub">Pick up new folders and episodes you've added.</div>
                    </div>
                    <button className="secondary-button" onClick={handleRefreshLibrary} disabled={scanning || !libraryPath}>
                      <span className={scanning ? "spin" : ""}><RefreshIcon size={14} /></span>
                      {scanning ? "Scanning…" : "Scan now"}
                    </button>
                  </div>
                </div>
              </section>

              {/* Metadata */}
              <section id="settings-metadata" className="settings-section">
                <div className="settings-section-head">
                  <h2>Metadata & matching</h2>
                  <p>Match folders against AniList / MyAnimeList. Results are saved to <code>animeoffline.json</code> for offline use.</p>
                </div>
                <div className="settings-group">
                  <div className="settings-row match-summary">
                    <div className="match-ring" style={{ "--pct": `${matchedPercent}` } as React.CSSProperties}>
                      <span>{matchedPercent}%</span>
                    </div>
                    <div className="row-text">
                      <div className="row-title">{matchedCount} of {animeFolders.length} titles matched</div>
                      <div className="row-sub">
                        {matching
                          ? `Matching in progress — ${matchProgress.current} of ${matchProgress.total}`
                          : animeFolders.length - matchedCount > 0
                            ? `${animeFolders.length - matchedCount} title${animeFolders.length - matchedCount === 1 ? "" : "s"} still need metadata.`
                            : animeFolders.length > 0 ? "Everything in your library is matched." : "Add a library to start matching."}
                      </div>
                      <div className="progress-track"><div className="progress-fill" style={{ width: `${matching && matchProgress.total ? Math.round((matchProgress.current / matchProgress.total) * 100) : matchedPercent}%` }} /></div>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="row-icon"><WandIcon size={17} /></div>
                    <div className="row-text">
                      <div className="row-title">Match all anime</div>
                      <div className="row-sub">Fetch posters, synopses and ratings for unmatched titles.</div>
                    </div>
                    <button className="primary-button" onClick={matchAllAnime} disabled={matching || animeFolders.length === 0}>
                      {matching ? <span className="spin"><RefreshIcon size={14} /></span> : <SparkleIcon size={15} />}
                      {matching ? `Matching ${matchProgress.current}/${matchProgress.total}` : "Match all"}
                    </button>
                  </div>
                  <div className="settings-row">
                    <div className="row-icon"><RefreshIcon size={17} /></div>
                    <div className="row-text">
                      <div className="row-title">Refresh & match</div>
                      <div className="row-sub">Rescan folders first, then match anything new.</div>
                    </div>
                    <button className="secondary-button" onClick={() => { handleRefreshLibrary().then(() => matchAllAnime()); }} disabled={scanning || matching || !libraryPath}>
                      <span className={scanning || matching ? "spin" : ""}><RefreshIcon size={14} /></span>
                      Refresh & match
                    </button>
                  </div>
                </div>
              </section>

              {/* Playback */}
              <section id="settings-playback" className="settings-section">
                <div className="settings-section-head">
                  <h2>Playback</h2>
                  <p>Pick the player that opens your episodes.</p>
                </div>
                <div className="settings-group">
                  <div className="settings-row column">
                    <div className="row-title">Player</div>
                    <div className="player-options">
                      <button
                        className={`player-option ${preferredPlayer === "builtin" ? "active" : ""}`}
                        onClick={() => setPreferredPlayer("builtin")}
                        aria-pressed={preferredPlayer === "builtin"}
                      >
                        <div className="player-option-head">
                          <span className="player-option-icon"><PlayIcon size={14} /></span>
                          <span className="player-option-name">Built-in player</span>
                          <span className="theme-radio">{preferredPlayer === "builtin" && <CheckIcon size={10} />}</span>
                        </div>
                        <p className="player-option-pitch">Plays inside AnimeOffline and remembers exactly where you stopped.</p>
                        <ul className="player-option-points">
                          <li className="good">Resume positions, completion and next-up</li>
                          <li className="good">Plays mp4, webm and most mkv files</li>
                          <li className="bad">Can't play .ts, .avi or HEVC / 10-bit files</li>
                        </ul>
                      </button>
                      <button
                        className={`player-option ${preferredPlayer === "mpv" ? "active" : ""}`}
                        onClick={() => setPreferredPlayer("mpv")}
                        aria-pressed={preferredPlayer === "mpv"}
                      >
                        <div className="player-option-head">
                          <span className="player-option-icon">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="3" y="4" width="18" height="13" rx="2" />
                              <path d="M9 21h6M12 17v4" />
                            </svg>
                          </span>
                          <span className="player-option-name">mpv (external)</span>
                          <span className="theme-radio">{preferredPlayer === "mpv" && <CheckIcon size={10} />}</span>
                        </div>
                        <p className="player-option-pitch">Opens the mpv program in its own window. Plays absolutely everything.</p>
                        <ul className="player-option-points">
                          <li className="good">Every format and codec you throw at it</li>
                          <li className="bad">AnimeOffline can't read positions back</li>
                          <li className="bad">No next-up countdown inside the app</li>
                        </ul>
                      </button>
                    </div>
                  </div>
                  <div className="settings-row column">
                    <div className="row-title">If a file can't play in the built-in player</div>
                    <div className="segmented">
                      <button className={playerAutoHandoff === "ask" ? "active" : ""} onClick={() => setPlayerAutoHandoff("ask")}>Ask me each time</button>
                      <button className={playerAutoHandoff === "auto" ? "active" : ""} onClick={() => setPlayerAutoHandoff("auto")}>Open mpv straight away</button>
                    </div>
                    <p className="settings-desc">
                      Only applies while the built-in player is selected. "Open mpv straight away" skips the prompt and
                      launches mpv at your saved position — pick it if most of your library is .ts or HEVC.
                    </p>
                  </div>
                  <div className="settings-row">
                    <div className="row-icon"><FolderIcon size={17} /></div>
                    <div className="row-text">
                      <div className="row-title">mpv location</div>
                      <div className={`row-sub ${mpvPath ? "mono" : ""}`}>
                        {mpvPath ?? "Not found. KuraPlay checks a bundled copy, your PATH, and common install folders automatically."}
                      </div>
                    </div>
                    <div className="row-actions">
                      <button
                        className="secondary-button"
                        onClick={() => {
                          void (async () => {
                            const picked = await open({ multiple: false, title: "Locate mpv" });
                            if (typeof picked !== "string") return;
                            await invoke("set_mpv_path", { path: picked }).catch(() => undefined);
                            refreshMpvPath();
                          })();
                        }}
                      >
                        Choose…
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => {
                          void invoke("set_mpv_path", { path: null }).then(() => refreshMpvPath()).catch(() => undefined);
                        }}
                      >
                        Auto
                      </button>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="row-icon"><PlayIcon size={17} /></div>
                    <div className="row-text">
                      <div className="row-title">Auto-play next episode</div>
                      <div className="row-sub">Roll straight into the next episode after a short countdown. Off shows a card you click instead.</div>
                    </div>
                    <div className="segmented">
                      <button className={autoNext ? "active" : ""} onClick={() => setAutoNext(true)}>On</button>
                      <button className={!autoNext ? "active" : ""} onClick={() => setAutoNext(false)}>Off</button>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="row-icon"><CheckCircleIcon size={17} /></div>
                    <div className="row-text">
                      <div className="row-title">Count an episode as watched at</div>
                      <div className="row-sub">How far you need to get before it ticks off the series progress and leaves Continue Watching.</div>
                    </div>
                    <div className="segmented">
                      {[85, 90, 95].map((p) => (
                        <button key={p} className={completeAtPct === p ? "active" : ""} onClick={() => setCompleteAtPct(p)}>{p}%</button>
                      ))}
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="row-icon"><SlidersIcon size={17} /></div>
                    <div className="row-text">
                      <div className="row-title">Remember volume & speed</div>
                      <div className="row-sub">Reopen the player with the volume and playback speed you last used.</div>
                    </div>
                    <div className="segmented">
                      <button className={rememberPlayback ? "active" : ""} onClick={() => setRememberPlayback(true)}>On</button>
                      <button className={!rememberPlayback ? "active" : ""} onClick={() => setRememberPlayback(false)}>Off</button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Appearance */}
              <section id="settings-appearance" className="settings-section">
                <div className="settings-section-head">
                  <h2>Appearance</h2>
                  <p>Theme and accent color apply everywhere instantly.</p>
                </div>
                <div className="settings-group">
                  <div className="settings-row column">
                    <div className="row-title">Theme</div>
                    <div className="theme-options">
                      {THEME_OPTIONS.map((opt) => (
                        <button key={opt.id} className={`theme-option ${theme === opt.id ? "active" : ""}`} onClick={() => setTheme(opt.id)}>
                          <div className={`theme-preview ${opt.id}-preview`}>
                            <span className="tp-side"><i /><i /><i /></span>
                            <span className="tp-main"><i /><i /><i /></span>
                          </div>
                          <div className="theme-option-label">
                            <span><opt.Icon size={14} /> {opt.label}</span>
                            <span className="theme-radio">{theme === opt.id && <CheckIcon size={10} />}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="settings-row column">
                    <div className="row-title">Card size</div>
                    <div className="segmented">
                      {(["compact", "cozy", "large"] as Density[]).map((d) => (
                        <button key={d} className={density === d ? "active" : ""} onClick={() => setDensity(d)}>
                          {d === "compact" ? "Compact" : d === "cozy" ? "Cozy" : "Large"}
                        </button>
                      ))}
                    </div>
                    <p className="settings-desc">Applies to the library grid, the history grid and the Continue Watching strip.</p>
                  </div>
                  <div className="settings-row column">
                    <div className="row-title">Accent color</div>
                    <div className="accent-options">
                      {ACCENT_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          className={`accent-option ${accent === preset.id ? "active" : ""}`}
                          onClick={() => setAccent(preset.id)}
                          aria-pressed={accent === preset.id}
                        >
                          <span className="accent-dot" style={{ background: preset.swatch }}>
                            {accent === preset.id && <CheckIcon size={10} />}
                          </span>
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Data */}
              <section id="settings-data" className="settings-section">
                <div className="settings-section-head">
                  <h2>Data & storage</h2>
                  <p>Cached metadata, favorites and watch history live only on this device.</p>
                </div>
                <div className="settings-group">
                  <div className="settings-row">
                    <div className="row-icon"><DatabaseIcon size={17} /></div>
                    <div className="row-text">
                      <div className="row-title">Metadata cache</div>
                      <div className="row-sub">{metadataCache.size} cached entr{metadataCache.size === 1 ? "y" : "ies"}</div>
                    </div>
                    <button className="secondary-button danger" onClick={handleClearMetadataCache} disabled={metadataCache.size === 0}>
                      <TrashIcon size={14} /> Clear
                    </button>
                  </div>
                  <div className="settings-row">
                    <div className="row-icon"><ClockIcon size={17} /></div>
                    <div className="row-text">
                      <div className="row-title">Watch history</div>
                      <div className="row-sub">{trackedEpisodes} tracked episode{trackedEpisodes === 1 ? "" : "s"}</div>
                    </div>
                    <button className="secondary-button danger" onClick={handleClearWatchHistory} disabled={trackedEpisodes === 0}>
                      <TrashIcon size={14} /> Clear
                    </button>
                  </div>
                  <div className="settings-row">
                    <div className="row-icon"><HeartIcon size={17} /></div>
                    <div className="row-text">
                      <div className="row-title">Favorites</div>
                      <div className="row-sub">{favorites.length} saved title{favorites.length === 1 ? "" : "s"}</div>
                    </div>
                    <button className="secondary-button danger" onClick={handleClearFavorites} disabled={favorites.length === 0}>
                      <TrashIcon size={14} /> Clear
                    </button>
                  </div>
                  <div className="settings-row">
                    <div className="row-icon"><FolderIcon size={17} /></div>
                    <div className="row-text">
                      <div className="row-title">Moved or renamed your library?</div>
                      <div className="row-sub">
                        A rescan re-links history, favorites and cached metadata to the new paths automatically —
                        changing a drive letter or folder name no longer loses anything.
                      </div>
                    </div>
                    <button className="secondary-button" onClick={handleRefreshLibrary} disabled={scanning || !libraryPath}>
                      <span className={scanning ? "spin" : ""}><RefreshIcon size={14} /></span>
                      Rescan & relink
                    </button>
                  </div>
                  <div className="settings-row">
                    <div className="row-icon"><DatabaseIcon size={17} /></div>
                    <div className="row-text">
                      <div className="row-title">Backup & restore</div>
                      <div className="row-sub">Export or import history, favorites and settings as a JSON file.</div>
                    </div>
                    <div className="row-actions">
                      <button className="secondary-button" onClick={() => { void exportBackup(); }}>Export</button>
                      <button className="secondary-button" onClick={() => { void importBackup(); }}>Import</button>
                    </div>
                  </div>
                </div>
              </section>

              {/* About */}
              <section id="settings-about" className="settings-section">
                <div className="settings-section-head">
                  <h2>About</h2>
                </div>
                <div className="settings-group">
                  <div className="settings-row about-row">
                    <span className="logo-mark large"><LogoGlyph /></span>
                    <div className="row-text">
                      <div className="row-title">KuraPlay</div>
                      <div className="row-sub">A local-first anime library manager. Metadata is cached to your device for offline use.</div>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="row-text">
                      <div className="row-title">Powered by</div>
                      <div className="source-chips">
                        <span className="genre-tag">AniList</span>
                        <span className="genre-tag">MyAnimeList · Jikan</span>
                        <span className="genre-tag">mpv player</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </>
    );
  }

  // --------------------------------------------------
  // HISTORY VIEW
  // --------------------------------------------------
  if (currentPage === "history") {
    return renderShell(
      <>
        <header className="topbar">
          <div className="page-heading">
            <div className="page-title">Watch History</div>
            {allHistory.length > 0 && <span className="count-pill">{allHistory.length}</span>}
          </div>
          <div className="topbar-actions">{refreshButton}</div>
        </header>
        <div className="content">
          {allHistory.length === 0 ? (
            <div className="empty-card">
              <div className="empty-icon"><ClockIcon size={22} /></div>
              <h3>No history yet</h3>
              <p>Episodes you play will automatically appear here.</p>
            </div>
          ) : (
            <div className="watch-grid">
              {allHistory.map((item) => renderWatchCard(item))}
            </div>
          )}
        </div>
      </>
    );
  }

  // --------------------------------------------------
  // HOME / FAVORITES VIEW
  // --------------------------------------------------
  const isFavoritesView = currentPage === "favorites";
  const baseList = isFavoritesView ? animeFolders.filter((a) => favorites.includes(a.path)) : animeFolders;

  const availableGenres = Array.from(new Set(animeFolders.flatMap((a) => a.metadata?.genres || []))).sort();

  const filteredAnime = baseList.filter((anime) => {
    const matchesSearch = (anime.metadata?.title || anime.name).toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "All" || anime.metadata?.status === statusFilter;
    const matchesGenre = genreFilter === "All" || (anime.metadata?.genres || []).includes(genreFilter);
    const matchesMatchState = matchFilter === "All" || (matchFilter === "Matched" ? anime.isMatched : !anime.isMatched);
    return matchesSearch && matchesStatus && matchesGenre && matchesMatchState;
  });

  const displayedAnime = [...filteredAnime].sort((a, b) => {
    switch (sortBy) {
      case "rating": return (b.metadata?.rating || 0) - (a.metadata?.rating || 0);
      case "year": return (b.metadata?.year || 0) - (a.metadata?.year || 0);
      case "episodes": return b.episodes.length - a.episodes.length;
      case "title":
      default:
        return (a.metadata?.title || a.name).localeCompare(b.metadata?.title || b.name);
    }
  });

  const hasActiveFilters = !!searchQuery || statusFilter !== "All" || genreFilter !== "All" || matchFilter !== "All";

  return renderShell(
    <>
      <header className="topbar">
        <div className="page-heading">
          <div className="page-title">{isFavoritesView ? "Favorites" : "Home"}</div>
          <span className="count-pill">{baseList.length}</span>
        </div>
        <div className="topbar-actions">
          {refreshButton}
        </div>
      </header>

      <div className="content">
        <div className="search-toolbar">
          <div className="search-toolbar-row">
            <div className="search-box large">
              <SearchIcon className="search-box-icon" size={17} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={isFavoritesView ? "Search your favorites" : "Search your library"}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { setSearchQuery(""); (e.target as HTMLInputElement).blur(); } }}
                aria-label="Search library"
              />
              {searchQuery ? (
                <button
                  className="search-clear"
                  onClick={() => { setSearchQuery(""); searchInputRef.current?.focus(); }}
                  aria-label="Clear search"
                >
                  <XIcon size={13} />
                </button>
              ) : (
                <span className="kbd-hint"><kbd>{IS_MAC ? "⌘" : "Ctrl"}</kbd><kbd>K</kbd></span>
              )}
            </div>

            <div className="select-wrap">
              <SortIcon className="select-lead" size={14} />
              <select className="filter-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} aria-label="Sort by">
                <option value="title">Title (A–Z)</option>
                <option value="rating">Rating</option>
                <option value="year">Year</option>
                <option value="episodes">Episode count</option>
              </select>
              <ChevronDownIcon />
            </div>
          </div>

          <div className="search-toolbar-filters">
            <div className="segmented">
              {(["All", "Completed", "Airing", "Not yet released"] as const).map((s) => (
                <button key={s} className={statusFilter === s ? "active" : ""} onClick={() => setStatusFilter(s)}>
                  {s === "Not yet released" ? "Upcoming" : s}
                </button>
              ))}
            </div>

            {availableGenres.length > 0 && (
              <div className="select-wrap small">
                <TagIcon className="select-lead" size={13} />
                <select className="filter-select" value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)} aria-label="Genre">
                  <option value="All">All genres</option>
                  {availableGenres.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <ChevronDownIcon />
              </div>
            )}

            <div className="select-wrap small">
              <CheckCircleIcon className="select-lead" size={13} />
              <select className="filter-select" value={matchFilter} onChange={(e) => setMatchFilter(e.target.value as any)} aria-label="Match state">
                <option value="All">Any match state</option>
                <option value="Matched">Matched only</option>
                <option value="Unmatched">Unmatched only</option>
              </select>
              <ChevronDownIcon />
            </div>

            {hasActiveFilters && (
              <button className="search-filter-clear" onClick={clearAllFilters}>
                <XIcon size={12} /> Clear filters
              </button>
            )}

            <span className="result-count">{displayedAnime.length} of {baseList.length}</span>
          </div>
        </div>

        {!isFavoritesView && showContinue && continueWatching.length > 0 && !hasActiveFilters && (
          <section className="continue-watching-section">
            <div className="section-header">
              <h2>Continue Watching</h2>
              <div className="section-header-actions">
                <button
                  className="surprise-btn"
                  onClick={pickRandomAnime}
                  title="Pick a random anime"
                  disabled={animeFolders.length === 0}
                >
                  <DiceIcon size={14} />
                  Surprise me
                </button>
                <button className="text-button" onClick={() => goToPage("history")}>View all</button>
              </div>
            </div>
            <ContinueWatchingStrip label="Continue Watching">
              {continueWatching.map((item) => (
                <div key={item.anime.path} role="listitem" className="cw-item">
                  {renderWatchCard(item)}
                </div>
              ))}
            </ContinueWatchingStrip>
          </section>
        )}

        <section>
          <div className="section-header">
            <h2>{isFavoritesView ? "Your Favorites" : "All Anime"}</h2>
          </div>

          {displayedAnime.length === 0 ? (
            <div className="empty-card">
              <div className="empty-icon">
                {hasActiveFilters ? <SearchIcon size={22} /> : isFavoritesView ? <HeartIcon size={22} /> : <FilmIcon size={22} />}
              </div>
              <h3>{hasActiveFilters ? "No matches found" : (isFavoritesView ? "No favorites yet" : "Your library is empty")}</h3>
              <p>{hasActiveFilters ? "Try adjusting your search or filters." : (isFavoritesView ? "Add shows to your favorites to see them here." : "Add an anime folder to start building your offline library.")}</p>
              {hasActiveFilters ? (
                <button className="secondary-button" onClick={clearAllFilters}>Clear filters</button>
              ) : !isFavoritesView && !libraryPath ? (
                <button className="primary-button" onClick={addAnimeLibrary}><FolderIcon size={15} /> Add library</button>
              ) : null}
            </div>
          ) : (
            <div className="anime-grid">
              {displayedAnime.map((anime) => {
                const isFav = favorites.includes(anime.path);
                const rating = anime.metadata?.rating || 0;
                const title = anime.metadata?.title || anime.name;
                return (
                  <button className="anime-card" key={anime.path} onClick={() => setSelectedAnime(anime)}>
                    <div className="anime-poster">
                      <Poster src={anime.metadata?.posterUrl} alt={title} />
                      <div className="poster-badges">
                        {anime.isMatched ? (
                          <span className="chip chip-match" title="Metadata match confidence">
                            <CheckIcon size={10} /> {anime.matchConfidence}%
                          </span>
                        ) : (
                          <span className="chip chip-unmatched"><AlertIcon size={11} /> Unmatched</span>
                        )}
                        {rating > 0 && (
                          <span className="chip chip-rating" title="Rating">
                            <StarIcon size={11} /> {formatRating(rating)}
                          </span>
                        )}
                      </div>
                      <span
                        className={`fav-toggle ${isFav ? "is-fav" : ""}`}
                        onClick={(e) => toggleFavorite(anime.path, e)}
                        title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                      >
                        <HeartIcon filled={isFav} size={14} />
                      </span>
                    </div>
                    <div className="anime-info">
                      <h3>{title}</h3>
                      <p>{anime.episodes.length} episode{anime.episodes.length === 1 ? "" : "s"}{anime.metadata?.year ? ` · ${anime.metadata.year}` : ""}</p>
                      {chipList(anime.metadata, "card").length > 0 && (
                        <div className="genre-tags">
                          {chipList(anime.metadata, "card").map((chip, index) => (
                            <span key={index} className={`genre-tag${chip.isTag ? " is-tag" : ""}`}>{chip.label}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export default App;
