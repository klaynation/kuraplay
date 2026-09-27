import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface WatchState {
  filepath: string;
  progress_seconds: number;
  duration_seconds: number;
  play_count: number;
  status: "unwatched" | "in_progress" | "completed";
  is_favorite: boolean;
  last_watched_at: string;
}

export function useWatchState(filepath: string) {
  const [state, setState] = useState<WatchState | null>(null);

  const updateProgress = async (progress: number, duration: number) => {
    try {
      await invoke("save_progress", { path: filepath, progress, duration });
    } catch (err) {
      console.error("Failed to persist watch state:", err);
    }
  };

  const toggleFav = async () => {
    try {
      const isFav = await invoke<boolean>("toggle_favorite", { path: filepath });
      setState((prev) => (prev ? { ...prev, is_favorite: isFav } : null));
    } catch (err) {
      console.error("Failed to update favorite state:", err);
    }
  };

  return { state, updateProgress, toggleFav };
}