# fetch-mpv.ps1 - download the latest community Windows build of mpv into
# src-tauri/mpv/windows/ so the Windows bundle can ship it (item 30).
#
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File scripts/fetch-mpv.ps1
#
# NOTE: this file must stay pure ASCII. Windows PowerShell 5.1 reads BOM-less
# scripts as ANSI, so any unicode character (em-dash, smart quote) corrupts
# parsing on CI runners.
#
# LICENSE NOTE: mpv is GPL-2.0-or-later / LGPL-2.1+. Redistributing the binary
# inside your installer is permitted, but keep mpv's license available to
# users (see https://mpv.io/licensing) and offer corresponding source/build
# info on request.

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $repoRoot "src-tauri\mpv\windows"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Write-Host "Querying latest mpv Windows build..."
$release = Invoke-RestMethod "https://api.github.com/repos/zhongfly/mpv-winbuild/releases/latest"
$asset = $release.assets | Where-Object { $_.name -match "^mpv-x86_64-.*\.7z$" } | Select-Object -First 1
if (-not $asset) { throw "No x64 mpv Windows asset found on the latest release." }

$tmp = Join-Path $env:TEMP $asset.name
Write-Host ("Downloading " + $asset.name + " ...")
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmp

$sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
if (-not $sevenZip) {
  # GitHub Windows runners ship 7z; locally fall back to the common install path
  $candidate = "C:\Program Files\7-Zip\7z.exe"
  if (Test-Path $candidate) { $sevenZip = Get-Command $candidate }
  else { throw "7-Zip not found. Install it (or run this on a GitHub runner) to extract mpv." }
}

Write-Host "Extracting..."
& $sevenZip.Source x -y ("-o" + $dest) $tmp | Out-Null

# Flatten, tolerant of ANY archive layout: some builds wrap everything in one
# folder, others drop several top-level folders (doc/, fonts/, ...) next to
# mpv.exe. Copy every nested file up to $dest, then remove leftover dirs
# without ever throwing on a path that vanished mid-loop.
Get-ChildItem $dest -Directory | ForEach-Object {
  Get-ChildItem $_.FullName -Recurse -File | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $dest $_.Name) -Force
  }
}
Get-ChildItem $dest -Directory | ForEach-Object {
  if (Test-Path $_.FullName) {
    Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# Last resort: if mpv.exe still is not at the top, find it wherever it hid.
$exe = Join-Path $dest "mpv.exe"
if (-not (Test-Path $exe)) {
  $found = Get-ChildItem $dest -Recurse -Filter "mpv.exe" | Select-Object -First 1
  if ($found) { Copy-Item $found.FullName $exe -Force }
}
if (-not (Test-Path $exe)) {
  throw "mpv.exe not found after extraction - archive layout may have changed."
}

Write-Host ("OK: mpv ready at " + $dest)
