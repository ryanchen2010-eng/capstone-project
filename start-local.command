#!/bin/zsh

# Start the website and its local chemistry service together.
set -euo pipefail
cd -- "$(dirname -- "$0")"

site_url="http://127.0.0.1:5173/"
chemistry_url="http://127.0.0.1:8000/api/reactions/catalog"

open_site() {
  if [[ "${CAPSTONE_NO_BROWSER:-0}" != "1" ]]; then
    open "$site_url" || print "Open $site_url in your browser."
  fi
}

ready() {
  curl --noproxy '*' --silent --fail --max-time 2 --output /dev/null "$chemistry_url" &&
    curl --noproxy '*' --silent --fail --max-time 2 --output /dev/null "$site_url"
}

if ready; then
  print "Molecule Playground is already running at $site_url"
  open_site
  exit 0
fi

for port in 8000 5173; do
  if /usr/sbin/lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    print -u2 "Port $port is in use by another process. Stop it before starting this preview."
    exit 1
  fi
done

if [[ ! -x .venv/bin/python ]]; then
  print -u2 "Python environment is missing. See the first-time setup in README.md."
  exit 1
fi
if [[ ! -f node_modules/vite/bin/vite.js ]]; then
  print -u2 "Website dependencies are missing. Run 'pnpm install' first."
  exit 1
fi

node_bin="$(command -v node || true)"
if [[ -z "$node_bin" ]]; then
  bundled_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
  if [[ -x "$bundled_node" ]]; then
    node_bin="$bundled_node"
  else
    print -u2 "Node.js was not found. Install Node.js or add it to your PATH."
    exit 1
  fi
fi

chemistry_pid=""
website_pid=""
cleanup() {
  trap - EXIT INT TERM
  if [[ -n "$website_pid" ]]; then
    kill "$website_pid" 2>/dev/null || true
    wait "$website_pid" 2>/dev/null || true
  fi
  if [[ -n "$chemistry_pid" ]]; then
    kill "$chemistry_pid" 2>/dev/null || true
    wait "$chemistry_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

.venv/bin/python server/chemistry_server.py &
chemistry_pid=$!
"$node_bin" node_modules/vite/bin/vite.js --host 127.0.0.1 --strictPort &
website_pid=$!

for attempt in {1..40}; do
  if ! kill -0 "$chemistry_pid" 2>/dev/null || ! kill -0 "$website_pid" 2>/dev/null; then
    print -u2 "A local service stopped before the site was ready. See the error above."
    exit 1
  fi
  if ready; then
    print "Molecule Playground is ready at $site_url"
    print "Keep this Terminal window open. Press Control-C to stop both services."
    open_site
    while kill -0 "$chemistry_pid" 2>/dev/null && kill -0 "$website_pid" 2>/dev/null; do
      sleep 1
    done
    print -u2 "A local service stopped; closing the preview."
    exit 1
  fi
  sleep 0.25
done

print -u2 "The preview did not become ready in 10 seconds. See the errors above."
exit 1
