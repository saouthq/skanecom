/* ============================================================================
   LA REPRISE APRÈS UN FILTRE

   Changer de filtre ou de tri change d'ADRESSE, donc de page : Next remonte la
   liste, et l'élément qui avait le focus disparaît avec l'ancienne. Pour
   l'utilisateur au clavier, le focus retombait tout en haut ; sur téléphone,
   la feuille de filtres se refermait après chaque case.

   Juste avant de partir, on note l'élément actif (sa zone et de quoi le
   retrouver) ; la nouvelle liste, à son montage, le reprend — et rouvre la
   feuille qui le contenait.
   ========================================================================== */

type Reprise = { zone: string; selecteur: string; dansFeuille: boolean; quand: number };

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

/** À appeler juste avant de naviguer : retient l'élément actif s'il est dans
 *  `racine`. */
export function noteReprise(zone: string, racine: HTMLElement | null) {
  const actif = document.activeElement;
  if (!racine || !(actif instanceof HTMLElement) || !racine.contains(actif)) return;
  const selecteur = selecteurDe(actif);
  if (!selecteur) return;
  enAttente = { zone, selecteur, dansFeuille: Boolean(racine.closest("details")), quand: Date.now() };
}

/** À appeler au montage : rend le focus à l'élément retenu pour cette zone. */
export function reprends(zone: string, racine: HTMLElement | null) {
  const r = enAttente;
  if (!r || r.zone !== zone || !racine) return;
  enAttente = null;
  if (Date.now() - r.quand > 10_000) return;
  if (r.dansFeuille) {
    const feuille = racine.closest("details");
    if (feuille) feuille.open = true;
  }
  racine.querySelector<HTMLElement>(r.selecteur)?.focus({ preventScroll: true });
}
