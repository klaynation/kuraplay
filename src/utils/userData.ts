import { invoke } from '@tauri-apps/api/core';
import { UserDataStore } from '../types/userData';

/**
 * Fetch all watch history and favorites from user_data.json
 */
export async function getUserData(): Promise<UserDataStore> {
  try {
    return await invoke<UserDataStore>('get_user_data');
  } catch (error) {
    console.error('Failed to load user data:', error);
    return { history: {}, favorites: [] };
  }
}

/**
 * Save playback progress (position and duration) to user_data.json
 */
export async function saveEpisodeProgress(
  filePath: string,
  positionSec: number,
  durationSec: number
): Promise<void> {
  try {
    await invoke('update_episode_progress', {
      filePath,
      positionSec,
      durationSec,
    });
  } catch (error) {
    console.error('Failed to update episode progress:', error);
  }
}

/**
 * Toggle favorite status for an anime by its AniList ID
 */
export async function toggleFavorite(anilistId: number): Promise<boolean> {
  try {
    return await invoke<boolean>('toggle_favorite_anime', { anilistId });
  } catch (error) {
    console.error('Failed to toggle favorite:', error);
    return false;
  }
}