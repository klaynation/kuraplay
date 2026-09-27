use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};

// SQLite and Tauri State / Manager imports
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{Manager, State};

mod db;

// State struct to hold the SQLite connection safely across threads
pub struct DbState(pub Mutex<Connection>);

// ==============================
// AniList response structures
// ==============================

#[derive(Debug, Deserialize)]
struct AniListResponse {
    data: AniListData,
}

#[derive(Debug, Deserialize)]
struct AniListData {
    #[serde(rename = "Page")]
    page: AniListPage,
}

#[derive(Debug, Deserialize)]
struct AniListPage {
    media: Vec<AniListMedia>,
}

#[derive(Debug, Deserialize)]
struct AniListMedia {
    id: i32,
    title: AniListTitle,
    description: Option<String>,
    episodes: Option<i32>,
    duration: Option<i32>,
    season: Option<String>,
    #[serde(rename = "seasonYear")]
    season_year: Option<i32>,
    genres: Vec<String>,
    status: Option<String>,
    format: Option<String>,
    #[serde(rename = "coverImage")]
    cover_image: Option<AniListCoverImage>,
    #[serde(rename = "bannerImage")]
    banner_image: Option<String>,
    studios: Option<AniListStudios>,
}

#[derive(Debug, Deserialize)]
struct AniListTitle {
    romaji: Option<String>,
    english: Option<String>,
    native: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AniListCoverImage {
    large: Option<String>,
    #[serde(rename = "extraLarge")]
    extra_large: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AniListStudios {
    nodes: Vec<AniListStudio>,
}

#[derive(Debug, Deserialize)]
struct AniListStudio {
    name: String,
}

// ==============================
// Local anime metadata
// ==============================

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AnimeMetadata {
    anilist_id: i32,
    title: String,
    title_romaji: Option<String>,
    title_english: Option<String>,
    title_native: Option<String>,
    description: Option<String>,
    episodes: Option<i32>,
    duration: Option<i32>,
    season: Option<String>,
    season_year: Option<i32>,
    genres: Vec<String>,
    status: Option<String>,
    format: Option<String>,
    poster_url: Option<String>,
    banner_url: Option<String>,
    studio: Option<String>,
    metadata_source: String,
}

// ==============================
// Application configuration
// ==============================

#[derive(Debug, Serialize, Deserialize)]
struct AppConfig {
    library_path: Option<String>,
    /// Optional explicit override for the external player binary.
    mpv_path: Option<String>,
}

// ==============================
// Helper commands & configuration
// ==============================

#[tauri::command]
fn check_file_exists(path: String) -> bool {
    Path::new(&path).exists()
}

fn get_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // Uses native Tauri v2 app_local_data_dir resolution (item 29):
    //   Windows : %LOCALAPPDATA%\com.charlton.animeoffline
    //   macOS   : ~/Library/Application Support/com.charlton.animeoffline
    //   Linux   : ~/.config/com.charlton.animeoffline
    let app_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Failed to locate app data directory: {}", error))?;

    fs::create_dir_all(&app_dir)
        .map_err(|error| format!("Failed to create config directory: {}", error))?;

    Ok(app_dir.join("configuration.json"))
}

#[tauri::command]
fn save_library_path(app: tauri::AppHandle, library_path: String) -> Result<(), String> {
    let config_path = get_config_path(&app)?;

    let config = AppConfig {
        library_path: Some(library_path),
    };

    let json = serde_json::to_string_pretty(&config)
        .map_err(|error| format!("Failed to parse configuration JSON: {}", error))?;

    fs::write(&config_path, json)
        .map_err(|error| format!("Failed to write configuration file: {}", error))?;

    Ok(())
}

#[tauri::command]
fn load_library_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let config_path = get_config_path(&app)?;

    if !config_path.exists() {
        return Ok(None);
    }

    let json = fs::read_to_string(&config_path)
        .map_err(|error| format!("Failed to read configuration file: {}", error))?;

    let config: AppConfig = serde_json::from_str(&json)
        .map_err(|error| format!("Failed to parse configuration file: {}", error))?;

    Ok(config.library_path)
}

// ==============================
// User Data Storage (SQLite, item 15)
// ==============================
// The frontend treats localStorage as a synchronous cache and SQLite as the
// source of truth: it hydrates from these commands on launch (newest
// lastOpenedAt wins) and writes through on every change. If the database is
// unavailable the app silently degrades to localStorage-only.

#[tauri::command]
fn save_watch_record(state: State<'_, DbState>, record: db::WatchRecord) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::save_watch_record(&conn, &record).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_watch_records(state: State<'_, DbState>) -> Result<Vec<db::WatchRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::load_watch_records(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_watch_record(state: State<'_, DbState>, path: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete_watch_record(&conn, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_favorites(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::load_favorites(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_favorites(state: State<'_, DbState>, paths: Vec<String>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::replace_favorites(&conn, &paths).map_err(|e| e.to_string())
}

// Legacy wrappers, kept so older frontends/commands keep working.
#[tauri::command]
fn save_progress(
    state: State<'_, DbState>,
    path: String,
    progress: f64,
    duration: f64,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::save_watch_progress(&conn, &path, progress, duration).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn toggle_favorite(state: State<'_, DbState>, path: String) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::toggle_favorite(&conn, &path).map_err(|e| e.to_string())
}

// ==============================
// External player resolution & launch (item 30)
// ==============================
// Order of precedence: explicit user override -> binary bundled inside the app
// (see tauri.windows.conf.json `bundle.resources`) -> system PATH -> common
// install locations. Launching from Rust means no shell-plugin scope entries
// are needed at all.

fn bundled_mpv(app: &tauri::AppHandle) -> Option<PathBuf> {
    let dir = app.path().resource_dir().ok()?;
    let name = if cfg!(windows) { "mpv.exe" } else { "mpv" };
    let candidate = dir.join("mpv").join(name);
    if candidate.exists() {
        Some(candidate)
    } else {
        None
    }
}

fn probe_on_path(bin: &str) -> bool {
    std::process::Command::new(bin)
        .arg("--version")
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

fn resolve_mpv(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // 1. explicit user override from configuration.json
    if let Ok(config_path) = get_config_path(app) {
        if config_path.exists() {
            if let Ok(json) = fs::read_to_string(&config_path) {
                if let Ok(cfg) = serde_json::from_str::<AppConfig>(&json) {
                    if let Some(custom) = cfg.mpv_path {
                        let p = PathBuf::from(&custom);
                        if p.exists() {
                            return Ok(p);
                        }
                    }
                }
            }
        }
    }
    // 2. bundled with the app
    if let Some(p) = bundled_mpv(app) {
        return Ok(p);
    }
    // 3. on PATH
    if probe_on_path("mpv") {
        return Ok(PathBuf::from("mpv"));
    }
    // 4. common install locations
    let mut candidates: Vec<PathBuf> = Vec::new();
    if cfg!(windows) {
        candidates.push(PathBuf::from(r"C:\Program Files\mpv\mpv.exe"));
        if let Ok(home) = std::env::var("USERPROFILE") {
            candidates.push(PathBuf::from(&home).join(r"scoop\shims\mpv.exe"));
            candidates.push(PathBuf::from(&home).join(r"chocolatey\bin\mpv.exe"));
        }
    } else {
        candidates.push(PathBuf::from("/opt/homebrew/bin/mpv"));
        candidates.push(PathBuf::from("/usr/local/bin/mpv"));
        candidates.push(PathBuf::from("/usr/bin/mpv"));
        candidates.push(PathBuf::from("/Applications/mpv.app/Contents/MacOS/mpv"));
    }
    candidates.into_iter().find(|p| p.exists()).ok_or_else(|| {
        "mpv was not found. Install it, or point KuraPlay at it in Settings > Playback.".to_string()
    })
}

#[tauri::command]
fn resolve_player(app: tauri::AppHandle) -> Result<String, String> {
    Ok(resolve_mpv(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn set_mpv_path(app: tauri::AppHandle, path: Option<String>) -> Result<(), String> {
    let config_path = get_config_path(&app)?;
    let mut config: AppConfig = if config_path.exists() {
        let json = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&json).map_err(|e| e.to_string())?
    } else {
        AppConfig {
            library_path: None,
            mpv_path: None,
        }
    };
    config.mpv_path = path;
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&config_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn spawn_player(app: tauri::AppHandle, media_path: String, start_seconds: f64) -> Result<u32, String> {
    let bin = resolve_mpv(&app)?;
    let mut cmd = std::process::Command::new(bin);
    cmd.arg("--save-position-on-quit");
    if start_seconds > 5.0 {
        cmd.arg(format!("--start={}", start_seconds.floor()));
    }
    cmd.arg(&media_path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP: no console window flash.
        cmd.creation_flags(0x00000008 | 0x00000200);
    }
    let child = cmd
        .spawn()
        .map_err(|error| format!("Failed to launch mpv: {}", error))?;
    Ok(child.id())
}

// ==============================
// Search AniList API
// ==============================

#[tauri::command]
async fn search_anilist(query: String) -> Result<Vec<AnimeMetadata>, String> {
    let graphql_query = r#"
        query ($search: String!) {
            Page(perPage: 10) {
                media(search: $search, type: ANIME) {
                    id
                    title {
                        romaji
                        english
                        native
                    }
                    description(asHtml: false)
                    episodes
                    duration
                    season
                    seasonYear
                    genres
                    status
                    format
                    coverImage {
                        large
                        extraLarge
                    }
                    bannerImage
                    studios {
                        nodes {
                            name
                        }
                    }
                }
            }
        }
    "#;

    let client = Client::new();

    let response = client
        .post("https://graphql.anilist.co")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&json!({
            "query": graphql_query,
            "variables": {
                "search": query
            }
        }))
        .send()
        .await
        .map_err(|error| format!("Failed to contact AniList: {}", error))?;

    if !response.status().is_success() {
        return Err(format!("AniList returned HTTP status {}", response.status()));
    }

    let result: AniListResponse = response
        .json()
        .await
        .map_err(|error| format!("Failed to read AniList response: {}", error))?;

    let metadata = result
        .data
        .page
        .media
        .into_iter()
        .map(|anime| {
            let title = anime
                .title
                .english
                .clone()
                .or_else(|| anime.title.romaji.clone())
                .or_else(|| anime.title.native.clone())
                .unwrap_or_else(|| "Unknown".to_string());

            let poster_url = anime
                .cover_image
                .as_ref()
                .and_then(|image| image.extra_large.clone().or_else(|| image.large.clone()));

            let studio = anime
                .studios
                .as_ref()
                .and_then(|studios| studios.nodes.first())
                .map(|studio| studio.name.clone());

            AnimeMetadata {
                anilist_id: anime.id,
                title,
                title_romaji: anime.title.romaji,
                title_english: anime.title.english,
                title_native: anime.title.native,
                description: anime.description,
                episodes: anime.episodes,
                duration: anime.duration,
                season: anime.season,
                season_year: anime.season_year,
                genres: anime.genres,
                status: anime.status,
                format: anime.format,
                poster_url,
                banner_url: anime.banner_image,
                studio,
                metadata_source: "AniList".to_string(),
            }
        })
        .collect();

    Ok(metadata)
}

// ==============================
// Local AniList metadata save/load
// ==============================

#[tauri::command]
fn save_anilist_metadata(path: String, data: serde_json::Value) -> Result<String, String> {
    let mut metadata_path = PathBuf::from(&path);
    metadata_path.push("animeoffline.json");

    let json = serde_json::to_string_pretty(&data)
        .map_err(|error| format!("Failed to create metadata JSON: {}", error))?;

    fs::write(&metadata_path, json)
        .map_err(|error| format!("Failed to save metadata: {}", error))?;

    Ok(metadata_path.to_string_lossy().to_string())
}

#[tauri::command]
fn load_anilist_metadata(path: String) -> Result<Option<serde_json::Value>, String> {
    let mut metadata_path = PathBuf::from(&path);
    metadata_path.push("animeoffline.json");

    if !metadata_path.exists() {
        return Ok(None);
    }

    let json = fs::read_to_string(&metadata_path)
        .map_err(|error| format!("Failed to read metadata: {}", error))?;

    let val: serde_json::Value = serde_json::from_str(&json)
        .map_err(|error| format!("Failed to parse metadata: {}", error))?;

    Ok(Some(val))
}

// ==============================
// Tauri application entry point
// ==============================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // FIXED (item 29): the database used to be opened with a relative path
        // ("anime_offline.db"), which resolves against the process working
        // directory — arbitrary for a GUI app, and unwritable in places like
        // System32. It now opens inside the platform app-data directory, and
        // only after the AppHandle exists, with real error propagation
        // instead of .expect() panics.
        .setup(|app| {
            let data_dir = app
                .path()
                .app_local_data_dir()
                .map_err(|error| format!("Failed to locate app data directory: {}", error))?;

            fs::create_dir_all(&data_dir)
                .map_err(|error| format!("Failed to create app data directory: {}", error))?;

            let conn = Connection::open(data_dir.join("anime_offline.db"))
                .map_err(|error| format!("Failed to open database: {}", error))?;

            db::init_db(&conn).map_err(|error| format!("Failed to initialize database: {}", error))?;

            app.manage(DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_file_exists,
            save_library_path,
            load_library_path,
            search_anilist,
            save_anilist_metadata,
            load_anilist_metadata,
            save_watch_record,
            load_watch_records,
            delete_watch_record,
            load_favorites,
            save_favorites,
            save_progress,
            toggle_favorite,
            resolve_player,
            set_mpv_path,
            spawn_player
        ])
        .run(tauri::generate_context!())
        .expect("error while running animeoffline application");
}
