// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    animeoffline_lib::run()
}

// src-tauri/src/main.rs
mod db;

#[tauri::command]
fn save_progress(path: String, progress: f64, duration: f64) -> Result<(), String> {
    // Acquire DB connection and execute save_watch_progress
    Ok(())
}

#[tauri::command]
fn toggle_favorite(path: String) -> Result<bool, String> {
    // Acquire DB connection and execute toggle_favorite
    Ok(true)
}

