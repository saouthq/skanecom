#!/usr/bin/env bash
# Base locale SkanEcom : un Postgres ordinaire qui imite ce que Supabase
# fournit (outils/supabase-simule.sql), sur le port 54322 comme la base locale
# de la CLI Supabase. Aucun Docker nécessaire.
#
# Comme chez Supabase, le superutilisateur s'appelle `supabase_admin` et
# `postgres` n'est pas superutilisateur : les migrations, le jeu de démo et
# les tests tournent sous `postgres`.
#
#   outils/base-locale.sh demarrer          crée le cluster au besoin et le démarre
#   outils/base-locale.sh reinit [--vide]   recrée la base : simulation, schéma auth
#                                           (GoTrue), migrations, puis jeu de démo
#                                           (sauf --vide)
#   outils/base-locale.sh tester            lance les tests pgTAP de supabase/tests
#   outils/base-locale.sh psql              ouvre psql sur la base (rôle postgres)
#   outils/base-locale.sh arreter           arrête le serveur
#   outils/base-locale.sh detruire          arrête le serveur et efface le cluster
#
# Variables : BASE_LOCALE_PORT (54322), BASE_LOCALE_DONNEES (dossier du
# cluster), BASE_LOCALE_NOM (skanecom), PG_BIN (dossier des binaires Postgres).
set -euo pipefail

RACINE=$(cd "$(dirname "$0")/.." && pwd)
PORT=${BASE_LOCALE_PORT:-54322}
BASE=${BASE_LOCALE_NOM:-skanecom}
BIN=${PG_BIN:-$(pg_config --bindir)}
. "$RACINE/outils/gotrue.sh"

# Postgres refuse de tourner en root : dans ce cas on passe par l'utilisateur
# système « postgres », et le cluster vit dans /tmp où il peut écrire.
if [ "$(id -u)" = "0" ]; then
  DONNEES=${BASE_LOCALE_DONNEES:-/tmp/skanecom-base-locale}
  en_postgres() { runuser -u postgres -- "$@"; }
else
  DONNEES=${BASE_LOCALE_DONNEES:-$RACINE/.base-locale}
  en_postgres() { "$@"; }
fi

psql_en() {
  local role=$1; shift
  PGOPTIONS='-c client_min_messages=warning' psql -X -q -h 127.0.0.1 -p "$PORT" -U "$role" -v ON_ERROR_STOP=1 "$@"
}

demarrer() {
  if [ ! -f "$DONNEES/PG_VERSION" ]; then
    mkdir -p "$DONNEES"
    [ "$(id -u)" = "0" ] && chown postgres "$DONNEES"
    en_postgres "$BIN/initdb" -D "$DONNEES" -U supabase_admin --auth=trust --encoding=UTF8 --locale=C.UTF-8 > /dev/null
  fi
  if ! en_postgres "$BIN/pg_ctl" -D "$DONNEES" status > /dev/null 2>&1; then
    # Notre cluster est arrêté mais le port répond : c'est une autre base
    # (celle d'un autre dossier, ou un autre Postgres). On le dit.
    if (exec 3<> "/dev/tcp/127.0.0.1/$PORT") 2> /dev/null; then
      echo "Le port $PORT est déjà pris par une autre base (lancée depuis un autre dossier ?)." >&2
      echo "  → l'arrêter (outils/base-locale.sh arreter dans son dossier), ou choisir un autre port : BASE_LOCALE_PORT=…" >&2
      exit 1
    fi
    en_postgres "$BIN/pg_ctl" -D "$DONNEES" -l "$DONNEES/journal.log" -w \
      -o "-p $PORT -k $DONNEES -c listen_addresses=127.0.0.1" start > /dev/null
  fi
  if ! psql_en supabase_admin -d postgres -c "select 1" > /dev/null 2>&1; then
    echo "Ce cluster n'a pas de superutilisateur supabase_admin (créé par une ancienne version du script)."
    echo "Lancez : outils/base-locale.sh detruire, puis outils/base-locale.sh reinit"
    exit 1
  fi
  psql_en supabase_admin -d postgres -c "
    do \$\$ begin
      if not exists (select 1 from pg_roles where rolname = 'postgres') then
        create role postgres login createrole createdb bypassrls;
      end if;
    end \$\$;"
  echo "Base locale démarrée : postgresql://postgres@127.0.0.1:$PORT/$BASE"
}

reinit() {
  demarrer
  psql_en supabase_admin -d postgres \
    -c "drop database if exists $BASE with (force)" \
    -c "create database $BASE owner postgres"
  # Les fichiers déposés en local (le relais tient lieu de R2) suivent la base.
  rm -rf "$RACINE/.outils/fichiers"
  psql_en supabase_admin -d "$BASE" -f "$RACINE/outils/supabase-simule.sql"
  # Le schéma auth, par GoTrue lui-même, comme chez Supabase.
  telecharger_gotrue
  echo "  schéma auth (migrations de GoTrue $GOTRUE_VERSION)"
  (gotrue_env "$PORT" "$BASE" && "$GOTRUE_DOSSIER/auth" migrate > "$RACINE/.outils/gotrue-migrate.log" 2>&1) || {
    echo "Migrations de GoTrue en échec : voir .outils/gotrue-migrate.log" >&2; exit 1; }
  shopt -s nullglob
  for f in "$RACINE"/supabase/migrations/*.sql; do
    echo "  migration $(basename "$f")"
    psql_en postgres -d "$BASE" -f "$f"
  done
  if [ "${1:-}" != "--vide" ]; then
    # Le jeu de démo, puis sa suite (fichiers à part : l'aperçu en ligne joue
    # chaque jeu une seule fois — supabase/functions/apercu-installer).
    for f in seed.sql seed-suite.sql seed-promotions.sql seed-reassort.sql seed-paniers.sql seed-favoris.sql seed-ensemble.sql seed-avis-photos.sql; do
      [ -f "$RACINE/supabase/$f" ] || continue
      echo "  jeu de démo supabase/$f"
      psql_en postgres -d "$BASE" -f "$RACINE/supabase/$f"
    done
  fi
  # Si l'API locale tourne, PostgREST relit le schéma (nouvelles fonctions).
  psql_en postgres -d "$BASE" -c "notify pgrst, 'reload schema'" > /dev/null
  echo "Base $BASE prête."
}

tester() {
  pg_prove -h 127.0.0.1 -p "$PORT" -U postgres -d "$BASE" --ext .sql -r "$RACINE/supabase/tests"
}

arreter() {
  en_postgres "$BIN/pg_ctl" -D "$DONNEES" stop -m fast 2> /dev/null || true
}

case "${1:-}" in
  demarrer) demarrer ;;
  reinit)   shift; reinit "$@" ;;
  tester)   tester ;;
  psql)     psql -X -h 127.0.0.1 -p "$PORT" -U postgres -d "$BASE" ;;
  arreter)  arreter ;;
  detruire) arreter; rm -rf "$DONNEES"; echo "Cluster effacé : $DONNEES" ;;
  *) sed -n '2,20p' "$0"; exit 1 ;;
esac
