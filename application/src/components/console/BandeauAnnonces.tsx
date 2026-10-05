import { Icone } from "./Icone";
import { NIVEAUX_ANNONCE, type AnnonceBoutique } from "@/lib/console/annonces";

/* Les annonces de SkanEcom, en tête du back-office : une nouveauté, une
   maintenance prévue. « Fermer » la retire pour soi seulement. */
/** « Maintenance · Coupure dimanche », sans redire le genre quand le titre le dit déjà. */
function titreAnnonce(a: AnnonceBoutique): string {
  const genre = NIVEAUX_ANNONCE[a.niveau].titre;
  return a.titre.toLocaleLowerCase("fr").startsWith(genre.toLocaleLowerCase("fr")) ? a.titre : `${genre} · ${a.titre}`;
}

export function BandeauAnnonces({ slug, annonces }: { slug: string; annonces: AnnonceBoutique[] }) {
  if (!annonces.length) return null;
  return (
    <div className="ann-pile" role="region" aria-label="Annonces de SkanEcom">
      {annonces.map((a) => (
        <div key={a.id} className="ann" data-niveau={a.niveau}>
          <Icone nom={a.niveau === "maintenance" ? "alerte" : a.niveau === "nouveaute" ? "etoile" : "cloche"} taille={16} />
          <p className="ann-texte">
            <b>{titreAnnonce(a)}</b> {a.texte}
            {a.lien ? <> <a href={a.lien} {...(a.lien.startsWith("http") ? { target: "_blank", rel: "noopener" } : {})}>En savoir plus</a></> : null}
          </p>
          <form action={`/gestion/${slug}/annonces/fermer`} method="post">
            <input type="hidden" name="annonce_id" value={a.id} />
            <button type="submit" className="btn btn-fantome btn-petit ann-fermer" aria-label={`Fermer l'annonce : ${a.titre}`}>
              <Icone nom="croix" taille={14} />
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
