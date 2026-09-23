#!/bin/bash
# Navigate to the project directory
cd "$(dirname "$0")"

# Start a simple web server for the static export
echo "Starting AniList Comparer (Static Version)..."
echo "This version is fast and doesn't need node_modules."
echo "Please wait a moment, then open http://localhost:3000 in your browser."

# Use npx serve (which is tiny) to host the 'out' folder
npx serve out -l 3000
