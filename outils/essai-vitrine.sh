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
entetes() { curl -s -D - -o /dev/null -H "Host: $1" "$B$2" | tr -d "\r"; }
# POST JSON au tunnel, depuis la boutique elle-même (en-tête Origin) ou non.
poste() { curl -s -X POST -H "Host: $1" -H "content-type: application/json" ${4:+-H "Origin: http://$1"} -d "$3" "$B$2"; }

# L'API locale, pour trouver une variante de Maison Selma.
if [ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ] && [ -f "$(dirname "$0")/../.outils/api-locale.env" ]; then
  set -a; . "$(dirname "$0")/../.outils/api-locale.env"; set +a
fi
API=${NEXT_PUBLIC_SUPABASE_URL:-http://127.0.0.1:54321}
VARIANTE_SELMA=$(curl -s "$API/rest/v1/variantes?select=id&boutique_id=eq.00000000-0000-4000-8000-000000000003&stock=gt.0&limit=1" \
  -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" | grep -o '[0-9a-f]\{8\}-[0-9a-f-]\{27\}' | head -1)
PANIER_SELMA="{\"lignes\":[{\"variante_id\":\"$VARIANTE_SELMA\",\"quantite\":1}],\"gouvernorat\":\"tunis\"}"
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
  '[ "$(curl -s -D - -o /dev/null -H "Host: $M" "$B/filtrer?base=/catalogue&a.couleur=Noir&a.couleur=Bordeaux&stock=1" | tr -d "\r" | sed -n "s/^[Ll]ocation: //p")" = "/catalogue/couleur=Bordeaux~Noir/stock" ]'
verifie "une liste filtrée est filtrée par la base" 'corps $M "/catalogue/couleur=Gris" | grep -q "1 modèle sur 4"'
verifie "une liste filtrée est mise en cache" \
  'sleep 1.5; curl -s -D - -o /dev/null -H "Host: $M" "$B/catalogue/couleur=Gris" | grep -qi "x-vinext-cache: HIT"'
verifie "robots.txt propre à la boutique" 'corps $Q /robots.txt | grep -q "Sitemap: https://quincaillerie.localhost/sitemap.xml"'
verifie "plan du site sans les fiches de l'autre boutique" \
  'corps $M /sitemap.xml | grep -q "valise-rigide-abs-4-roues" && ! corps $M /sitemap.xml | grep -q "perceuse" && ! corps $M /sitemap.xml | grep -q "robe-"'

# Le tunnel de commande
verifie "la page de commande n'est ni en cache ni indexée" \
  'entetes $S /commande > /dev/null; e=$(entetes $S /commande); echo "$e" | grep -qi "^cache-control: private, no-store" && echo "$e" | grep -qi "^x-robots-tag: noindex" && ! echo "$e" | grep -qi "x-vinext-cache: HIT"'
verifie "le devis relit la variante dans SA boutique : vendue chez Selma, inconnue chez Maymar" \
  '[ -n "$VARIANTE_SELMA" ] && poste $S /commande/devis "$PANIER_SELMA" | grep -q "\"disponible\":true" && poste $M /commande/devis "$PANIER_SELMA" | grep -q "\"disponible\":false" && ! poste $M /commande/devis "$PANIER_SELMA" | grep -q "produit_nom\":\""'
verifie "commander exige une page de la boutique (même origine)" \
  '[ "$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Host: $S" -H "content-type: application/json" -d "{}" "$B/commande/passer")" = 403 ]'
verifie "sans compte, la commande est refusée (compte obligatoire par défaut)" \
  'poste $S /commande/passer "{\"cle\":\"essai-http-sans-compte-01\",\"lignes\":[{\"variante_id\":\"$VARIANTE_SELMA\",\"quantite\":1}],\"contact\":{\"nom\":\"Essai\",\"telephone\":\"20123456\"},\"livraison\":{\"ligne1\":\"1 rue de Rome\",\"ville\":\"Tunis\",\"gouvernorat\":\"tunis\"},\"total\":1}" oui | grep -q "\"raison\":\"compte\""'
verifie "la page de fin ne montre rien sans le jeton de la commande" 'corps $S /commande/merci | grep -q "Aucune commande récente"'
verifie "mes commandes : jamais en cache ni indexée, rien de personnel dans la page servie" \
  'e=$(entetes $S /compte); echo "$e" | grep -qi "^cache-control: private, no-store" && echo "$e" | grep -qi "^x-robots-tag: noindex" && corps $S /compte | grep -q "Mes commandes" && ! corps $S /compte | grep -q "+216"'

echo
if [ "$echecs" -eq 0 ]; then echo "Vitrine : tous les essais passent."; else echo "Vitrine : $echecs échec(s)."; exit 1; fi
