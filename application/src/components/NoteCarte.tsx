import { Etoiles } from "./Etoiles";
import { t } from "@/lib/i18n";
import { noteLisible } from "@/lib/avis";

/* La note d'un produit sur sa carte (module avis) : les étoiles, la
   moyenne, le nombre d'avis. Lue avec le produit (public.vitrine_produits),
   donc dans la page servie : rien n'arrive après coup. Rien sans avis. */
export function NoteCarte({ note, classe }: { note?: { moyenne: number; total: number } | null; classe: string }) {
  if (!note || note.total < 1) return null;
  return (
    <span className={`carte-note ${classe}`}>
      <Etoiles note={note.moyenne} taille={12} />
      <span className="carte-note-moyenne">{noteLisible(note.moyenne)}</span>
      <span className="carte-note-total">
        ({note.total}<span className="sr-only"> {t.avis.total(note.total)}</span>)
      </span>
    </span>
  );
}
