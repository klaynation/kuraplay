// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The entire application lives in the lib crate (src/lib.rs): commands,
// SQLite state, player resolution, Tauri setup. The bin crate's only job is
// to call run() — the old stub commands and duplicate `mod db;` that used to
// sit here were dead code from before the real implementation existed.
fn main() {
    animeoffline_lib::run()
}