#!/bin/bash
# Opens the local website editor. Starts the editor server if it isn't running.
cd "$(dirname "$0")" || exit 1

URL="http://localhost:4444/"

# If the server is already running, just open the editor.
if curl -s -o /dev/null --max-time 2 "$URL"; then
  open "$URL"
  exit 0
fi

# Start the server in the background, logging to editor/server.log.
nohup node editor/server.js > editor/server.log 2>&1 &

# Wait up to ~5 seconds for it to come up.
for _ in $(seq 1 25); do
  if curl -s -o /dev/null --max-time 1 "$URL"; then
    open "$URL"
    exit 0
  fi
  sleep 0.2
done

echo "The editor did not start. Check editor/server.log for details."
exit 1
