# Builds portable Project Life: one "Project Life.exe" that runs from any
# folder on any Windows 10 or 11 PC, with no installer. Everything it keeps
# lives in a Data folder beside it, created on first run.
#   npm run portable
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# Build the C runtime into the exe so it doesn't need the Visual C++ redistributable.
$env:RUSTFLAGS = "-C target-feature=+crt-static"
npx tauri build --no-bundle
if ($LASTEXITCODE -ne 0) { throw "The build failed." }

$version = (Get-Content src-tauri\tauri.conf.json -Raw | ConvertFrom-Json).version
$out = Join-Path $root "portable"
$folder = Join-Path $out "Project Life"
New-Item -ItemType Directory -Force $folder | Out-Null
Copy-Item src-tauri\target\release\project-life.exe (Join-Path $folder "Project Life.exe") -Force
@"
Project Life $version, portable

Double-click Project Life.exe to start. Nothing is installed.

Your notes, tasks, schedule, habits, goals and settings are kept in the Data
folder next to Project Life.exe, which appears the first time it runs. Copy
the whole Project Life folder to move it, everything included, to another PC
or a USB drive. Connected accounts sign in again on a new PC: their sign-ins
stay in that PC's Windows Credential Manager.

Project Life needs Microsoft Edge WebView2. Windows 11 has it, and Windows 10
gets it with Windows Update. If it's missing, Project Life says so and offers
the download.

What's new: see CHANGELOG.md, or Settings > About > Release notes.
"@ | Set-Content (Join-Path $folder "Read me.txt") -Encoding utf8
Copy-Item CHANGELOG.md (Join-Path $folder "CHANGELOG.md") -Force

# The zip is for sharing (and what updates download), so it holds only the app
# and its notes: never the Data folder that running this copy creates.
$zip = Join-Path $out "Project-Life-$version-portable.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
$stage = Join-Path ([IO.Path]::GetTempPath()) "project-life-portable-$([guid]::NewGuid())"
$staged = Join-Path $stage "Project Life"
New-Item -ItemType Directory -Force $staged | Out-Null
Copy-Item (Join-Path $folder "Project Life.exe"), (Join-Path $folder "Read me.txt"), (Join-Path $folder "CHANGELOG.md") $staged
Compress-Archive -Path $staged -DestinationPath $zip
Remove-Item -Recurse -Force $stage
Write-Host "Portable Project Life: $folder"
Write-Host "Zipped: $zip"
