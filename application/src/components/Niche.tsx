import Image from "next/image";
import { Silhouette, type Forme } from "./Silhouette";
import { t } from "@/lib/i18n";

/* ============================================================================
   LA NICHE — le geste de marque, une seule forme à cinq échelles : hero,
   vignette de rayon, carte produit, galerie. C'est elle qui rend le site
   reconnaissable avant qu'on ait lu le nom (l'arc outrepassé du monogramme).

   TROIS OCCUPANTS POSSIBLES, dans cet ordre :

   1. une PHOTO DÉTOURÉE (fond retiré) — posée dans la niche, entière ;
   2. une photo ordinaire — cadrée par le plein cintre ;
   3. rien : l'ÉTAT D'ATTENTE — aplat sable, monogramme de la boutique en
      filigrane (s'il y en a un), une
      mention courte. C'est la décision de Luna du 11/08, après trois passages
      du juge visuel : « les produits sans photo réelle reçoivent un état
      photo à venir ÉLÉGANT et assumé, pas un pictogramme cheap — une maison
      qui attend ses photos peut le dire avec de la tenue ».

   ⚠️ Ne pas confondre avec la SILHOUETTE, qui reste l'emblème d'un RAYON
   (registre) : un rayon a un emblème, un produit a une photo — ou l'absence de
   photo, dite franchement.

   Aucune couleur n'est écrite ici : la matière de la niche vit dans
   `marque.css`, donc dans les jetons.
   ========================================================================== */

type Props = {
  /** Emblème du rayon — utilisé UNIQUEMENT en mode `embleme`. */
  forme?: Forme;
  photo?: { src: string; alt: string; detoure?: boolean; largeur?: number; hauteur?: number } | null;
  /** `embleme` = vignette de rayon (silhouette). Par défaut, une niche sans
   *  photo affiche l'état d'attente. */
  mode?: "produit" | "embleme";
  /** Mention posée en bas de niche (marque, matière). N'a de sens qu'avec une
   *  photo : sur un fond vide, elle ressemble au filigrane d'une image
   *  manquante (juge visuel, 11/08). */
  mention?: string;
  className?: string;
  /** Priorité de chargement — réservée à la première image de la page. */
  prioritaire?: boolean;
  /** Indication de largeur pour le calcul des sources responsives. */
  tailles?: string;
  children?: React.ReactNode;
};

export function Niche({
  forme = "boite",
  photo,
  mode = "produit",
  mention,
  className = "",
  prioritaire = false,
  tailles = "(min-width: 1100px) 25vw, (min-width: 700px) 33vw, 50vw",
  children,
}: Props) {
  const attente = !photo && mode === "produit";

  const classes = ["arc", photo?.detoure ? "arc-detoure" : "", attente ? "arc-attente" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      {photo ? (
        photo.detoure ? (
          /* Détourée : PAS `fill`. `fill` pose des styles EN LIGNE (inset:0,
             100 %) qui écraseraient la règle `.arc-detoure img` — la photo
             remplirait le cadre, le plein cintre disparaîtrait et le produit
             se ferait couper. C'est le CSS qui la pose dans la niche. */
          <Image
            src={photo.src}
            alt={photo.alt}
            width={photo.largeur ?? 1200}
            height={photo.hauteur ?? 1200}
            sizes={tailles}
            priority={prioritaire}
          />
        ) : (
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes={tailles}
            priority={prioritaire}
            className="object-cover"
          />
        )
      ) : attente ? (
        <>
          {/* Le monogramme de la BOUTIQUE (thème), en masque : absent, rien ne
              s'affiche (marque.css). */}
          <span className="filigrane-attente" aria-hidden="true" />
          <span className="mention-attente">{t.commun.photoAVenir}</span>
        </>
      ) : (
        <Silhouette forme={forme} />
      )}
      {photo && mention ? <span className="arc-etiquette">{mention}</span> : null}
      {children}
    </span>
  );
}
