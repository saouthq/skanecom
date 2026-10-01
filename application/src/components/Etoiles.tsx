import type { CSSProperties } from "react";
import { t } from "@/lib/i18n";
import { noteLisible } from "@/lib/avis-communs";

/* Cinq étoiles, remplies jusqu'à la note (4,6 : la cinquième aux trois
   cinquièmes). Deux rangs superposés : le fond pâle, le plein coupé à la
   note — le coupé part du début de la ligne, donc de la droite en arabe.
   Pour un lecteur d'écran : « 4,6 sur 5 ». */

const ETOILE = "M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.3l-5.8 3.1 1.2-6.5L2.6 9.4l6.5-.8z";

function Rang() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24" aria-hidden="true">
          <path d={ETOILE} fill="currentColor" />
        </svg>
      ))}
    </>
  );
}

export function Etoiles({ note, taille = 16, className }: { note: number; taille?: number; className?: string }) {
  const plein = Math.max(0, Math.min(100, (note / 5) * 100));
  return (
    <span
      className={className ? `etoiles ${className}` : "etoiles"}
      role="img"
      aria-label={t.avis.surCinq(noteLisible(note))}
      style={{ "--etoile-taille": `${taille}px` } as CSSProperties}
    >
      <span className="etoiles-fond"><Rang /></span>
      <span className="etoiles-plein" style={{ inlineSize: `${plein}%` }}><Rang /></span>
    </span>
  );
}
