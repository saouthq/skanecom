#!/usr/bin/env bash
# Essayer SkanEcom sur son poste, en une commande : la base locale avec le
# jeu de démo (trois boutiques), l'API locale, la vitrine compilée et lancée.
# À la fin, les adresses à ouvrir dans le navigateur.
#
#   outils/essayer.sh            prépare tout et lance la vitrine (Ctrl+C l'arrête)
#   outils/essayer.sh arreter    arrête ensuite la base et l'API
#
# Prérequis et pas-à-pas : docs/TESTER.md (Ubuntu, Debian, ou Windows avec
# WSL2). Tout reste sur la machine : la vitrine n'écoute que sur 127.0.0.1.
set -euo pipefail

RACINE=$(cd "$(dirname "$0")/.." && pwd)
PORT=${PORT_VITRINE:-4200}
JOURNAL="$RACINE/.outils/essayer.log"

# Postgres 16 : les binaires de l'installation Debian/Ubuntu ne sont pas
# dans le PATH ; on les cherche à leur place habituelle.
if [ -z "${PG_BIN:-}" ] && [ -x /usr/lib/postgresql/16/bin/initdb ]; then
  export PG_BIN=/usr/lib/postgresql/16/bin
fi

manque() {
  echo "✗ $1" >&2
  echo "  → $2" >&2
  echo "  (détails : docs/TESTER.md)" >&2
  exit 1
}

verifier() {
  [ "$(uname -s)" = Linux ] ||
    manque "Système non pris en charge : $(uname -s)" "SkanEcom se lance sous Linux (Ubuntu, Debian) ou sous Windows avec WSL2."
  [ "$(uname -m)" = x86_64 ] ||
    manque "Processeur non pris en charge : $(uname -m)" "PostgREST et GoTrue sont téléchargés compilés pour x86_64."

  local bin=${PG_BIN:-}
  if [ -z "$bin" ] && command -v pg_config > /dev/null; then bin=$(pg_config --bindir); fi
  [ -n "$bin" ] && [ -x "$bin/initdb" ] ||
    manque "Postgres 16 introuvable" "sudo apt install postgresql-16 postgresql-16-pgtap"
  local version partage
  version=$("$bin/postgres" --version | sed -E 's/^[^0-9]*([0-9]+).*/\1/')
  [ "$version" = 16 ] || manque "Postgres $version trouvé dans $bin, la version 16 est attendue" "sudo apt install postgresql-16, ou PG_BIN=<dossier des binaires de Postgres 16>"
  partage=$("$bin/pg_config" --sharedir 2> /dev/null || echo /usr/share/postgresql/16)
  [ -f "$partage/extension/pgtap.control" ] ||
    manque "pgTAP manque pour Postgres 16" "sudo apt install postgresql-16-pgtap"

  command -v node > /dev/null || manque "Node introuvable" "installer Node 22 (docs/TESTER.md, étape 1)"
  local node
  node=$(node -p 'process.versions.node.split(".")[0]')
  [ "$node" -ge 22 ] || manque "Node $node trouvé, Node 22 au moins est attendu" "nvm install 22 (docs/TESTER.md, étape 1)"
  command -v bun > /dev/null || manque "Bun introuvable" "curl -fsSL https://bun.sh/install | bash, puis rouvrir le terminal"
  for outil in curl tar xz sha256sum psql; do
    command -v "$outil" > /dev/null || manque "« $outil » introuvable" "sudo apt install curl tar xz-utils coreutils postgresql-client-16"
  done

  # La vitrine a besoin de son port ; la base et l'API, elles, sont relancées.
  if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/"; then
    manque "Le port $PORT est déjà pris (une autre vitrine tourne ?)" "l'arrêter, ou choisir un autre port : PORT_VITRINE=4300 outils/essayer.sh"
  fi
}

lancer() {
  verifier
  mkdir -p "$RACINE/.outils"
  : > "$JOURNAL"

  echo "1/4  Base locale et jeu de démo…"
  "$RACINE/outils/base-locale.sh" reinit >> "$JOURNAL" 2>&1 || { tail -20 "$JOURNAL"; exit 1; }

  echo "2/4  API locale…"
  "$RACINE/outils/api-locale.sh" arreter >> "$JOURNAL" 2>&1 || true
  "$RACINE/outils/api-locale.sh" demarrer >> "$JOURNAL" 2>&1 || { tail -20 "$JOURNAL"; exit 1; }

  cd "$RACINE/application"
  echo "3/4  Dépendances et compilation (quelques minutes la première fois)…"
  bun install --frozen-lockfile >> "$JOURNAL" 2>&1 || { tail -20 "$JOURNAL"; exit 1; }
  set -a
  # shellcheck disable=SC1091
  . "$RACINE/.outils/api-locale.env"
  set +a
  bun run build >> "$JOURNAL" 2>&1 || { tail -30 "$JOURNAL"; exit 1; }

  echo "4/4  Vitrine lancée. Ouvrir dans Chrome, Firefox ou Edge :"
  echo
  echo "     http://mode.localhost:$PORT            Maison Selma — mode, gabarit éditorial"
  echo "     http://maymar.localhost:$PORT          Maymar — bagages, gabarit éditorial"
  echo "     http://quincaillerie.localhost:$PORT   Quincaillerie du Sud — gabarit technique"
  echo "     http://beaute.localhost:$PORT          Yasmine Beauté — beauté, gabarit éditorial"
  echo "     http://console.localhost:$PORT         Console : admin@skanecom.test / console-locale-skanecom"
  echo
  echo "     Ctrl+C arrête la vitrine ; ensuite : outils/essayer.sh arreter"
  echo "     (journal complet : .outils/essayer.log)"
  echo
  # --host 127.0.0.1 : rien n'est ouvert au réseau local — le serveur
  # d'aperçu expose aussi des outils de développement internes.
  exec bun run start --port "$PORT" --strictPort --host 127.0.0.1
}

arreter() {
  "$RACINE/outils/api-locale.sh" arreter || true
  "$RACINE/outils/base-locale.sh" arreter || true
  echo "Base et API arrêtées."
}

case "${1:-lancer}" in
  lancer) lancer ;;
  arreter) arreter ;;
  *) echo "usage : outils/essayer.sh [arreter]" >&2; exit 1 ;;
esac
