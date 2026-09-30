# Aperçu en ligne : envoie un fichier SQL à la fonction apercu-installer du
# projet de l'aperçu (supabase/functions/apercu-installer), avec la clé
# service_role. Lu par le workflow .github/workflows/apercu.yml.
#   installe <migration|graines|script> <nom> <fichier> [version]
installe() {
  jq -n --arg genre "$1" --arg nom "$2" --arg version "${4:-}" --rawfile requete "$3" \
    '{genre: $genre, nom: $nom, requete: $requete} + (if $version == "" then {} else {version: $version} end)' > /tmp/envoi.json
  local code
  code=$(curl -sS -o /tmp/reponse.json -w '%{http_code}' -X POST "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/apercu-installer" \
    -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "content-type: application/json" --data-binary @/tmp/envoi.json)
  if [ "$code" != "200" ]; then echo "::error::$2 : HTTP $code $(cat /tmp/reponse.json)"; return 1; fi
  echo "$2 : $(cat /tmp/reponse.json)"
}
