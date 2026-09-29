# GoTrue, le serveur d'authentification de Supabase (github.com/supabase/auth),
# pour la base et l'API locales. Fichier LU par outils/base-locale.sh (qui
# joue ses migrations sur le schéma auth) et par outils/api-locale.sh (qui le
# démarre) — il ne s'exécute pas seul.
#
# Même moteur que chez Supabase : connexion par mot de passe, jetons,
# double authentification (TOTP). Aucun faux login de développement.

GOTRUE_VERSION=2.197.0
GOTRUE_EMPREINTE=9daff5d1939c3142a1586e435e6e2a7a2f71534ec40ff1b196b59b83ad5678f3
GOTRUE_DOSSIER="$RACINE/.outils/gotrue-$GOTRUE_VERSION"

telecharger_gotrue() {
  [ -x "$GOTRUE_DOSSIER/auth" ] && return
  echo "Téléchargement de GoTrue $GOTRUE_VERSION…"
  mkdir -p "$GOTRUE_DOSSIER"
  local archive="$GOTRUE_DOSSIER.tar.gz"
  curl -sSL -o "$archive" \
    "https://github.com/supabase/auth/releases/download/v$GOTRUE_VERSION/auth-v$GOTRUE_VERSION-x86.tar.gz"
  echo "$GOTRUE_EMPREINTE  $archive" | sha256sum -c --quiet
  tar -xzf "$archive" -C "$GOTRUE_DOSSIER" && rm "$archive"
}

# Configuration commune à `migrate` et `serve` (variables GOTRUE_*).
gotrue_env() {
  local port_base=$1 base=$2
  export GOTRUE_DB_DRIVER=postgres
  export GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin@127.0.0.1:$port_base/$base?sslmode=disable"
  export GOTRUE_DB_MIGRATIONS_PATH="$GOTRUE_DOSSIER/migrations"
  export GOTRUE_DB_NAMESPACE=auth
  export API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1
  export GOTRUE_SITE_URL=http://console.localhost:4200
  export GOTRUE_JWT_SECRET=${SECRET_DEV:-secret-de-developpement-skanecom-local-uniquement}
  export GOTRUE_JWT_EXP=3600
  export GOTRUE_JWT_AUD=authenticated
  export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
  export GOTRUE_JWT_ADMIN_ROLES=service_role
}
