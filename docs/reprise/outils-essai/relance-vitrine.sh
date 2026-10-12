#!/usr/bin/env bash
# Relance locale pour les essais : arrête la vitrine, recompile (si --build),
# recrée la base et l'API, relance la vitrine en arrière-plan.
set -uo pipefail
R="$(cd "$(dirname "$0")/../../.." && pwd)"
S="${ESSAIS:-/tmp/skanecom-essais}"; mkdir -p "$S"
export PG_BIN=/usr/lib/postgresql/16/bin
for pid in $(ps -eo pid,cmd | awk '/vite preview|workerd serve/ && !/awk/ {print $1}'); do kill "$pid" 2>/dev/null; done
sleep 1
cd "$R/application"
set -a; . "$R/.outils/api-locale.env"; set +a
if [ "${1:-}" = "--build" ]; then
  bun run build > "$S/build.log" 2>&1 || { echo "BUILD KO"; tail -30 "$S/build.log"; exit 1; }
  echo "build ok"
fi
"$R/outils/base-locale.sh" reinit > "$S/reinit.log" 2>&1 || { echo "REINIT KO"; tail -20 "$S/reinit.log"; exit 1; }
"$R/outils/api-locale.sh" demarrer > "$S/api.log" 2>&1 || { echo "API KO"; tail -20 "$S/api.log"; exit 1; }
set -a; . "$R/.outils/api-locale.env"; set +a
setsid nohup bun run start --port 4200 --strictPort --host 127.0.0.1 > "$S/vitrine.log" 2>&1 < /dev/null &
for i in $(seq 1 90); do
  curl -s -o /dev/null --max-time 2 -H "host: mode.localhost:4200" http://127.0.0.1:4200/ && { echo "vitrine prête"; exit 0; }
  sleep 1
done
echo "vitrine KO"; tail -20 "$S/vitrine.log"; exit 1
