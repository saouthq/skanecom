"use client";

import { useEffect } from "react";

/* Une page cassée au navigateur (un écran d'erreur s'affiche) : la signaler
   une fois à la plateforme, par /erreur, pour la console. Une erreur du
   serveur porte un `digest`, ou arrive au navigateur sous le message
   générique de React (« Minified React error #441 », son texte retenu en
   production) : le serveur l'a déjà notée, rien ne repart. */
const DU_SERVEUR = /Minified React error #441\b|error occurred in the Server Components render/;
export function useSignalerErreur(erreur: Error & { digest?: string }) {
  useEffect(() => {
    if (erreur.digest || DU_SERVEUR.test(erreur.message ?? "")) return;
    const corps = JSON.stringify({ message: erreur.message || String(erreur), pile: erreur.stack ?? null, chemin: location.pathname });
    try {
      void fetch("/erreur", { method: "POST", headers: { "content-type": "application/json" }, body: corps, keepalive: true }).catch(() => {});
    } catch {
      // (rien à faire : la page dit déjà qu'elle a cassé)
    }
  }, [erreur]);
}
