#!/bin/sh
# Serve the app locally (needed for the service worker / install-to-home-screen).
cd "$(dirname "$0")" && python3 -m http.server 8766
