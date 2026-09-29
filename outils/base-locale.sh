#!/usr/bin/env bash
# Base locale SkanEcom : un Postgres ordinaire qui imite ce que Supabase
# fournit (outils/supabase-simule.sql), sur le port 54322 comme la base locale
# de la CLI Supabase. Aucun Docker nécessaire.
#
#   outils/base-locale.sh demarrer          crée le cluster au besoin et le démarre
#   outils/base-locale.sh reinit [--vide]   recrée la base : simulation, migrations,
#                                           puis jeu de démo (sauf --vide)
#   outils/base-locale.sh tester            lance les tests pgTAP de supabase/tests
#   outils/base-locale.sh psql              ouvre psql sur la base
#   outils/base-locale.sh arreter           arrête le serveur
#
# Variables : BASE_LOCALE_PORT (54322), BASE_LOCALE_DONNEES (dossier du
# cluster), BASE_LOCALE_NOM (skanecom), PG_BIN (dossier des binaires Postgres).
set -euo pipefail

RACINE=$(cd "$(dirname "$0")/.." && pwd)
PORT=${BASE_LOCALE_PORT:-54322}
BASE=${BASE_LOCALE_NOM:-skanecom}
BIN=${PG_BIN:-$(pg_config --bindir)}

# Postgres refuse de tourner en root : dans ce cas on passe par l'utilisateur
# système « postgres », et le cluster vit dans /tmp où il peut écrire.
if [ "$(id -u)" = "0" ]; then
  DONNEES=${BASE_LOCALE_DONNEES:-/tmp/skanecom-base-locale}
  en_postgres() { runuser -u postgres -- "$@"; }
else
  DONNEES=${BASE_LOCALE_DONNEES:-$RACINE/.base-locale}
  en_postgres() { "$@"; }
fi

sql() { PGOPTIONS='-c client_min_messages=warning' psql -X -q -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 "$@"; }

demarrer() {
  if [ ! -f "$DONNEES/PG_VERSION" ]; then
    mkdir -p "$DONNEES"
    [ "$(id -u)" = "0" ] && chown postgres "$DONNEES"
    en_postgres "$BIN/initdb" -D "$DONNEES" -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 > /dev/null
  fi
  if en_postgres "$BIN/pg_ctl" -D "$DONNEES" status > /dev/null 2>&1; then
    echo "Base locale déjà démarrée (port $PORT)."
    return
  fi
  en_postgres "$BIN/pg_ctl" -D "$DONNEES" -l "$DONNEES/journal.log" -w \
    -o "-p $PORT -k $DONNEES -c listen_addresses=127.0.0.1" start > /dev/null
  echo "Base locale démarrée : postgresql://postgres@127.0.0.1:$PORT/$BASE"
}

reinit() {
  demarrer
  sql -d postgres -c "drop database if exists $BASE with (force)" -c "create database $BASE"
  sql -d "$BASE" -f "$RACINE/outils/supabase-simule.sql"
  shopt -s nullglob
  for f in "$RACINE"/supabase/migrations/*.sql; do
    echo "  migration $(basename "$f")"
    sql -d "$BASE" -f "$f"
  done
  if [ "${1:-}" != "--vide" ] && [ -f "$RACINE/supabase/seed.sql" ]; then
    echo "  jeu de démo supabase/seed.sql"
    sql -d "$BASE" -f "$RACINE/supabase/seed.sql"
  fi
  echo "Base $BASE prête."
}

tester() {
  pg_prove -h 127.0.0.1 -p "$PORT" -U postgres -d "$BASE" --ext .sql -r "$RACINE/supabase/tests"
}

case "${1:-}" in
  demarrer) demarrer ;;
  reinit)   shift; reinit "$@" ;;
  tester)   tester ;;
  psql)     psql -X -h 127.0.0.1 -p "$PORT" -U postgres -d "$BASE" ;;
  arreter)  en_postgres "$BIN/pg_ctl" -D "$DONNEES" stop -m fast ;;
  *) sed -n '2,16p' "$0"; exit 1 ;;
esac
