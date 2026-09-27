// db.rs — SQLite persistence for AnimeOffline (item 15, Rust half).
// ---------------------------------------------------------------------------
// Two tables, both keyed by absolute path (the frontend's relink engine,
// item 21, heals those keys after a library move, so we keep the same model).
//
// The database file itself lives in the platform app-data directory
// (see lib.rs `setup`), never in the working directory.

use rusqlite::{params, OptionalExtension, Connection};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// Mirrors the frontend `EpisodeProgress` exactly. camelCase on the wire so
/// the React side can send/receive its own objects untouched.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchRecord {
    pub episode_path: String,
    pub watched: bool,
    pub last_opened_at: i64,
    /// 0..1 fraction of the episode watched.
    pub progress: f64,
    pub progress_seconds: f64,
    pub duration_seconds: Option<f64>,
    /// "unwatched" | "in_progress" | "completed"
    pub status: String,
    pub play_count: i64,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn init_db(conn: &Connection) -> rusqlite::Result<()> {
    // WAL: readers never block the writer and vice versa, which matters when
    // the player persists every few seconds while the UI is querying.
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS watch_progress (
            episode_path     TEXT PRIMARY KEY,
            watched          INTEGER NOT NULL DEFAULT 0,
            last_opened_at   INTEGER NOT NULL DEFAULT 0,
            progress         REAL    NOT NULL DEFAULT 0,
            progress_seconds REAL    NOT NULL DEFAULT 0,
            duration_seconds REAL,
            status           TEXT    NOT NULL DEFAULT 'unwatched',
            play_count       INTEGER NOT NULL DEFAULT 0
        ) WITHOUT ROWID;

        CREATE TABLE IF NOT EXISTS favorites (
            folder_path TEXT PRIMARY KEY,
            added_at    INTEGER NOT NULL
        ) WITHOUT ROWID;",
    )
}

// ---------------------------------------------------------------------------
// Watch progress
// ---------------------------------------------------------------------------

pub fn save_watch_record(conn: &Connection, rec: &WatchRecord) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO watch_progress (
            episode_path, watched, last_opened_at, progress,
            progress_seconds, duration_seconds, status, play_count
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(episode_path) DO UPDATE SET
            watched          = excluded.watched,
            last_opened_at   = excluded.last_opened_at,
            progress         = excluded.progress,
            progress_seconds = excluded.progress_seconds,
            duration_seconds = excluded.duration_seconds,
            status           = excluded.status,
            play_count       = excluded.play_count",
        params![
            rec.episode_path,
            rec.watched as i64,
            rec.last_opened_at,
            rec.progress,
            rec.progress_seconds,
            rec.duration_seconds,
            rec.status,
            rec.play_count,
        ],
    )?;
    Ok(())
}

pub fn load_watch_records(conn: &Connection) -> rusqlite::Result<Vec<WatchRecord>> {
    let mut stmt = conn.prepare(
        "SELECT episode_path, watched, last_opened_at, progress,
                progress_seconds, duration_seconds, status, play_count
         FROM watch_progress
         ORDER BY last_opened_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(WatchRecord {
            episode_path: row.get(0)?,
            watched: row.get::<_, i64>(1)? != 0,
            last_opened_at: row.get(2)?,
            progress: row.get(3)?,
            progress_seconds: row.get(4)?,
            duration_seconds: row.get(5)?,
            status: row.get(6)?,
            play_count: row.get(7)?,
        })
    })?;
    rows.collect()
}

pub fn delete_watch_record(conn: &Connection, path: &str) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM watch_progress WHERE episode_path = ?1",
        params![path],
    )?;
    Ok(())
}

/// Legacy wrapper kept so the old `save_progress` command still works.
/// Preserves the existing play count instead of clobbering it.
pub fn save_watch_progress(
    conn: &Connection,
    path: &str,
    progress: f64,
    duration: f64,
) -> rusqlite::Result<()> {
    let existing: Option<i64> = conn
        .query_row(
            "SELECT play_count FROM watch_progress WHERE episode_path = ?1",
            params![path],
            |row| row.get(0),
        )
        .optional()?;

    let status = if progress >= 0.92 {
        "completed"
    } else if progress > 0.02 {
        "in_progress"
    } else {
        "unwatched"
    };

    save_watch_record(
        conn,
        &WatchRecord {
            episode_path: path.to_string(),
            watched: progress >= 0.92,
            last_opened_at: now_ms(),
            progress,
            progress_seconds: progress * duration,
            duration_seconds: if duration > 0.0 { Some(duration) } else { None },
            status: status.to_string(),
            play_count: existing.unwrap_or(0),
        },
    )
}

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

pub fn load_favorites(conn: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT folder_path FROM favorites ORDER BY added_at ASC")?;
    let rows = stmt.query_map([], |row| row.get(0))?;
    rows.collect()
}

/// Whole-list replace: matches the frontend model (an array), keeps the
/// write atomic, and means "sync" can never drift into a partial state.
pub fn replace_favorites(conn: &Connection, paths: &[String]) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM favorites", [])?;
    let now = now_ms();
    for (index, path) in paths.iter().enumerate() {
        tx.execute(
            "INSERT OR IGNORE INTO favorites (folder_path, added_at) VALUES (?1, ?2)",
            params![path, now + index as i64],
        )?;
    }
    tx.commit()
}

/// Kept for the legacy `toggle_favorite` command. Returns the new state.
pub fn toggle_favorite(conn: &Connection, path: &str) -> rusqlite::Result<bool> {
    let removed = conn.execute(
        "DELETE FROM favorites WHERE folder_path = ?1",
        params![path],
    )?;
    if removed > 0 {
        return Ok(false);
    }
    conn.execute(
        "INSERT INTO favorites (folder_path, added_at) VALUES (?1, ?2)",
        params![path, now_ms()],
    )?;
    Ok(true)
}
