"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/* ============================================================================
   LA MESURE D'AUDIENCE (réglage vitrine.statistiques) — à chaque page vue,
   un signal au serveur (/stats) : le chemin, et pour la première, le site
   d'où l'on vient. Ni cookie, ni stockage dans le navigateur : le serveur
   reconnaît le visiteur le temps d'une journée seulement, par une empreinte
   salée du jour (…_visites_vitrine.sql). Un navigateur qui demande à ne pas
   être suivi (Do Not Track, Global Privacy Control) n'envoie rien.
   ========================================================================== */

export function MesureAudience() {
  const chemin = usePathname();
  const premiere = useRef(true);

  useEffect(() => {
    const n = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (n.doNotTrack === "1" || n.globalPrivacyControl === true) return;
    const corps = JSON.stringify({ chemin, source: premiere.current ? document.referrer : "" });
    premiere.current = false;
    const envoye = typeof n.sendBeacon === "function" && n.sendBeacon("/stats", new Blob([corps], { type: "text/plain" }));
    if (!envoye) void fetch("/stats", { method: "POST", body: corps, keepalive: true }).catch(() => {});
  }, [chemin]);

  return null;
}
