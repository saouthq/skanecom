#!/usr/bin/env bash
# Écoute les journaux des deux Workers de la vitrine (application et cache de
# réponses) pendant quelques requêtes, puis les résume (scripts/journaux.py).
# Usage : scripts/diagnostic.sh https://vitrine.exemple.workers.dev /chemin [/chemin…]
set -u
BASE="$1"; shift
for w in skanecom-prototype-vitrine skanecom-prototype-vitrine-response-store; do
  npx -y wrangler@4 tail "$w" --format json > "tail-$w.json" 2> "tail-$w.err" &
done
sleep 20
for p in "$@"; do
  for _ in 1 2 3; do
    curl -s -o /dev/null -D - "$BASE$p" \
      | grep -iE '^(HTTP|x-vinext-cache|age|cf-cache-status|cache-control|x-workers-response-store)' \
      | tr -d '\r' | paste -sd' ' | sed "s|^|$p : |"
    sleep 3
  done
done
sleep 15
pkill -f "wrangler.*tail" || true
sleep 1
python3 scripts/journaux.py tail-*.json
for f in tail-*.err; do echo "--- $f"; tail -3 "$f"; done
