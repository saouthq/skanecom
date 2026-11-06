#!/usr/bin/env bash
# Relance l'application sans la recompiler (un cache de thème vide).
R="$(cd "$(dirname "$0")/../../.." && pwd)"; S="${ESSAIS:-/tmp/skanecom-essais}"; mkdir -p "$S"
for pid in $(ps -eo pid,cmd | awk '/vite preview|workerd serve/ && !/awk/ {print $1}'); do kill "$pid" 2>/dev/null; done
sleep 1; cd "$R/application"; set -a; . "$R/.outils/api-locale.env"; set +a
setsid nohup bun run start --port 4200 --strictPort --host 127.0.0.1 > "$S/vitrine.log" 2>&1 < /dev/null &
for i in $(seq 1 60); do curl -s -o /dev/null --max-time 2 -H "host: studio.localhost:4200" http://127.0.0.1:4200/ && exit 0; sleep 1; done; exit 1
