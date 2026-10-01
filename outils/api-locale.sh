#!/usr/bin/env bash
# API locale SkanEcom : PostgREST (le moteur de l'API de Supabase) et GoTrue
# (son serveur d'authentification) devant la base locale, plus un relais qui
# les expose sous /rest/v1 et /auth/v1 comme Supabase. L'application tourne
# alors contre le vrai schéma et la vraie authentification, sans Docker.
#
#   outils/api-locale.sh demarrer   télécharge PostgREST et GoTrue au besoin,
#                                   démarre l'API, crée l'administrateur de
#                                   développement de la console et écrit les
#                                   clés dans .outils/api-locale.env
#   outils/api-locale.sh arreter    arrête l'API
#
# Console locale : http://console.localhost:4200, administrateur
# admin@skanecom.test, mot de passe « console-locale-skanecom » (base locale
# seulement). La double authentification se règle à la première connexion.
# Backoffice des boutiques, même adresse, mot de passe « equipe-locale-skanecom » :
#   gerant@maymar.test (propriétaire, double authentification),
#   appels@maymar.test (confirmation), prepa@quincaillerie.test (préparation),
#   gerant@quincaillerie.test (propriétaire, double authentification : les
#   comptes pro, les devis), gerant@selma.test (propriétaire),
#   gerant@dar-alia.test (propriétaire : l'apparence de la vitrine).
# Clients à compte de la quincaillerie (code SMS, affiché en local) :
#   98 765 001 (le plombier, compte pro en attente, devis à chiffrer),
#   22 345 002 (l'électricienne, pro validée, devis prêt à accepter).
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
# SkanFact simulé (outils/skanfact-dev.mjs) : une entreprise, une clé de
# l'API et le secret des avis, tous de développement.
SKANFACT_ENTREPRISE_DEV="00000000-0000-4000-8888-00000000e000"
SKANFACT_CLE_DEV="skf_dev_local_skanecom"
SKANFACT_AVIS_DEV="whsec_dev_local_skanecom"
ADMIN_EMAIL=admin@skanecom.test
ADMIN_MDP=console-locale-skanecom
EQUIPE_MDP=equipe-locale-skanecom
# courriel:boutique:rôle — l'équipe de développement des boutiques de démo.
EQUIPE="gerant@maymar.test:maymar:proprietaire appels@maymar.test:maymar:confirmateur prepa@quincaillerie.test:quincaillerie-demo:preparateur gerant@quincaillerie.test:quincaillerie-demo:proprietaire gerant@selma.test:maison-selma:proprietaire gerant@dar-alia.test:dar-alia:proprietaire"
# téléphone:boutique — les fiches clients du jeu de démo qui ont un compte.
CLIENTS="+21698765001:quincaillerie-demo +21622345002:quincaillerie-demo"
. "$RACINE/outils/gotrue.sh"

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
  for p in postgrest gotrue relais; do
    if [ -f "$OUTILS/$p.pid" ]; then kill "$(cat "$OUTILS/$p.pid")" 2> /dev/null || true; rm -f "$OUTILS/$p.pid"; fi
  done
}

# Un port déjà pris après l'arrêt de NOTRE API, c'est une autre API (lancée
# depuis un autre dossier, ou un autre programme) : on le dit, au lieu de la
# réutiliser sans le savoir.
ports_libres() {
  local port essai
  for port in 54321 54330 54340; do
    # Nos propres processus viennent d'être arrêtés : on leur laisse jusqu'à
    # cinq secondes pour libérer le port.
    for essai in $(seq 1 20); do
      (exec 3<> "/dev/tcp/127.0.0.1/$port") 2> /dev/null || break
      sleep 0.25
    done
    if (exec 3<> "/dev/tcp/127.0.0.1/$port") 2> /dev/null; then
      echo "Le port $port est déjà pris : une API SkanEcom lancée depuis un autre dossier, ou un autre programme." >&2
      echo "  → l'arrêter (outils/api-locale.sh arreter dans son dossier), ou voir qui l'occupe : ss -ltnp | grep $port" >&2
      exit 1
    fi
  done
}

demarrer() {
  telecharger
  arreter
  ports_libres
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
  telecharger_gotrue
  (
    gotrue_env "$PORT_BASE" "$BASE"
    export GOTRUE_API_HOST=127.0.0.1 GOTRUE_API_PORT=54340
    export GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true
    export GOTRUE_MFA_TOTP_ENROLL_ENABLED=true GOTRUE_MFA_TOTP_VERIFY_ENABLED=true
    # Équipes : les liens d'accès que remet la console (invitation, mot de
    # passe à rechoisir) valent 24 heures — chez Supabase, « Email OTP
    # Expiration » à 86400.
    export GOTRUE_MAILER_OTP_EXP=86400
    # Acheteurs : connexion par numéro de téléphone et code. Le « fournisseur
    # de SMS » est le relais, qui note les codes dans .outils/sms.log.
    export GOTRUE_EXTERNAL_PHONE_ENABLED=true GOTRUE_SMS_AUTOCONFIRM=false
    export GOTRUE_SMS_OTP_LENGTH=6 GOTRUE_SMS_OTP_EXP=600 GOTRUE_SMS_MAX_FREQUENCY=1s GOTRUE_RATE_LIMIT_SMS_SENT=1000
    export GOTRUE_HOOK_SEND_SMS_ENABLED=true GOTRUE_HOOK_SEND_SMS_URI=http://127.0.0.1:54321/sms-dev
    GOTRUE_HOOK_SEND_SMS_SECRETS="v1,whsec_$(printf '%s' "$SECRET_DEV" | base64 -w0)"
    export GOTRUE_HOOK_SEND_SMS_SECRETS
    # Ou par adresse e-mail et code (réglage compte.verification) : le relais
    # tient aussi lieu d'expéditeur, il note les codes dans .outils/emails.log.
    export GOTRUE_HOOK_SEND_EMAIL_ENABLED=true GOTRUE_HOOK_SEND_EMAIL_URI=http://127.0.0.1:54321/email-dev
    GOTRUE_HOOK_SEND_EMAIL_SECRETS="$GOTRUE_HOOK_SEND_SMS_SECRETS"
    export GOTRUE_HOOK_SEND_EMAIL_SECRETS
    export GOTRUE_SMTP_MAX_FREQUENCY=1s GOTRUE_RATE_LIMIT_EMAIL_SENT=1000
    export GOTRUE_LOG_LEVEL=warn
    setsid "$GOTRUE_DOSSIER/auth" serve > "$OUTILS/gotrue.log" 2>&1 < /dev/null &
    echo $! > "$OUTILS/gotrue.pid"
  )
  # La clé de dépôt des fichiers (le relais tient lieu de R2) : l'application
  # la présente, c'est sa clé de service (src/lib/gestion/fichiers.ts).
  # Il tient aussi lieu de SkanFact (outils/skanfact-dev.mjs) : l'entreprise,
  # la clé et le secret des avis sont de développement, les mêmes que ceux
  # que l'application reçoit plus bas.
  FICHIERS_DEPOT_CLE="$(jeton service_role)" \
  SKANFACT_ENTREPRISE="$SKANFACT_ENTREPRISE_DEV" SKANFACT_CLE="$SKANFACT_CLE_DEV" SKANFACT_AVIS_SECRET="$SKANFACT_AVIS_DEV" \
    setsid node "$RACINE/outils/relais-rest.mjs" > "$OUTILS/relais.log" 2>&1 < /dev/null &
  echo $! > "$OUTILS/relais.pid"

  cat > "$OUTILS/api-locale.env" <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_FICHIERS_URL=http://127.0.0.1:54321/fichiers
NEXT_PUBLIC_SUPABASE_ANON_KEY=$(jeton anon)
SUPABASE_SERVICE_ROLE_KEY=$(jeton service_role)
NEXT_PUBLIC_CONSOLE_HOTE=console.localhost
ENV
  # Le secret de la console, tel que le Worker le lit (bindings.secret()) :
  # en local, workerd le prend dans application/.dev.vars (hors dépôt).
  # Les e-mails que l'application rédige (crochet /crochets/courriel) partent
  # au relais, qui les garde ; le secret du crochet est de développement.
  {
    printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "$(jeton service_role)"
    printf 'COURRIELS_ENVOI=relais\n'
    printf 'COURRIELS_CROCHET_SECRET=v1,whsec_%s\n' "$(printf '%s' "$SECRET_DEV" | base64 -w0)"
    # SkanFact simulé par le relais (la facturation des clients, cadrage 06).
    printf 'SKANFACT_URL=http://127.0.0.1:54321/skanfact-dev\n'
    printf 'SKANFACT_ENTREPRISE=%s\n' "$SKANFACT_ENTREPRISE_DEV"
    printf 'SKANFACT_CLE=%s\n' "$SKANFACT_CLE_DEV"
    printf 'SKANFACT_AVIS_SECRET=%s\n' "$SKANFACT_AVIS_DEV"
  } > "$RACINE/application/.dev.vars"

  # Jusqu'à une minute : au premier démarrage, GoTrue passe ses propres
  # migrations sur la base — sur une machine de CI froide, plus de vingt
  # secondes (un parcours de la CI en est tombé, le 01/10).
  local anon fin
  anon="$(jeton anon)"
  fin=$((SECONDS + 60))
  while [ "$SECONDS" -lt "$fin" ]; do
    if curl -sf -o /dev/null "http://127.0.0.1:54321/rest/v1/gouvernorats?select=code&limit=1" -H "apikey: $anon" &&
       curl -sf -o /dev/null "http://127.0.0.1:54321/auth/v1/health"; then
      admin_de_developpement
      equipe_de_developpement
      clients_de_developpement
      echo "API locale prête : http://127.0.0.1:54321 (clés dans .outils/api-locale.env)"
      return
    fi
    sleep 0.25
  done
  echo "L'API ne répond pas après 60 s : voir .outils/postgrest.log et .outils/gotrue.log" >&2
  for j in postgrest gotrue relais; do
    echo "---- .outils/$j.log (fin) ----" >&2
    tail -15 "$OUTILS/$j.log" >&2 2> /dev/null || true
  done
  exit 1
}

# L'administrateur de la console locale, créé par GoTrue lui-même (API
# d'administration), puis inscrit dans plateforme.administrateurs.
admin_de_developpement() {
  local cle; cle=$(jeton service_role)
  curl -s -o /dev/null -X POST "http://127.0.0.1:54321/auth/v1/admin/users" \
    -H "apikey: $cle" -H "authorization: Bearer $cle" -H "content-type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_MDP\",\"email_confirm\":true}"
  psql -X -q -h 127.0.0.1 -p "$PORT_BASE" -U postgres -d "$BASE" -v ON_ERROR_STOP=1 -c "
    insert into plateforme.administrateurs (user_id, role)
    select id, 'super_admin' from auth.users where email = '$ADMIN_EMAIL'
    on conflict (user_id) do nothing;" > /dev/null
}

# L'équipe des boutiques de démo : comptes créés par GoTrue, puis inscrits
# dans plateforme.membres (une boutique absente du jeu de démo est ignorée).
equipe_de_developpement() {
  local cle; cle=$(jeton service_role)
  local ligne email slug role
  for ligne in $EQUIPE; do
    IFS=: read -r email slug role <<< "$ligne"
    curl -s -o /dev/null -X POST "http://127.0.0.1:54321/auth/v1/admin/users" \
      -H "apikey: $cle" -H "authorization: Bearer $cle" -H "content-type: application/json" \
      -d "{\"email\":\"$email\",\"password\":\"$EQUIPE_MDP\",\"email_confirm\":true}"
    psql -X -q -h 127.0.0.1 -p "$PORT_BASE" -U postgres -d "$BASE" -v ON_ERROR_STOP=1 -c "
      insert into plateforme.membres (boutique_id, user_id, role)
      select b.id, u.id, '$role' from plateforme.boutiques b, auth.users u
      where b.slug = '$slug' and u.email = '$email'
      on conflict do nothing;" > /dev/null
  done
}

# Les clients à compte du jeu de démo (comptes pro, devis) : leur numéro
# devient un compte GoTrue, relié à leur fiche, comme s'ils s'étaient
# connectés une fois par code SMS.
clients_de_developpement() {
  local cle; cle=$(jeton service_role)
  local ligne tel slug
  for ligne in $CLIENTS; do
    IFS=: read -r tel slug <<< "$ligne"
    curl -s -o /dev/null -X POST "http://127.0.0.1:54321/auth/v1/admin/users" \
      -H "apikey: $cle" -H "authorization: Bearer $cle" -H "content-type: application/json" \
      -d "{\"phone\":\"$tel\",\"phone_confirm\":true}"
    psql -X -q -h 127.0.0.1 -p "$PORT_BASE" -U postgres -d "$BASE" -v ON_ERROR_STOP=1 -c "
      update public.clients c set user_id = u.id
        from plateforme.boutiques b, auth.users u
       where b.slug = '$slug' and c.boutique_id = b.id and c.telephone = '$tel' and c.user_id is null
         and u.phone = ltrim('$tel', '+')
         and not exists (select 1 from public.clients x where x.boutique_id = b.id and x.user_id = u.id);" > /dev/null
  done
}

case "${1:-}" in
  demarrer) demarrer ;;
  arreter)  arreter ;;
  *) sed -n '2,14p' "$0"; exit 1 ;;
esac
