# fetch-mpv.ps1 — download the latest community Windows build of mpv into
# src-tauri/mpv/windows/ so `tauri.windows.conf.json` can bundle it (item 30).
#
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File scripts/fetch-mpv.ps1
#
# LICENSE NOTE: mpv is GPL-2.0-or-later / LGPL-2.1+. Redistributing the binary
# inside your installer is permitted, but you must keep mpv's license available
# to users (e.g. ship https://mpv.io/licensing or the COPYING file alongside)
# and offer the corresponding source/build info on request.

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $repoRoot "src-tauri\mpv\windows"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Write-Host "Querying latest mpv Windows build..."
$release = Invoke-RestMethod "https://api.github.com/repos/zhongfly/mpv-winbuild/releases/latest"
$asset = $release.assets | Where-Object { $_.name -match "^mpv-x86_64-.*\.7z$" } | Select-Object -First 1
if (-not $asset) { throw "No x64 mpv Windows asset found on the latest release." }

$tmp = Join-Path $env:TEMP $asset.name
Write-Host "Downloading $($asset.name) ..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmp

$sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
if (-not $sevenZip) {
  # GitHub Windows runners ship 7z; locally fall back to the common install path
  $candidate = "C:\Program Files\7-Zip\7z.exe"
  if (Test-Path $candidate) { $sevenZip = Get-Command $candidate }
  else { throw "7-Zip not found. Install it (or run this on a GitHub runner) to extract mpv." }
}

Write-Host "Extracting..."
& $sevenZip.Source x -y "-o$dest" $tmp | Out-Null

# Builds nest everything one folder deep; flatten so mpv.exe sits in $dest
$nested = Get-ChildItem $dest -Directory | Select-Object -First 1
if ($nested) {
  Get-ChildItem $nested -Recurse -File | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $dest $_.Name) -Force
  }
  Remove-Item $nested -Recurse -Force
}

if (-not (Test-Path (Join-Path $dest "mpv.exe"))) {
  throw "mpv.exe not found after extraction — archive layout may have changed."
}

Write-Host "OK: mpv ready at $dest"
