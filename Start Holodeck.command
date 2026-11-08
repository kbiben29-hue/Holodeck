#!/bin/zsh
# Double-click to play Holodeck on this Mac (needs Node.js from https://nodejs.org).
# Starts the game and opens it in your browser. Close this window (or press Ctrl+C) to stop it.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
	echo "Node.js isn't installed. Get the LTS version from https://nodejs.org, then double-click this file again."
	read -k1 "?Press any key to close…"
	exit 1
fi
if [ ! -d node_modules ]; then
	echo "First run: installing (about a minute)…"
	npm install || { read -k1 "?Install failed. Press any key to close…"; exit 1; }
fi
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo ""
echo "Starting Holodeck… your browser will open in a moment."
[ -n "$IP" ] && echo "  ▶ iPad/iPhone on the same Wi-Fi: open Safari at http://$IP:5175"
echo "Leave this window open while you play."
npm run dev -- --open --host --port 5175
