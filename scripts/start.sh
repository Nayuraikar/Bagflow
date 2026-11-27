#!/bin/sh
# Start the API and the web app together. Ctrl+C stops both.
#   BAGFLOW_API_ADDR  where the API listens (default 127.0.0.1:3001)
#   BAGFLOW_WEB_PORT  port of the web app   (default 5173)
set -eu
cd "$(dirname "$0")/.."

api_addr=${BAGFLOW_API_ADDR:-127.0.0.1:3001}
web_port=${BAGFLOW_WEB_PORT:-5173}
api_url="http://$api_addr"
web_url="http://localhost:$web_port"

fail() { echo "start: $*" >&2; exit 1; }
answers() { curl -s -o /dev/null --max-time 2 "$1"; }
ready() { curl -sf -o /dev/null --max-time 5 "$1"; }

[ -x web/node_modules/.bin/vite ] || fail "web packages are missing. Run scripts/setup.sh first"
# otherwise the web app would silently talk to whatever is already there
if answers "$api_url"; then
    fail "something already answers on $api_addr. Stop it, or run: BAGFLOW_API_ADDR=127.0.0.1:3101 scripts/start.sh"
fi
if answers "$web_url"; then
    fail "something already answers on port $web_port. Stop it, or run: BAGFLOW_WEB_PORT=5273 scripts/start.sh"
fi

cargo build --release -p bagflow-api

api_pid=
web_pid=
cleanup() {
    for pid in $web_pid $api_pid; do
        kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

# wait_for PID URL NAME: until URL succeeds, as long as PID is running
wait_for() {
    tries=0
    until ready "$2"; do
        kill -0 "$1" 2>/dev/null || fail "$3 stopped; see its message above"
        tries=$((tries + 1))
        [ "$tries" -lt 60 ] || fail "$3 did not answer at $2"
        sleep 1
    done
}

# the program itself, not `cargo run`, so that stopping this script stops it
BAGFLOW_API_ADDR=$api_addr "${CARGO_TARGET_DIR:-target}/release/bagflow-api" &
api_pid=$!
wait_for "$api_pid" "$api_url/api/health" "the API"

(cd web && BAGFLOW_API_URL=$api_url exec node_modules/.bin/vite --port "$web_port" --strictPort) &
web_pid=$!
# through the web app's proxy, so this also checks that it reaches the API
wait_for "$web_pid" "$web_url/api/health" "the web app"

echo
echo "BagFlow is running: $web_url"
echo "API: $api_url    Ctrl+C stops both."

while kill -0 "$api_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
    sleep 1
done
fail "the API or the web app stopped; see the messages above"
