"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Icone } from "./Icone";

/* ============================================================================
   LA VEILLE DU BACKOFFICE — tant qu'un écran du backoffice est ouvert, il
   demande toutes les 45 secondes (et dès qu'on y revient) combien de
   commandes attendent l'appel (/gestion/<boutique>/veille). Le compteur
   s'affiche dans la navigation et dans le titre de l'onglet ; une commande
   nouvelle déclenche une notification du navigateur, si la personne l'a
   acceptée (« Me prévenir des nouvelles commandes »).

   Une seule veille par boutique, même si le compteur s'affiche deux fois
   (barre latérale et menu du téléphone) : pas de notification en double.
   ========================================================================== */

type Etat = {
  a_confirmer: number;
  derniere: { numero: string; nom: string; total: number; le: string; statut: string } | null;
};

type Magasin = {
  etat: Etat | null;
  abonnes: Set<() => void>;
  minuterie: number | null;
  ecoute: (() => void) | null;
  /** Le numéro de la dernière commande vue ; undefined avant le premier regard. */
  vue: string | null | undefined;
  /** Ouvrir une page du backoffice (le routeur, confié par le compteur). */
  aller: ((url: string) => void) | null;
  /** L'heure de la dernière question : jamais deux en moins de 10 s. */
  dernier: number;
};

const INTERVALLE_MIN = 10_000;

const PERIODE = 45_000;
const magasins = new Map<string, Magasin>();
const montant = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

function magasinDe(slug: string): Magasin {
  let m = magasins.get(slug);
  if (!m) {
    m = { etat: null, abonnes: new Set(), minuterie: null, ecoute: null, vue: undefined, aller: null, dernier: 0 };
    magasins.set(slug, m);
  }
  return m;
}

function titre(n: number) {
  const base = document.title.replace(/^\(\d+\)\s+/, "");
  document.title = n > 0 ? `(${n}) ${base}` : base;
}

async function interroger(slug: string) {
  const m = magasinDe(slug);
  if (Date.now() - m.dernier < INTERVALLE_MIN) return;
  m.dernier = Date.now();
  try {
    const r = await fetch(`/gestion/${slug}/veille`, { cache: "no-store", credentials: "same-origin" });
    if (!r.ok) return;
    const e = (await r.json()) as Etat & { ok: boolean };
    if (!e.ok) return;
    const d = e.derniere;
    // Une commande arrivée depuis la dernière fois (pas au premier regard).
    if (m.vue !== undefined && d && d.numero !== m.vue && (d.statut === "recue" || d.statut === "a_arbitrer")
        && "Notification" in window && Notification.permission === "granted") {
      const n = new Notification(`Nouvelle commande ${d.numero}`, {
        body: `${d.nom} · ${montant.format(d.total / 1000)} TND à confirmer`,
        tag: `commande-${d.numero}`,
      });
      n.onclick = () => {
        window.focus();
        m.aller?.(`/gestion/${slug}/commandes/${d.numero}`);
      };
    }
    m.vue = d?.numero ?? null;
    m.etat = { a_confirmer: e.a_confirmer, derniere: d };
    titre(e.a_confirmer);
    m.abonnes.forEach((f) => f());
  } catch {
    // réseau coupé : on réessaiera au prochain tour
  }
}

/** Le premier abonné lance la veille ; le dernier qui part l'arrête. */
function abonner(slug: string, f: () => void): () => void {
  const m = magasinDe(slug);
  m.abonnes.add(f);
  if (m.minuterie === null) {
    m.ecoute = () => {
      if (document.visibilityState === "visible") void interroger(slug);
    };
    document.addEventListener("visibilitychange", m.ecoute);
    m.minuterie = window.setInterval(() => void interroger(slug), PERIODE);
    void interroger(slug);
  }
  return () => {
    m.abonnes.delete(f);
    if (m.abonnes.size === 0 && m.minuterie !== null) {
      window.clearInterval(m.minuterie);
      m.minuterie = null;
      if (m.ecoute) document.removeEventListener("visibilitychange", m.ecoute);
      m.ecoute = null;
    }
  };
}

/** Le compteur des commandes à confirmer, dans la navigation. */
export function CompteurCommandes({ slug }: { slug: string }) {
  const router = useRouter();
  useEffect(() => {
    magasinDe(slug).aller = (url) => router.push(url);
  }, [router, slug]);
  // Des fonctions stables : une nouvelle fonction d'abonnement à chaque rendu
  // ferait se désabonner puis se réabonner React, donc relancer la veille (et
  // une requête) à chaque rendu — une boucle.
  const sAbonner = useCallback((f: () => void) => abonner(slug, f), [slug]);
  const lire = useCallback(() => magasinDe(slug).etat, [slug]);
  const etat = useSyncExternalStore(sAbonner, lire, () => null);
  const n = etat?.a_confirmer ?? 0;
  if (n === 0) return null;
  return <span className="app-nav-compte" aria-label={`${n} à confirmer`}>{n}</span>;
}

const rien = () => () => {};

/** Le bouton qui demande la permission de notifier. */
export function AlertesCommandes() {
  const pret = useSyncExternalStore(rien, () => true, () => false);
  const [choix, setChoix] = useState<NotificationPermission | null>(null);
  if (!pret || !("Notification" in window)) return null;
  const permission = choix ?? Notification.permission;
  if (permission === "granted") {
    return <span className="bo-alertes" title="Une notification à chaque nouvelle commande, tant que le backoffice est ouvert"><Icone nom="succes" taille={14} /> Alertes activées</span>;
  }
  if (permission === "denied") {
    return <span className="bo-alertes discret" title="Réautorisez les notifications de ce site dans les réglages du navigateur">Alertes bloquées par le navigateur</span>;
  }
  return (
    <button type="button" className="btn btn-second" onClick={async () => setChoix(await Notification.requestPermission())}>
      <Icone nom="alerte" /> Me prévenir des nouvelles commandes
    </button>
  );
}
