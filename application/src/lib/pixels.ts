/* ============================================================================
   LES PIXELS PUBLICITAIRES (réglages pub.pixel_meta, pub.pixel_tiktok ;
   migration 63) — pour que la boutique sache ce que rapportent ses
   publicités Facebook, Instagram et TikTok : les pages vues, les fiches
   regardées, les ajouts au panier, la commande ouverte puis passée (son
   montant, ses références), envoyés au pixel de chaque plateforme.

   RIEN N'EST CHARGÉ SANS L'ACCORD DU VISITEUR. Ces plateformes déposent des
   cookies et reconnaissent la personne d'un site à l'autre : le bandeau de
   consentement (components/PixelsPub.tsx) le demande, « Refuser » aussi
   visible qu'« Accepter », et le choix se change à tout moment depuis le
   pied de page. Le choix est gardé dans ce navigateur, par boutique ; sans
   choix, ou refusé, aucun script tiers n'est demandé.

   Le chargement suit les extraits officiels des deux plateformes (la file
   d'attente `fbq`, la file `ttq`) : un événement émis avant l'arrivée du
   script attend dans la file. Une page où l'accord est déjà donné charge
   tout dès le début du document (scriptPixels, en ligne dans la page), avant
   que la page n'émette ses événements.
   ========================================================================== */

export type Pixels = { meta: string | null; tiktok: string | null };
export type ChoixPub = "accepte" | "refuse";

/** Le choix du visiteur, par boutique et dans sa version : un texte de
 *  consentement qui changerait de sens demanderait à nouveau. */
export function cleConsentement(boutique: string): string {
  return `skanecom.consentement-pub.${boutique}.v1`;
}

/** Émis quand le visiteur choisit (détail : ChoixPub) ; et pour rouvrir le bandeau. */
export const CONSENTEMENT_CHOISI = "skanecom:consentement-pub";
export const CONSENTEMENT_OUVRIR = "skanecom:consentement-pub-ouvrir";

export function lisConsentement(boutique: string): ChoixPub | null {
  try {
    const v = JSON.parse(localStorage.getItem(cleConsentement(boutique)) ?? "null") as { choix?: string } | null;
    return v?.choix === "accepte" || v?.choix === "refuse" ? v.choix : null;
  } catch {
    return null;
  }
}

export function ecrisConsentement(boutique: string, choix: ChoixPub): void {
  try {
    localStorage.setItem(cleConsentement(boutique), JSON.stringify({ choix, le: new Date().toISOString() }));
  } catch {
    /* Stockage fermé (navigation privée stricte) : le choix vaut pour la page. */
  }
  window.dispatchEvent(new CustomEvent<ChoixPub>(CONSENTEMENT_CHOISI, { detail: choix }));
}

/* ---- Le chargement : les extraits officiels des deux plateformes, écrits
   une fois, en TEXTE — le même sert au script en ligne du début de page
   (scriptPixels) et au bandeau (chargePixels). Pas de Function.toString :
   le déploiement (wrangler, keepNames) glisse dans le code compilé des
   appels à un utilitaire que la page n'aurait pas. ---- */

const CHARGEUR = [
  "function(w,d,m,k){",
  // Meta : la file `fbq` tant que fbevents.js n'est pas arrivé.
  'if(m&&!w.fbq){var f=function(){f.callMethod?f.callMethod.apply(f,arguments):f.queue.push([].slice.call(arguments))};',
  'f.push=f;f.loaded=!0;f.version="2.0";f.queue=[];w.fbq=w._fbq=f;',
  'var s=d.createElement("script");s.async=!0;s.src="https://connect.facebook.net/en_US/fbevents.js";d.head.appendChild(s);',
  'f("init",m);f("track","PageView")}',
  // TikTok : chaque méthode s'empile dans la file `ttq`.
  'if(k&&!w.ttq){w.TiktokAnalyticsObject="ttq";var q=w.ttq=[];',
  'q.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];',
  'q.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat([].slice.call(arguments)))}};',
  'for(var i=0;i<q.methods.length;i++)q.setAndDefer(q,q.methods[i]);',
  'q.instance=function(t){for(var e=q._i[t]||[],n=0;n<q.methods.length;n++)q.setAndDefer(e,q.methods[n]);return e};',
  'q.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";q._i=q._i||{};q._i[e]=[];q._i[e]._u=r;q._t=q._t||{};q._t[e]=+new Date;q._o=q._o||{};q._o[e]=n||{};',
  'var s=d.createElement("script");s.type="text/javascript";s.async=!0;s.src=r+"?sdkid="+e+"&lib=ttq";d.head.appendChild(s)};',
  "q.load(k);q.page()}",
  "}",
].join("");

/** Les identifiants, vérifiés par la base (chiffres ; lettres et chiffres), passés en JSON. */
const enJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

/** Charge les pixels (après « Accepter »). Sans effet s'ils le sont déjà. */
export function chargePixels(pixels: Pixels): void {
  const s = document.createElement("script");
  s.text = `(${CHARGEUR})(window,document,${enJson(pixels.meta)},${enJson(pixels.tiktok)});`;
  document.head.appendChild(s);
}

/** Le script en ligne du début de page : il ne charge que si ce navigateur a déjà accepté —
 *  et jamais dans un cadre (l'éditeur, la galerie des modèles de la console : l'équipe, pas un visiteur). */
export function scriptPixels(boutique: string, pixels: Pixels): string {
  const p = enJson({ c: cleConsentement(boutique), m: pixels.meta, t: pixels.tiktok });
  return `(function(){try{if(window.self!==window.top)return;var p=${p};var v=JSON.parse(localStorage.getItem(p.c)||"null");if(!v||v.choix!=="accepte")return;(${CHARGEUR})(window,document,p.m,p.t)}catch(e){}})();`;
}

/* ---- Les événements ---- */

/** Une ligne, comme la plateforme la compte : la référence (SKU), la quantité, le prix unitaire en dinars. */
export type LignePub = { sku: string; nom?: string; quantite: number; prixMillimes: number };

type Fbq = (...a: unknown[]) => void;
type Ttq = { track: (nom: string, donnees: unknown, options?: unknown) => void; page: () => void };

const dinars = (millimes: number) => Math.round(millimes) / 1000;

/** Les lignes que la base a chiffrées (le devis du tunnel, la commande passée), comme la plateforme les compte. */
export function lignesPub(lignes: { sku: string | null; produit_nom: string | null; quantite: number; prix_unitaire_millimes: number | null }[]): LignePub[] {
  return lignes
    .filter((l) => l.sku && l.prix_unitaire_millimes !== null && l.quantite > 0)
    .map((l) => ({ sku: l.sku as string, nom: l.produit_nom ?? undefined, quantite: l.quantite, prixMillimes: l.prix_unitaire_millimes as number }));
}

/** Rien si les pixels ne sont pas chargés (pas d'accord, ou pas de pixel) : la page n'a rien à savoir. */
export function evenementPub(
  nom: "ViewContent" | "AddToCart" | "InitiateCheckout" | "Purchase",
  lignes: LignePub[],
  options: { commande?: string } = {},
): void {
  if (typeof window === "undefined" || lignes.length === 0) return;
  const w = window as unknown as { fbq?: Fbq; ttq?: Ttq };
  const valeur = dinars(lignes.reduce((s, l) => s + l.prixMillimes * l.quantite, 0));
  const pieces = lignes.reduce((s, l) => s + l.quantite, 0);
  if (w.fbq) {
    w.fbq("track", nom, {
      content_type: "product",
      content_ids: lignes.map((l) => l.sku),
      contents: lignes.map((l) => ({ id: l.sku, quantity: l.quantite, item_price: dinars(l.prixMillimes) })),
      ...(nom === "ViewContent" && lignes[0].nom ? { content_name: lignes[0].nom } : {}),
      ...(nom === "InitiateCheckout" || nom === "Purchase" ? { num_items: pieces } : {}),
      value: valeur,
      currency: "TND",
    }, options.commande ? { eventID: options.commande } : undefined);
  }
  if (w.ttq) {
    // TikTok nomme l'achat « CompletePayment » (au livreur, ici).
    w.ttq.track(nom === "Purchase" ? "CompletePayment" : nom, {
      content_type: "product",
      contents: lignes.map((l) => ({ content_id: l.sku, quantity: l.quantite, price: dinars(l.prixMillimes), ...(l.nom ? { content_name: l.nom } : {}) })),
      value: valeur,
      currency: "TND",
    }, options.commande ? { event_id: options.commande } : undefined);
  }
}

/** Une page vue après une navigation dans le site (la première l'est au chargement). */
export function pageVuePub(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { fbq?: Fbq; ttq?: Ttq };
  w.fbq?.("track", "PageView");
  w.ttq?.page();
}
