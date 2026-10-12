#!/usr/bin/env bash
# Recompile et relance la vitrine seule (la base, l'API et les sessions restent).
set -uo pipefail
R="$(cd "$(dirname "$0")/../../.." && pwd)"
S="${ESSAIS:-/tmp/skanecom-essais}"; mkdir -p "$S"
for pid in $(ps -eo pid,cmd | awk '/vite preview|workerd serve/ && !/awk/ {print $1}'); do kill "$pid" 2>/dev/null; done
sleep 1
cd "$R/application"
set -a; . "$R/.outils/api-locale.env"; set +a
bun run build > "$S/build.log" 2>&1 || { echo "BUILD KO"; tail -30 "$S/build.log"; exit 1; }
echo "build ok"
setsid nohup bun run start --port 4200 --strictPort --host 127.0.0.1 > "$S/vitrine.log" 2>&1 < /dev/null &
for i in $(seq 1 90); do
  curl -s -o /dev/null --max-time 2 -H "host: mode.localhost:4200" http://127.0.0.1:4200/ && { echo "vitrine prête"; exit 0; }
  sleep 1
done
echo "vitrine KO"; tail -20 "$S/vitrine.log"; exit 1
