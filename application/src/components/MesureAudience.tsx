"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { PANIER_AJOUT } from "@/lib/panier-contrat";
import { ETAPE_VISITE, type EtapeVisite } from "@/lib/etapes-visite";

/* ============================================================================
   LA MESURE D'AUDIENCE (réglage vitrine.statistiques) — à chaque page vue,
   un signal au serveur (/stats) : le chemin, et pour la première, le site
   d'où l'on vient et la campagne du lien d'arrivée (utm_campaign,
   utm_source). Un article ajouté au panier envoie aussi le sien (l'étape
   « panier » de l'entonnoir) ; la page de vente, le produit regardé et la
   commande commencée (lib/etapes-visite.ts). Ni cookie, ni stockage dans le navigateur : le
   serveur reconnaît le visiteur le temps d'une journée seulement, par une
   empreinte salée du jour (…_visites_vitrine.sql). Un navigateur qui
   demande à ne pas être suivi (Do Not Track, Global Privacy Control)
   n'envoie rien.
   ========================================================================== */

function suivi(): boolean {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  // Dans un cadre (l'aperçu de l'écran « Apparence ») : l'équipe, pas un visiteur.
  if (window.self !== window.top) return false;
  return !(n.doNotTrack === "1" || n.globalPrivacyControl === true);
}

function signale(corps: Record<string, string>): void {
  const texte = JSON.stringify(corps);
  const envoye = typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/stats", new Blob([texte], { type: "text/plain" }));
  if (!envoye) void fetch("/stats", { method: "POST", body: texte, keepalive: true }).catch(() => {});
}

export function MesureAudience() {
  const chemin = usePathname();
  const premiere = useRef(true);

  useEffect(() => {
    if (!suivi()) return;
    if (premiere.current) {
      const p = new URLSearchParams(location.search);
      signale({ chemin, source: document.referrer, campagne: p.get("utm_campaign") ?? "", support: p.get("utm_source") ?? "" });
    } else {
      signale({ chemin, source: "" });
    }
    premiere.current = false;
  }, [chemin]);

  useEffect(() => {
    if (!suivi()) return;
    const ajout = () => signale({ chemin: location.pathname, evenement: "panier" });
    const etape = (e: Event) => signale({ chemin: location.pathname, evenement: (e as CustomEvent<EtapeVisite>).detail });
    window.addEventListener(PANIER_AJOUT, ajout);
    window.addEventListener(ETAPE_VISITE, etape);
    return () => {
      window.removeEventListener(PANIER_AJOUT, ajout);
      window.removeEventListener(ETAPE_VISITE, etape);
    };
  }, []);

  return null;
}
