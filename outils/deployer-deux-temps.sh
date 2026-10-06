#!/usr/bin/env bash
# Déployer l'application en deux temps, cache prérempli (docs/DEPLOIEMENT.md).
#
# Une version neuve démarre avec un cache vide (le cache des pages est rangé
# par version : runtime-cache/<version>/ dans le bucket du response store) :
# déployée d'un coup, le premier visiteur de chaque page attend son rendu.
# Ici, la version est d'abord déposée sans trafic, préchauffée boutique par
# boutique, puis seulement mise en service :
#
#   1. dépôt de la version (wrangler versions upload, par vinext) ;
#   2. déploiement à 0 % à côté de celle qui sert (les en-têtes de version
#      ne visent qu'une version présente dans le déploiement) ;
#   3. préchauffage de chaque boutique (outils/prechauffer.mjs) — un accueil
#      qui ne répond pas arrête tout : la version qui sert garde 100 % ;
#   4. la nouvelle version à 100 % ;
#   5. le cache des versions retirées s'efface (une règle d'expiration par
#      préfixe) ; la version précédente garde le sien, pour revenir en arrière.
#
# À lancer depuis application/, après `bun run build` et le déploiement du
# response store. Variables : CIBLES (adresses https des boutiques), WORKER
# (skanecom-application), BUCKET_CACHE, WRANGLER (npx -y wrangler@4).
set -euo pipefail

WORKER="${WORKER:-skanecom-application}"
BUCKET_CACHE="${BUCKET_CACHE:-skanecom-application-response-store-cache-bodies}"
WRANGLER="${WRANGLER:-npx -y wrangler@4}"
: "${CIBLES:?CIBLES : les adresses https des boutiques à préchauffer}"
ICI="$(cd "$(dirname "$0")" && pwd)"

# La version qui sert aujourd'hui (100 % du trafic).
actuelle="$($WRANGLER deployments status --name "$WORKER" --json | python3 -c '
import json, sys
d = json.load(sys.stdin)
d = d[-1] if isinstance(d, list) else d
v = [x for x in d.get("versions", []) if x.get("percentage") == 100]
print(v[0]["version_id"] if v else "")')"
if [ -z "$actuelle" ]; then
  echo "Aucune version ne sert 100 % du trafic (déploiement progressif en cours ?) : rien n'est fait." >&2
  exit 1
fi
echo "Version en service : $actuelle"

# 1. Déposer la nouvelle version, sans trafic.
bun run deploy -- --skip-build --no-promote
nouvelle="$($WRANGLER versions list --name "$WORKER" --json | python3 -c '
import json, sys
d = json.load(sys.stdin)
d = d.get("items", d) if isinstance(d, dict) else d
def quand(v): return (v.get("metadata") or {}).get("created_on") or v.get("created_on") or ""
v = sorted(d, key=quand)
print((v[-1].get("id") or v[-1].get("version_id")) if v else "")')"
if [ -z "$nouvelle" ] || [ "$nouvelle" = "$actuelle" ]; then
  echo "La nouvelle version est introuvable après le dépôt." >&2
  exit 1
fi
echo "Version déposée : $nouvelle"

# 2. La mettre dans le déploiement, à 0 %.
$WRANGLER versions deploy "$nouvelle@0%" "$actuelle@100%" --name "$WORKER" --yes \
  --message "Préchauffage de $nouvelle"

# 3. Préchauffer chaque boutique ; un échec rend la main à la version en service.
if ! WORKER="$WORKER" VERSION="$nouvelle" CIBLES="$CIBLES" node "$ICI/prechauffer.mjs"; then
  $WRANGLER versions deploy "$actuelle@100%" --name "$WORKER" --yes --message "Préchauffage échoué : $actuelle reste en service"
  exit 1
fi

# 4. La mettre en service.
$WRANGLER versions deploy "$nouvelle@100%" --name "$WORKER" --yes --message "Préchauffée, en service"
echo "En service : $nouvelle (précédente, gardée pour revenir en arrière : $actuelle)"

# 5. Effacer le cache des versions plus anciennes que la précédente : une
#    règle d'expiration par préfixe, à un jour (R2 n'a pas d'effacement de
#    préfixe en une commande). Une règle déjà posée est sautée.
regles="$($WRANGLER r2 bucket lifecycle list "$BUCKET_CACHE" 2>/dev/null || true)"
$WRANGLER versions list --name "$WORKER" --json | python3 -c '
import json, sys
d = json.load(sys.stdin)
d = d.get("items", d) if isinstance(d, dict) else d
def quand(v): return (v.get("metadata") or {}).get("created_on") or v.get("created_on") or ""
garder = set(sys.argv[1:3])
for v in sorted(d, key=quand)[:-2][-20:]:
    i = v.get("id") or v.get("version_id")
    if i and i not in garder: print(i)' "$nouvelle" "$actuelle" | while read -r retiree; do
  nom="retiree-${retiree:0:8}"
  if printf '%s' "$regles" | grep -q "$nom"; then continue; fi
  $WRANGLER r2 bucket lifecycle add "$BUCKET_CACHE" "$nom" "runtime-cache/$retiree/" --expire-days 1 --force \
    && echo "Cache de $retiree : effacé sous un jour" \
    || echo "Cache de $retiree : la règle n'a pas pu être posée (à refaire)" >&2
done
