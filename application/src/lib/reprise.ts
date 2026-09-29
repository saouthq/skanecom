/* ============================================================================
   LA REPRISE APRÈS UN FILTRE

   Changer de filtre ou de tri change d'ADRESSE, donc de page : Next remonte la
   liste, et l'élément qui avait le focus disparaît avec l'ancienne. Pour
   l'utilisateur au clavier, le focus retombait tout en haut ; sur téléphone,
   la feuille de filtres se refermait après chaque case.

   Juste avant de partir, on note l'élément actif (sa zone et de quoi le
   retrouver) ; la nouvelle liste, à son montage, le reprend — et rouvre la
   feuille qui le contenait : un tiroir marqué `data-feuille="<nom>"` (il
   demande `feuilleARouvrir(nom)` à sa création), ou un <details>.
   ========================================================================== */

type Reprise = { zone: string; selecteur: string | null; feuille: string | null; dansDetails: boolean; quand: number };

let enAttente: Reprise | null = null;

function selecteurDe(e: HTMLElement): string | null {
  if (e.id) return `#${CSS.escape(e.id)}`;
  const nom = e.getAttribute("name");
  if (nom) {
    const valeur = e instanceof HTMLInputElement && e.type === "checkbox" ? `[value="${CSS.escape(e.value)}"]` : "";
    return `${e.tagName.toLowerCase()}[name="${CSS.escape(nom)}"]${valeur}`;
  }
  if (e instanceof HTMLButtonElement && e.type === "submit") return 'button[type="submit"]';
  return null;
}

/** À appeler juste avant de naviguer : retient l'élément actif (ou celui
 *  qui a déclenché le changement — Safari ne donne pas le focus à une case
 *  cochée à la souris) s'il est dans `racine`, et la feuille qui le contient. */
export function noteReprise(zone: string, racine: HTMLElement | null, declencheur?: EventTarget | null) {
  if (!racine) return;
  const candidat = declencheur instanceof HTMLElement ? declencheur : document.activeElement;
  const element = candidat instanceof HTMLElement && racine.contains(candidat) ? candidat : null;
  enAttente = {
    zone,
    selecteur: element ? selecteurDe(element) : null,
    feuille: racine.closest("[data-feuille]")?.getAttribute("data-feuille") ?? null,
    dansDetails: Boolean(racine.closest("details")),
    quand: Date.now(),
  };
}

/** Le tiroir `nom` doit-il se rouvrir (on vient d'y cocher un filtre) ? Ne
 *  consomme rien : `reprends` rendra le focus ensuite. */
export function feuilleARouvrir(nom: string): boolean {
  return typeof window !== "undefined" && enAttente !== null && enAttente.feuille === nom && Date.now() - enAttente.quand < 10_000;
}

/** À appeler au montage : rend le focus à l'élément retenu pour cette zone. */
export function reprends(zone: string, racine: HTMLElement | null) {
  const r = enAttente;
  if (!r || r.zone !== zone || !racine) return;
  enAttente = null;
  if (Date.now() - r.quand > 10_000) return;
  if (r.dansDetails) {
    const feuille = racine.closest("details");
    if (feuille) feuille.open = true;
  }
  if (r.selecteur) racine.querySelector<HTMLElement>(r.selecteur)?.focus({ preventScroll: true });
}
