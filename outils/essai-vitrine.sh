#!/usr/bin/env bash
# Essai de bout en bout de la vitrine : les trois boutiques du jeu de démo,
# servies par la même application, ne se mélangent jamais — et chacune a
# son gabarit.
#
# Prérequis (fait par la CI, .github/workflows/vitrine.yml) :
#   outils/base-locale.sh reinit        base locale avec le jeu de démo
#   outils/api-locale.sh demarrer       API locale
#   application compilée et lancée      (cd application && bun run build && bun run start --port 4200 --host 127.0.0.1)
#
#   outils/essai-vitrine.sh [http://127.0.0.1:4200]
set -u
B=${1:-http://127.0.0.1:4200}
M=maymar.localhost
Q=quincaillerie.localhost
S=mode.localhost
echecs=0

code()  { curl -s -o /dev/null -w "%{http_code}" -H "Host: $1" "$B$2"; }
corps() { curl -s -H "Host: $1" "$B$2"; }
verifie() {
  if eval "$2"; then echo "ok     — $1"; else echo "ÉCHEC  — $1"; echecs=$((echecs + 1)); fi
}

verifie "accueil de Maymar" '[ "$(code $M /)" = 200 ]'
verifie "accueil de la quincaillerie" '[ "$(code $Q /)" = 200 ]'
verifie "accueil de Maison Selma" '[ "$(code $S /)" = 200 ]'
verifie "fiche de Maymar, chez Maymar" '[ "$(code $M /produit/valise-rigide-abs-4-roues)" = 200 ]'
verifie "fiche de la quincaillerie introuvable chez Maymar" '[ "$(code $M /produit/perceuse-visseuse-14v)" = 404 ]'
verifie "fiche de Maymar introuvable chez la quincaillerie" '[ "$(code $Q /produit/valise-rigide-abs-4-roues)" = 404 ]'
verifie "rayon de la quincaillerie introuvable chez Maymar" '[ "$(code $M /categorie/outillage)" = 404 ]'
verifie "domaine inconnu : 404" '[ "$(code inconnu.localhost /)" = 404 ]'
verifie "adresse interne /_b/… jamais servie" '[ "$(code $M /_b/quincaillerie-demo/produit/perceuse-visseuse-14v)" = 404 ]'
verifie "chaque boutique a son gabarit" \
  'corps $M / | grep -q "data-gabarit=\"editorial\"" && corps $S / | grep -q "data-gabarit=\"editorial\"" && corps $Q / | grep -q "data-gabarit=\"technique\""'
verifie "chaque gabarit a ses couleurs" \
  'corps $M / | grep -q -- "--theme-fond:#FAF8F5" && corps $Q / | grep -q -- "--theme-fond:#F3F3F1"'
verifie "la fiche de mode chez Maison Selma seulement" \
  '[ "$(code $S /produit/robe-bretelles-terracotta)" = 200 ] && [ "$(code $M /produit/robe-bretelles-terracotta)" = 404 ] && [ "$(code $Q /produit/robe-bretelles-terracotta)" = 404 ]'
verifie "les photos de démonstration sont servies" \
  'corps $S /produit/robe-bretelles-terracotta | grep -q "maison-selma/produits/robe-bretelles-terracotta-1-1200.webp" && [ "$(curl -s -o /dev/null -w "%{http_code}" "${NEXT_PUBLIC_FICHIERS_URL:-http://127.0.0.1:54321/fichiers}/maison-selma/produits/robe-bretelles-terracotta-1-1200.webp")" = 200 ]'
verifie "chaque boutique a son nom dans ses titres" \
  'corps $M /catalogue | grep -q "<title>Tout le catalogue | Maymar</title>" && corps $Q /catalogue | grep -q "<title>Tout le catalogue | Quincaillerie du Sud</title>"'
verifie "la recherche d'une référence reste dans sa boutique" \
  'corps $Q "/recherche?q=PV14" | grep -q "Une pièce trouvée" && corps $M "/recherche?q=PV14" | grep -q "Aucune pièce trouvée"'
verifie "le formulaire de filtres mène à l'adresse canonique" \
  '[ "$(curl -s -o /dev/null -w "%{redirect_url}" -H "Host: $M" "$B/filtrer?base=/catalogue&a.couleur=Noir&a.couleur=Bordeaux&stock=1")" = "http://$M/catalogue/couleur=Bordeaux~Noir/stock" ]'
verifie "une liste filtrée est filtrée par la base" 'corps $M "/catalogue/couleur=Gris" | grep -q "1 modèle sur 4"'
verifie "une liste filtrée est mise en cache" \
  'sleep 1.5; curl -s -D - -o /dev/null -H "Host: $M" "$B/catalogue/couleur=Gris" | grep -qi "x-vinext-cache: HIT"'
verifie "robots.txt propre à la boutique" 'corps $Q /robots.txt | grep -q "Sitemap: https://quincaillerie.localhost/sitemap.xml"'
verifie "plan du site sans les fiches de l'autre boutique" \
  'corps $M /sitemap.xml | grep -q "valise-rigide-abs-4-roues" && ! corps $M /sitemap.xml | grep -q "perceuse" && ! corps $M /sitemap.xml | grep -q "robe-"'

echo
if [ "$echecs" -eq 0 ]; then echo "Vitrine : tous les essais passent."; else echo "Vitrine : $echecs échec(s)."; exit 1; fi
