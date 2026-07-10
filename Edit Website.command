#!/bin/bash
# Opens the local website editor. Starts the editor server if it isn't running.
cd "$(dirname "$0")" || exit 1

URL="http://127.0.0.1:4444/"
CHECK_FILE="$(mktemp)"
trap 'rm -f "$CHECK_FILE"' EXIT

# If the hardened editor is already running, just open it. A server left over
# from an older version is restarted once so it picks up the session-token code.
if curl -sS -o "$CHECK_FILE" --max-time 2 "$URL"; then
  if grep -q 'name="portfolio-editor-token"' "$CHECK_FILE"; then
    open "$URL"
    exit 0
  fi

  if grep -q '/editor/editor.js' "$CHECK_FILE"; then
    OLD_PID="$(lsof -tiTCP:4444 -sTCP:LISTEN 2>/dev/null | head -n 1)"
    if [ -n "$OLD_PID" ]; then
      kill "$OLD_PID" 2>/dev/null
      for _ in $(seq 1 20); do
        if ! kill -0 "$OLD_PID" 2>/dev/null; then break; fi
        sleep 0.1
      done
      if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "The older editor is still running. Quit its node process in Activity Monitor, then try again."
        exit 1
      fi
    fi
  else
    echo "Port 4444 is already being used by another program."
    exit 1
  fi
fi

# Start the server in the background, logging to editor/server.log.
nohup node editor/server.js > editor/server.log 2>&1 &

# Wait up to ~5 seconds for it to come up.
for _ in $(seq 1 25); do
  if curl -sS -o "$CHECK_FILE" --max-time 1 "$URL" && \
     grep -q 'name="portfolio-editor-token"' "$CHECK_FILE"; then
    open "$URL"
    exit 0
  fi
  sleep 0.2
done

echo "The editor did not start. Check editor/server.log for details."
exit 1
