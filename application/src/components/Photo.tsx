import Image from "next/image";
import { t } from "@/lib/i18n";

/* ============================================================================
   LA PHOTO — un cadre au rapport fixe (la page ne saute pas au chargement),
   et ses trois occupants possibles :

   1. une photo ordinaire, cadrée plein cadre ;
   2. une photo DÉTOURÉE (fond retiré), posée entière sur l'aplat du thème ;
   3. rien : l'état « photo à venir », dit avec tenue — un aplat, le nom du
      produit composé comme un cartel (quand on le connaît), le monogramme de
      la boutique en filigrane s'il existe, une mention courte
      (décision du 11/08 : une maison qui attend ses photos le dit, elle
      n'exhibe pas un pictogramme). On ne substitue JAMAIS la photo d'un autre
      produit.

   `survol` : la deuxième photo du produit, révélée au passage de la souris
   (gabarit éditorial). Décorative : son alt est vide.
   ========================================================================== */

export type PhotoAffichable = { src: string; alt: string; detoure?: boolean };

export function Photo({
  photo,
  survol,
  ratio = "4 / 5",
  tailles = "(min-width: 1100px) 25vw, (min-width: 700px) 33vw, 50vw",
  prioritaire = false,
  className = "",
  nom,
  children,
}: {
  photo: PhotoAffichable | null;
  survol?: PhotoAffichable | null;
  /** Rapport largeur / hauteur CSS : « 4 / 5 », « 1 / 1 »… */
  ratio?: string;
  tailles?: string;
  prioritaire?: boolean;
  className?: string;
  /** Le nom du produit : sans photo, il compose le cartel. */
  nom?: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={["cadre-image", photo?.detoure ? "detoure" : "", photo ? "" : "sans-photo", className].filter(Boolean).join(" ")}
      style={{ aspectRatio: ratio }}
    >
      {photo ? (
        // Détourée : entière (le composant pose object-fit: cover en ligne, que .detoure ne peut défaire).
        <Image src={photo.src} alt={photo.alt} fill sizes={tailles} priority={prioritaire} className="photo-principale"
          style={photo.detoure ? { objectFit: "contain" } : undefined} />
      ) : (
        <span className={nom ? "attente-photo attente-cartel" : "attente-photo"} aria-hidden="true">
          <span className="filigrane" aria-hidden="true" />
          {nom ? <span className="attente-nom">{nom}</span> : null}
          <span className="attente-mention">{t.commun.photoAVenir}</span>
        </span>
      )}
      {photo && survol && !photo.detoure ? (
        <Image src={survol.src} alt="" fill sizes={tailles} className="photo-survol" aria-hidden="true" />
      ) : null}
      {children}
    </span>
  );
}
