#!/usr/bin/env bash
# API locale SkanEcom : PostgREST (le moteur de l'API de Supabase) devant la
# base locale, plus un relais qui l'expose sous /rest/v1 comme Supabase.
# L'application tourne alors contre le vrai schéma, sans Docker.
#
#   outils/api-locale.sh demarrer   télécharge PostgREST au besoin, démarre l'API
#                                   et écrit les clés dans .outils/api-locale.env
#   outils/api-locale.sh arreter    arrête l'API
#
# Prérequis : la base locale (outils/base-locale.sh reinit) et Node.
# Adresse : http://127.0.0.1:54321 (comme `supabase start`).
#
# ⚠️ Les clés sont signées avec un secret de DÉVELOPPEMENT écrit ci-dessous :
# elles n'ouvrent que cette base locale et ne valent rien ailleurs.
set -euo pipefail

RACINE=$(cd "$(dirname "$0")/.." && pwd)
OUTILS="$RACINE/.outils"
VERSION=12.2.3
EMPREINTE=9f71269e61ac3a940281e93ff415760f5957e430e475ba4c3889f3ede7d5527c
PORT_BASE=${BASE_LOCALE_PORT:-54322}
BASE=${BASE_LOCALE_NOM:-skanecom}
SECRET_DEV="secret-de-developpement-skanecom-local-uniquement"

mkdir -p "$OUTILS"

telecharger() {
  [ -x "$OUTILS/postgrest" ] && return
  echo "Téléchargement de PostgREST $VERSION…"
  curl -sSL -o "$OUTILS/postgrest.tar.xz" \
    "https://github.com/PostgREST/postgrest/releases/download/v$VERSION/postgrest-v$VERSION-linux-static-x64.tar.xz"
  echo "$EMPREINTE  $OUTILS/postgrest.tar.xz" | sha256sum -c --quiet
  tar -xJf "$OUTILS/postgrest.tar.xz" -C "$OUTILS" && rm "$OUTILS/postgrest.tar.xz"
}

# Jeton HS256 minimal, comme ceux de Supabase : {"role": "...", "iss": "supabase"}.
jeton() {
  node -e '
    const c = require("node:crypto");
    const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const corps = b({ alg: "HS256", typ: "JWT" }) + "." + b({ iss: "supabase", role: process.argv[2], iat: 1759104000, exp: 2074464000 });
    console.log(corps + "." + c.createHmac("sha256", process.argv[1]).update(corps).digest("base64url"));
  ' "$SECRET_DEV" "$1"
}

arreter() {
  for p in postgrest relais; do
    if [ -f "$OUTILS/$p.pid" ]; then kill "$(cat "$OUTILS/$p.pid")" 2> /dev/null || true; rm -f "$OUTILS/$p.pid"; fi
  done
}

demarrer() {
  telecharger
  arreter
  cat > "$OUTILS/postgrest.conf" <<CONF
db-uri = "postgres://authenticator@127.0.0.1:$PORT_BASE/$BASE"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
jwt-secret = "$SECRET_DEV"
server-host = "127.0.0.1"
server-port = 54330
CONF
  setsid "$OUTILS/postgrest" "$OUTILS/postgrest.conf" > "$OUTILS/postgrest.log" 2>&1 < /dev/null &
  echo $! > "$OUTILS/postgrest.pid"
  setsid node "$RACINE/outils/relais-rest.mjs" > "$OUTILS/relais.log" 2>&1 < /dev/null &
  echo $! > "$OUTILS/relais.pid"

  cat > "$OUTILS/api-locale.env" <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_FICHIERS_URL=http://127.0.0.1:54321/fichiers
NEXT_PUBLIC_SUPABASE_ANON_KEY=$(jeton anon)
SUPABASE_SERVICE_ROLE_KEY=$(jeton service_role)
ENV

  for _ in $(seq 1 40); do
    if curl -s -o /dev/null "http://127.0.0.1:54321/rest/v1/gouvernorats?select=code&limit=1" \
         -H "apikey: $(jeton anon)"; then
      echo "API locale prête : http://127.0.0.1:54321 (clés dans .outils/api-locale.env)"
      return
    fi
    sleep 0.25
  done
  echo "L'API ne répond pas : voir .outils/postgrest.log" >&2
  exit 1
}

case "${1:-}" in
  demarrer) demarrer ;;
  arreter)  arreter ;;
  *) sed -n '2,14p' "$0"; exit 1 ;;
esac
