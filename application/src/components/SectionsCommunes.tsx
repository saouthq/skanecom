import { Lookbook } from "./Lookbook";
import { Bannieres } from "./Bannieres";
import { PieceSaison } from "./PieceSaison";
import { urlFichier, urlPhoto } from "@/lib/photos";
import { prixDepuis } from "@/lib/catalogue";
import { formatePrix } from "@/lib/prix";
import { champ, t } from "@/lib/i18n";
import { texte, type CodeTheme, type Section } from "@/lib/theme";
import type { Cadre } from "@/lib/boutique";
import type { DonneesAccueil } from "@/lib/accueil";

/* ============================================================================
   LES SECTIONS COMMUNES À TOUTES LES STRUCTURES (migration 69) — le lookbook
   et la pièce de la saison, rendus de la même façon partout ; chaque
   structure les habille (immersif.css). Une section qui n'a rien à montrer
   (un lookbook sans photo ni pièce encore publiée, une pièce retirée) ne
   s'affiche pas.
   ========================================================================== */

export function SectionLookbook({ rang, section, donnees, cadre }: {
  rang: number;
  section: Extract<Section, { type: "lookbook" }>;
  donnees: DonneesAccueil;
  cadre: Cadre;
}) {
  const points = donnees.lookbooks.get(rang);
  if (!section.image || !points?.length) return null;
  const pieces = points.map(({ x, y, produit }) => {
    const prix = prixDepuis(produit);
    return { x, y, slug: produit.slug, nom: champ(produit, "nom"), prix: prix === null ? null : formatePrix(prix), photo: urlPhoto(produit) };
  });
  return (
    <Lookbook
      rang={rang}
      etiquette={texte(section.textes, "etiquette")}
      titre={texte(section.textes, "titre", t.accueil.lookbookTitre)}
      image={{ src: urlFichier(section.image.chemin), alt: texte(section.textes, "image_alt", cadre.boutique.nom) }}
      pieces={pieces}
    />
  );
}

export function SectionPiece({ rang, section, donnees, cadre, gabarit }: {
  rang: number;
  section: Extract<Section, { type: "piece" }>;
  donnees: DonneesAccueil;
  cadre: Cadre;
  gabarit?: CodeTheme;
}) {
  const produit = donnees.pieces.get(rang);
  return produit ? <PieceSaison rang={rang} section={section} produit={produit} cadre={cadre} gabarit={gabarit} /> : null;
}

/** Les bannières : celles qui ont une photo ou un titre (une diapo vide ne
 *  se montre pas) ; sans aucune, la section ne s'affiche pas. */
export function SectionBannieres({ rang, section, cadre }: {
  rang: number;
  section: Extract<Section, { type: "bannieres" }>;
  cadre: Cadre;
}) {
  const diapos = section.diapos
    .map((d) => ({
      titre: texte(d.textes, "titre"),
      texte: texte(d.textes, "texte"),
      cta: texte(d.textes, "cta"),
      lien: d.lien ?? null,
      alt: texte(d.textes, "image_alt", texte(d.textes, "titre", cadre.boutique.nom)),
      paysage: d.image ? urlFichier(d.image.chemin) : null,
      portrait: d.image?.portrait ? urlFichier(d.image.portrait) : null,
    }))
    .filter((d) => d.paysage || d.titre);
  if (!diapos.length) return null;
  return <Bannieres rang={rang} etiquette={texte(section.textes, "etiquette")} titre={texte(section.textes, "titre")} diapos={diapos} />;
}
