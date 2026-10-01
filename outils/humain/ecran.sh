#!/usr/bin/env bash
# =============================================================================
# LE PASSAGE HUMAIN À L'ÉCRAN — un vrai écran (virtuel), un vrai Chromium en
# fenêtre, et des gestes de personne : la souris et le clavier du système
# (xdotool), pas des sélecteurs. On regarde chaque capture avant le geste
# suivant (clic aux coordonnées de ce qu'on voit, frappe au clavier) : c'est
# ainsi qu'on trouve ce qu'un parcours scripté ne voit pas (un bouton qui
# saute sous le doigt, une barre voilée, un menu coupé à 1 280 px…).
#
#   outils/humain/ecran.sh demarrer [largeur hauteur] [adresse]
#        GARDER=1 : garde le profil (la session) ; CDP=1 : ouvre le port
#        9222 (pour outils/humain/telephone.mjs, le mode téléphone)
#   outils/humain/ecran.sh voir <nom>          → capture <dossier>/<nom>.png
#   outils/humain/ecran.sh clic x y | double x y | droit x y | survol x y
#   outils/humain/ecran.sh taper "texte" | touche ctrl+l Return Tab…
#   outils/humain/ecran.sh defile bas|haut [crans] [x y]
#   outils/humain/ecran.sh glisser x1 y1 x2 y2
#   outils/humain/ecran.sh arreter
#
# Dossier des captures et du profil : $HUMAIN (défaut .outils/humain).
# Prérequis (Ubuntu) : apt install xvfb xdotool scrot openbox ; Chromium de
# Playwright (PLAYWRIGHT_BROWSERS_PATH) ou $CHROMIUM.
# =============================================================================
set -uo pipefail
R="$(cd "$(dirname "$0")/../.." && pwd)"
H="${HUMAIN:-$R/.outils/humain}"
mkdir -p "$H"
CHROMIUM="${CHROMIUM:-$(ls -d "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
export DISPLAY=:99 LC_ALL=C.UTF-8 LANG=C.UTF-8
cmd=${1:-}; shift || true
case "$cmd" in
  demarrer)
    L=${1:-1440}; Ht=${2:-900}; URL=${3:-about:blank}
    pkill -f "Xvfb :99" 2>/dev/null; pkill -f "user-data-dir=$H/profil" 2>/dev/null; pkill openbox 2>/dev/null; sleep 0.5
    setsid nohup Xvfb :99 -screen 0 "${L}x${Ht}x24" -nolisten tcp > "$H/xvfb.log" 2>&1 < /dev/null &
    sleep 1
    setsid nohup openbox > "$H/openbox.log" 2>&1 < /dev/null &
    sleep 0.5
    [ -z "${GARDER:-}" ] && rm -rf "$H/profil"
    setsid nohup "$CHROMIUM" --no-sandbox --test-type --no-first-run --no-default-browser-check --hide-crash-restore-bubble \
      --user-data-dir="$H/profil" --window-position=0,0 --window-size="${L},${Ht}" --force-device-scale-factor=1 \
      --disable-features=Translate,MediaRouter --password-store=basic --disable-gpu --lang=fr-FR \
      ${CDP:+--remote-debugging-port=9222} "$URL" > "$H/chrome.log" 2>&1 < /dev/null &
    sleep 4; echo "écran ${L}x${Ht} prêt" ;;
  voir)    sleep "${ATTENTE:-0.6}"; scrot -o "$H/${1:-ecran}.png" && echo "$H/${1:-ecran}.png" ;;
  clic)    xdotool mousemove --sync "$1" "$2" click 1 ;;
  double)  xdotool mousemove --sync "$1" "$2" click --repeat 2 --delay 80 1 ;;
  droit)   xdotool mousemove --sync "$1" "$2" click 3 ;;
  survol)  xdotool mousemove --sync "$1" "$2" ;;
  taper)   xdotool type --delay "${DELAI:-35}" -- "$1" ;;
  touche)  for k in "$@"; do xdotool key --delay 60 "$k"; done ;;
  defile)
    sens=${1:-bas}; n=${2:-3}; [ $# -ge 4 ] && xdotool mousemove --sync "$3" "$4"
    b=5; [ "$sens" = "haut" ] && b=4
    xdotool click --repeat "$n" --delay 40 "$b" ;;
  glisser) xdotool mousemove --sync "$1" "$2" mousedown 1 sleep 0.2 mousemove --sync "$(( ($1+$3)/2 ))" "$(( ($2+$4)/2 ))" sleep 0.1 mousemove --sync "$3" "$4" sleep 0.2 mouseup 1 ;;
  arreter) pkill -f "user-data-dir=$H/profil"; pkill openbox; pkill -f "Xvfb :99"; echo arrêté ;;
  *) echo "geste inconnu : $cmd (demarrer, voir, clic, double, droit, survol, taper, touche, defile, glisser, arreter)"; exit 1 ;;
esac
