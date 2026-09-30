/* ============================================================================
   L'ENVOL — l'article ajouté rejoint le panier de l'en-tête.

   La photo qu'on regardait (une copie, posée exactement sur elle) se soulève,
   file en arc vers le panier en rapetissant et s'y fond : on voit où l'article
   est allé, sans quitter la page. Sans photo à l'écran (la barre d'achat du
   téléphone, une galerie qu'on a fait défiler), une pastille part du bouton
   pressé, avec la vignette de l'article s'il en a une, son initiale sinon.

   L'arc : le déplacement vertical prend un peu d'avance sur l'horizontal —
   l'article file en diagonale, bombée vers le haut, sans longer l'en-tête.
   Trois éléments imbriqués portent les trois mouvements (x, y, taille) :
   chacun sa courbe.

   Rien ne s'envole avec « réduire les animations » ou sans Web Animations :
   la promesse est tenue tout de suite, la confirmation suit.
   ========================================================================== */

const DUREE = 720;
/** Le côté de l'article à l'arrivée, en pixels : à peu près l'icône du panier. */
const ARRIVEE = 26;

/** La photo qui occupe le plus d'écran dans un bloc (une galerie et ses
 *  vignettes, une carte), pourvu que le quart au moins en soit visible. */
export function photoVisible(racine: ParentNode | null | undefined): Element | null {
  if (!racine || typeof window === "undefined") return null;
  const h = window.innerHeight;
  const l = window.innerWidth;
  let meilleure: Element | null = null;
  let meilleureAire = 0;
  for (const el of Array.from(racine.querySelectorAll(".cadre-image"))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const aire = Math.max(0, Math.min(r.bottom, h) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, l) - Math.max(r.left, 0));
    if (aire / (r.width * r.height) >= 0.25 && aire > meilleureAire) {
      meilleureAire = aire;
      meilleure = el;
    }
  }
  return meilleure;
}

/** Fait voler l'article de `depuis` (une photo `.cadre-image`, ou le bouton
 *  pressé) jusqu'à `vers` (le panier). Résolue à l'arrivée. */
export function envole(
  depuis: Element | null | undefined,
  vers: Element | null,
  { image, initiale }: { image?: string | null; initiale?: string } = {},
): Promise<void> {
  if (typeof window === "undefined" || !vers) return Promise.resolve();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || typeof Element.prototype.animate !== "function") {
    return Promise.resolve();
  }
  const b = vers.getBoundingClientRect();
  if (b.width === 0 || b.bottom < 0 || b.top > window.innerHeight) return Promise.resolve();

  const corps = document.createElement("div");
  corps.className = "envol-corps";
  const photo = depuis?.matches(".cadre-image") ? depuis : null;
  let a = photo?.getBoundingClientRect() ?? null;

  if (photo && a && a.width > 0) {
    const copie = photo.cloneNode(true) as HTMLElement;
    copie.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    copie.classList.add("envol-copie");
    corps.append(copie);
  } else {
    // La pastille : du centre du bouton pressé (ou du bas de l'écran).
    const r = depuis?.getBoundingClientRect();
    const cote = 52;
    const cx = r && r.width ? r.left + r.width / 2 : window.innerWidth / 2;
    const cy = r && r.width ? r.top + r.height / 2 : window.innerHeight - 96;
    a = new DOMRect(cx - cote / 2, cy - cote / 2, cote, cote);
    corps.classList.add("envol-pastille");
    if (image) {
      const img = document.createElement("img");
      img.src = image;
      img.alt = "";
      img.decoding = "async";
      corps.append(img);
    } else if (initiale) {
      corps.textContent = initiale;
    }
  }

  const volant = document.createElement("div");
  volant.className = "envol";
  volant.setAttribute("aria-hidden", "true");
  Object.assign(volant.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  const vertical = document.createElement("div");
  vertical.className = "envol-y";
  vertical.append(corps);
  volant.append(vertical);
  document.body.append(volant);

  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const echelle = Math.max(0.03, Math.min(1, ARRIVEE / Math.max(a.width, a.height)));
  const temps = { duration: DUREE, fill: "forwards" as const };

  const mouvements = [
    volant.animate([{ transform: "translate3d(0, 0, 0)" }, { transform: `translate3d(${dx}px, 0, 0)` }], {
      ...temps,
      easing: "cubic-bezier(.4, 0, .6, 1)",
    }),
    vertical.animate([{ transform: "translate3d(0, 0, 0)" }, { transform: `translate3d(0, ${dy}px, 0)` }], {
      ...temps,
      easing: "cubic-bezier(.3, .55, .45, 1)",
    }),
    // Soulevée (un peu plus grande, son ombre), puis réduite à la taille de
    // l'icône, arrondie, et fondue dans le panier.
    corps.animate(
      [
        { transform: "scale(1)", opacity: 1, easing: "cubic-bezier(.3, 0, .2, 1)" },
        { transform: "scale(1.035)", opacity: 1, offset: 0.12, easing: "cubic-bezier(.45, 0, .2, 1)" },
        { transform: `scale(${echelle})`, borderRadius: "50%", opacity: 1, offset: 0.86, easing: "ease-in" },
        { transform: `scale(${echelle * 0.55})`, borderRadius: "50%", opacity: 0 },
      ],
      temps,
    ),
  ];

  return Promise.all(mouvements.map((m) => m.finished))
    .then(() => undefined, () => undefined)
    .finally(() => volant.remove());
}
