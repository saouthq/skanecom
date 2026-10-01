"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { Coche, Croix, Plus } from "./Icones";
import { Prix } from "./Prix";
import { ajouteAuPanier, annonceAjout } from "@/lib/panier";
import { photoVisible } from "@/lib/envol";
import { prixApplique, usePrixPro } from "@/lib/prix-pro";
import { couleurDeColoris } from "@/lib/coloris";
import { t } from "@/lib/i18n";
import type { Palier } from "@/lib/paliers";
import { useCommandeEnLigne } from "./CommandeEnLigne";

/* ============================================================================
   L'AJOUT DEPUIS LA PHOTO D'UNE CARTE (réglage catalogue.ajout_carte,
   migration 76) — un « + » rond dans le coin bas de la photo.

   · Une seule déclinaison : le « + » la met au panier (son minimum s'il se
     vend par lot), la photo de la carte s'envole vers le panier.
   · Quelques-unes (huit au plus) : le « + » ouvre, posé sur le bas de la
     photo, le choix — la taille, la couleur, le format ; leur prix quand il
     change de l'une à l'autre ; l'épuisée barrée, qu'on ne peut pas prendre.
     Un geste sur l'une la met au panier et referme le choix. Échap, la
     croix ou un geste ailleurs le referment ; le focus revient au « + ».
   · Rien en stock, trop de déclinaisons, un site vitrine, le réglage coupé :
     pas de « + », la carte mène à sa fiche.

   À la souris, le « + » paraît au survol de la carte, comme le cœur ; au
   doigt et au clavier, il est là. Il vit hors du lien de la carte : deux
   éléments actifs ne s'imbriquent pas.
   ========================================================================== */

const Actif = createContext(false);

export function AjoutCarteActif({ actif, children }: { actif: boolean; children: React.ReactNode }) {
  return <Actif.Provider value={actif}>{children}</Actif.Provider>;
}

/** Au-delà, le choix ne tient plus sur une photo : la fiche s'en charge. */
export const MAX_CHOIX_CARTE = 8;

export type ChoixCarte = {
  varianteId: string;
  sku: string;
  /** « M — 32 cm », « Sable », « Bleu marine · L » ; vide pour une déclinaison seule. */
  libelle: string;
  /** La couleur d'une pastille, quand le seul axe est la couleur. */
  pastille?: string;
  prixMillimes: number;
  stock: number;
  minimum: number;
  image?: string;
};

export function AjoutCarte({ produitId, slug, nom, axe, choix, paliers }: {
  produitId: string;
  slug: string;
  nom: string;
  /** Le nom de ce qu'on choisit (« Taille », « Couleur · Taille ») ; null : rien à choisir. */
  axe: string | null;
  choix: ChoixCarte[];
  paliers?: Palier[];
}) {
  const actif = useContext(Actif);
  const ouverte = useCommandeEnLigne();
  const pro = usePrixPro([produitId]);
  const [ouvert, setOuvert] = useState(false);
  const [ajoute, setAjoute] = useState(false);
  const plus = useRef<HTMLButtonElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const id = useId();
  // Refermé, le focus revient au « + » — après le rendu : caché pendant le choix, il ne le prendrait pas.
  const rendreFocus = useRef(false);
  const ferme = (focus: boolean) => {
    rendreFocus.current = focus;
    setOuvert(false);
  };

  // Refermé par Échap (le focus revient au « + ») ou par un geste hors de la carte.
  useEffect(() => {
    if (!ouvert) return;
    const touche = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      ferme(true);
    };
    const ailleurs = (e: PointerEvent) => {
      const racine = plus.current?.parentElement;
      if (racine && !racine.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("keydown", touche);
    document.addEventListener("pointerdown", ailleurs);
    return () => {
      document.removeEventListener("keydown", touche);
      document.removeEventListener("pointerdown", ailleurs);
    };
  }, [ouvert]);

  // À l'ouverture, le focus va au premier choix disponible ; à la fermeture, au « + ».
  useEffect(() => {
    if (ouvert) panneau.current?.querySelector<HTMLButtonElement>("button.ajc-valeur:not(:disabled)")?.focus();
    else if (rendreFocus.current) {
      rendreFocus.current = false;
      plus.current?.focus({ preventScroll: true });
    }
  }, [ouvert]);

  useEffect(() => {
    if (!ajoute) return;
    const m = setTimeout(() => setAjoute(false), 2200);
    return () => clearTimeout(m);
  }, [ajoute]);

  const disponibles = choix.filter((c) => c.stock >= c.minimum && c.stock > 0);
  if (!actif || !ouverte || disponibles.length === 0 || choix.length > MAX_CHOIX_CARTE) return null;

  const prixDe = (c: ChoixCarte) => prixApplique(pro, { id: c.varianteId, prix_millimes: c.prixMillimes });
  const prixVarient = new Set(choix.map(prixDe)).size > 1;
  // Une seule déclinaison (même nommée : un seul coloris) : rien à choisir.
  const seule = choix.length === 1 ? choix[0] : null;

  const met = (c: ChoixCarte, auClavier: boolean) => {
    const prix = prixDe(c);
    const libelle = c.libelle ? `${nom} · ${c.libelle}` : nom;
    ajouteAuPanier(
      {
        varianteId: c.varianteId,
        produitSlug: slug,
        sku: c.sku,
        libelle,
        quantite: c.minimum,
        prixMillimesAjout: prix,
        ...(c.image ? { image: c.image } : {}),
        ...(c.minimum > 1 ? { quantiteMin: c.minimum } : {}),
        ...(paliers?.length ? { paliers } : {}),
      },
      c.stock,
    );
    // Au clavier, la confirmation de l'ajout prend le focus, et le rend au « + » en se fermant.
    ferme(!auClavier);
    setAjoute(true);
    const bouton = plus.current;
    annonceAjout({
      libelle,
      quantite: c.minimum,
      prixMillimes: prix,
      ...(c.image ? { image: c.image } : {}),
      depuis: photoVisible(bouton?.closest(".ed-carte")) ?? bouton,
      bouton,
      auClavier,
    });
  };

  const etiquette = ajoute
    ? t.produit.ajoutCarteAjoute(nom)
    : seule && seule.minimum > 1
      ? t.produit.ajoutCarteLot(seule.minimum, nom)
      : t.produit.ajoutCarte(nom);

  return (
    <div className="ajc" data-ouvert={ouvert ? "" : undefined}>
      <button
        ref={plus}
        type="button"
        className="ajc-plus"
        aria-label={etiquette}
        data-ajoute={ajoute ? "" : undefined}
        {...(seule ? {} : { "aria-expanded": ouvert, "aria-controls": id })}
        onClick={(e) => {
          if (seule) met(seule, e.detail === 0);
          else setOuvert((o) => !o);
        }}
      >
        {ajoute ? <Coche taille={18} /> : <Plus taille={18} />}
      </button>
      {seule ? null : (
        <div ref={panneau} id={id} className="ajc-choix" role="group" aria-label={axe ?? undefined} hidden={!ouvert}>
          <div className="ajc-tete">
            <span className="ajc-axe" aria-hidden="true">{axe}</span>
            <button type="button" className="ajc-fermer" aria-label={t.produit.ajoutCarteFermer}
              onClick={() => ferme(true)}>
              <Croix taille={14} />
            </button>
          </div>
          <div className="ajc-valeurs">
            {choix.map((c) => {
              const epuise = c.stock <= 0 || c.stock < c.minimum;
              return (
                <button
                  key={c.varianteId}
                  type="button"
                  className="ajc-valeur"
                  disabled={epuise}
                  data-epuise={epuise ? "" : undefined}
                  onClick={(e) => met(c, e.detail === 0)}
                >
                  {c.pastille ? <i className="ajc-pastille" style={{ background: couleurDeColoris(c.pastille) }} aria-hidden="true" /> : null}
                  <span className="ajc-libelle">{c.libelle}</span>
                  {epuise ? <span className="sr-only">, {t.produit.ajoutCarteEpuise}</span> : null}
                  {c.minimum > 1 ? <span className="ajc-lot">{t.produit.ajoutCarteParLot(c.minimum)}</span> : null}
                  {prixVarient && !epuise ? <span className="ajc-prix"><Prix millimes={prixDe(c)} /></span> : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
