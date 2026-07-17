@echo off
rem DART Business Finder + Website Builder launcher.
rem Lives inside DartGame/ next to the bridge it starts. Starts the local bridge
rem (serves the app + runs builds via Claude Code CLI) and opens the browser.
rem Double-click "Dart Game.lnk" in the workspace root instead of running this
rem directly. The bridge finds the workspace root from its own location, so the
rem folder this runs from does not matter.
cd /d "%~dp0"
start "DART Builder Bridge" /min cmd /c "node bridge\server.js"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4173/"
