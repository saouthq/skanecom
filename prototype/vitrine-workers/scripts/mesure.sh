#!/usr/bin/env bash
# Mesure la vitrine déployée : code HTTP, état du cache vinext, âge de la page
# en cache (en-tête Age), point de présence Cloudflare (fin de l'en-tête cf-ray)
# et temps du premier octet sur 5 essais. Sortie en tableau Markdown (pour le résumé GitHub Actions).
# Usage : scripts/mesure.sh https://vitrine.exemple.workers.dev "Titre"
set -u
BASE="$1"
TITRE="${2:-Mesures}"
PAGES=("/" "/catalogue" "/categorie/valises" "/produit/valise-cabine-business" "/produit/valise-souple-extensible" "/produit/set-3-valises-rigides" "/recherche?q=cabine")

echo "### $TITRE"
echo
echo "| Page | HTTP (5 essais) | Cache vinext (5 essais) | Âge en s (5 essais) | PoP | 1er octet en ms (5 essais) |"
echo "|---|---|---|---|---|---|"
for p in "${PAGES[@]}"; do
  codes=(); caches=(); ages=(); temps=(); pop="?"
  for _ in 1 2 3 4 5; do
    entetes=$(mktemp)
    mesure=$(curl -s -o /dev/null -D "$entetes" -w "%{http_code} %{time_starttransfer}" "$BASE$p")
    codes+=("${mesure%% *}")
    temps+=("$(awk -v t="${mesure##* }" 'BEGIN{printf "%d", t*1000}')")
    caches+=("$(grep -i '^x-vinext-cache:' "$entetes" | awk '{print $2}' | tr -d '\r' | head -1)")
    age=$(grep -i '^age:' "$entetes" | awk '{print $2}' | tr -d '\r' | head -1)
    ages+=("${age:--}")
    ray=$(grep -i '^cf-ray:' "$entetes" | awk '{print $2}' | tr -d '\r')
    [ -n "$ray" ] && pop="${ray##*-}"
    rm -f "$entetes"
  done
  echo "| \`$p\` | ${codes[*]} | ${caches[*]:--} | ${ages[*]} | $pop | ${temps[*]} |"
done
echo
