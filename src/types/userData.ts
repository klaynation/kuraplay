export interface EpisodeProgress {
  filePath: string;
  lastPositionSec: number;
  durationSec: number;
  watchStatus: 'unwatched' | 'in_progress' | 'completed';
  lastWatchedAt: string;
}

export interface UserDataStore {
  history: Record<string, EpisodeProgress>;
  favorites: number[];
}