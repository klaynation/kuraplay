# KuraPlay

> **Latest release: [v0.4.0](https://github.com/klaynation/kuraplay/releases/latest)** — Windows / macOS / Linux installers, signed auto-updates, six interface languages.

**Your anime library. Offline.**

KuraPlay is a local-first desktop app for Windows, macOS and Linux that turns a
folder of anime into a proper library: posters, metadata, watch progress,
resume-where-you-left-off playback, and a hand-off to [mpv](https://mpv.io) for
anything the built-in player can't decode. No accounts, no streaming, no
telemetry — your library never leaves your disk.

Built with [Tauri v2](https://tauri.app) (Rust backend, WebView frontend),
React 19 + TypeScript, SQLite for watch state, and SQLite-free localStorage as
a synchronous cache.

---

## Downloads

Prebuilt installers for every supported platform are attached to the
[latest release](https://github.com/klaynation/kuraplay/releases/latest):

| Platform | Installer | Notes |
|---|---|---|
| Windows 10/11 (x64) | `.msi` or `.exe` (NSIS) | mpv bundled inside the installer |
| macOS (Intel + Apple Silicon) | `.dmg` | universal binary |
| Linux | `.AppImage` or `.deb` | uses your distro's mpv |

First launch on Windows/macOS may show a smart-screen / Gatekeeper warning:
builds are unsigned until code signing is configured. On Windows choose
*More info → Run anyway*.

---

## Features

- **Multi-library scanning** — point it at as many folders or drives as you like;
  series, episodes and local art (`poster/cover/folder/thumb/fanart`) are
  discovered automatically, and moving a library never orphans your history.
- **Metadata, online or fully offline** — AniList → Jikan (MyAnimeList) →
  local Kodi-style `.nfo` files → folder-name fallback, in that order. Results
  are cached per-folder in `animeoffline.json` and in-app.
- **Built-in player** — resume positions to the second, completion tracking,
  next-up countdown, keyboard-driven (`Space`, `←/→`, `0–9`, `F`, `M`, `N/P`),
  auto-hiding chrome, codec-failure fallback card.
- **mpv integration** — resolution chain: user override → bundled binary
  (Windows releases) → system PATH → common install folders. Configurable in
  *Settings → Playback*.
- **Continue Watching** — series-level, Netflix-style: resumes the in-progress
  episode or queues the next unwatched one; disappears only when the series is
  fully watched.
- **Self-healing paths** — move the library to another drive or rename the
  root; the next scan re-links history, favorites and cached metadata by
  relative-path suffix matching. Nothing orphans.
- **Favorites, history, per-episode progress control** — rewatch, mark
  watched/unwatched, or drag the resume position manually per episode.
- **Backup & restore** — one JSON file for history, favorites and settings.
- **Theming** — 4 themes (Dark, Light, OLED Black, Dim) × 5 accent presets,
  card density, and an app-level reduce-motion override.

## Requirements

| | |
|---|---|
| Node.js | 20+ |
| Rust | stable, via [rustup](https://rustup.rs) |
| OS packages | [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) |
| mpv | optional at dev time (see below); bundled automatically in Windows release builds |

## Development

```bash
git clone https://github.com/klaynation/kuraplay.git
cd kuraplay
npm install
npm run tauri dev        # hot-reloading app
```

Rust-side gate (run after any `src-tauri` change, before committing):

```bash
cd src-tauri && cargo check
```

Frontend type gate:

```bash
npm run build            # tsc --strict + vite build
```

### mpv at dev time

The app resolves mpv in this order: *Settings → Playback* override → binary
bundled in the app resources → system `PATH` → common install locations
(Scoop/Chocolatey/`Program Files` on Windows; Homebrew, `/usr/bin`, `mpv.app`
elsewhere). To fetch a Windows build into the repo-local bundle path:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/fetch-mpv.ps1
```

(The downloaded binaries are git-ignored; CI fetches its own copy.)

## Project structure

```
src/            React frontend (App.tsx, components/, styles in App.css)
src-tauri/      Rust backend
  src/lib.rs    Tauri commands: config, metadata, player resolution & spawn
  src/db.rs     SQLite schema + queries (watch progress, favorites)
  capabilities/ Tauri permission scopes
scripts/        fetch-mpv.ps1 — Windows mpv downloader for bundling
.github/        release workflow (3-platform matrix)
```

## Where your data lives

All state is local, under the platform app-data directory
(`%LOCALAPPDATA%\com.charlton.animeoffline` on Windows,
`~/Library/Application Support/…` on macOS, `~/.config/…` on Linux):

- `configuration.json` — library path, mpv override
- `anime_offline.db` — SQLite watch progress + favorites (WAL mode)

localStorage holds the synchronous cache (themes, accents, UI prefs) and is
reconciled against SQLite on launch — newest `lastOpenedAt` wins.

## Releases

Pushing a `v*` tag runs the release workflow on Windows, macOS and Linux in
parallel and attaches installers (`.msi`/`.exe`, universal `.dmg`,
`.AppImage`/`.deb`) to a **draft GitHub release**:

```bash
git tag v0.3.0
git push origin v0.3.0
```

Local one-off builds: `npm run tauri build`.

Artifacts are **unsigned** — first-launch warnings from SmartScreen/Gatekeeper
are expected until a signing certificate is configured.

## Screenshots

_Add 2-4 PNGs to a `docs/` folder and embed them here before publishing —
the Home dashboard, the player, and the Settings page sell the app faster
than any paragraph._

## Roadmap

KuraPlay is feature-complete for its offline-first mission as of v0.4.0.
Deliberately parked pending demand signals: online Discover tab, account
login/sync, and cloud backups. If you want any of these, open an issue —
demand is the roadmap.

## Licensing notes

KuraPlay's own code: license TBD by the author (add a `LICENSE` file before
publishing releases publicly).

The Windows installer bundles mpv, which is
**GPL-2.0-or-later / LGPL-2.1+**. Distributing it is permitted, but keep mpv's
license text and source availability information available to users
(see <https://mpv.io/licensing>).

## Acknowledgements

Metadata courtesy of [AniList](https://anilist.co) and
[MyAnimeList](https://myanimelist.net) (via the Jikan API). Playback by
[mpv](https://mpv.io).

---

## License

KuraPlay is MIT-licensed — see [LICENSE](LICENSE). Swap the copyright holder in
that file for your legal name if you prefer it over your GitHub handle.

Third-party components shipped or referenced by this project:

| Component | License | How it ships |
|---|---|---|
| [mpv](https://mpv.io) | GPL-2.0-or-later / LGPL-2.1+ | Bundled binary on Windows only; launched as a separate process, not linked |
| [Tauri](https://tauri.app) | MIT / Apache-2.0 | Linked |
| [React](https://react.dev) | MIT | Bundled in frontend |
| [rusqlite](https://github.com/rusqlite/rusqlite) | MIT | Linked |
| AniList / MyAnimeList (Jikan) metadata | respective API terms | Fetched at runtime, cached locally |

Distributing mpv inside the Windows installer is permitted under its license,
provided its license text and source availability remain discoverable — the
NSIS installer displays this project's license, and mpv's own terms live at
<https://mpv.io/licensing>.
