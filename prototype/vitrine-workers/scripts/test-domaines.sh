#!/usr/bin/env bash
# Test de séparation du cache entre deux domaines. Les deux boutiques demandent
# la même adresse publique (/test-domaine) en alternance. Chaque réponse doit
# nommer sa propre boutique, y compris quand elle vient du cache (HIT).
# Usage : scripts/test-domaines.sh https://skanecom-faux-domaines.exemple.workers.dev "Titre"
set -u
BASE="$1"
TITRE="${2:-Séparation du cache entre domaines}"
ECHECS=0

echo "### $TITRE"
echo
echo "| Essai | Domaine demandé | HTTP | Cache vinext | Boutique affichée | Généré à | Verdict |"
echo "|---|---|---|---|---|---|---|"
essai=0
for _ in 1 2 3; do
  for b in a b; do
    essai=$((essai + 1))
    entetes=$(mktemp); corps=$(mktemp)
    code=$(curl -s -o "$corps" -D "$entetes" -w "%{http_code}" "$BASE/boutique-$b.exemple.tn/test-domaine")
    cache=$(grep -i '^x-vinext-cache:' "$entetes" | awk '{print $2}' | tr -d '\r' | head -1)
    affichee=$(grep -oE 'boutique=[a-z-]+' "$corps" | head -1 | cut -d= -f2)
    genere=$(grep -oE 'genere=[0-9T:.-]+Z' "$corps" | head -1 | cut -d= -f2)
    if [ "$code" = "200" ] && [ "$affichee" = "boutique-$b" ]; then verdict="ok"; else verdict="**ÉCHEC**"; ECHECS=$((ECHECS + 1)); fi
    echo "| $essai | boutique-$b | $code | ${cache:--} | ${affichee:--} | ${genere:--} | $verdict |"
    rm -f "$entetes" "$corps"
  done
done
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/boutique-a.exemple.tn/_b/boutique-b/test-domaine")
if [ "$code" = "404" ]; then verdict="ok"; else verdict="**ÉCHEC**"; ECHECS=$((ECHECS + 1)); fi
echo "| accès direct | boutique-a demande \`/_b/boutique-b/test-domaine\` | $code | - | - | - | $verdict (404 attendu) |"
echo
if [ "$ECHECS" -eq 0 ]; then echo "**Séparation du cache : réussie.**"; else echo "**Séparation du cache : $ECHECS échec(s).**"; fi
echo
