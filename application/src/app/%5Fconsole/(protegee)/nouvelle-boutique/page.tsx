import type { Metadata } from "next";
import { exigeAdmin } from "@/lib/console/session";

export const metadata: Metadata = { title: "Nouvelle boutique" };

/* C1 · Créer une boutique et lui attribuer son domaine. Elle naît « en
   préparation » : rien n'est visible tant qu'on ne l'ouvre pas. */
export default async function NouvelleBoutique({ searchParams }: {
  searchParams: Promise<{ erreur?: string; nom?: string; slug?: string; hote?: string; theme?: string }>;
}) {
  await exigeAdmin();
  const v = await searchParams;
  return (
    <div className="max-w-[40rem]">
      <h1>Nouvelle boutique</h1>
      <p className="text-encre-doux mt-1">Elle naîtra « en préparation » : la vitrine ne l&apos;affiche qu&apos;une fois ouverte.</p>

      <form action="/nouvelle-boutique/creer" method="post" className="carte formulaire mt-6">
        {v.erreur ? <p className="message message-erreur" role="alert">{v.erreur}</p> : null}
        <div className="champ">
          <label htmlFor="nom">Nom de la boutique</label>
          <input id="nom" name="nom" required maxLength={80} defaultValue={v.nom ?? ""} autoFocus />
        </div>
        <div className="champ">
          <label htmlFor="slug">Identifiant</label>
          <input id="slug" name="slug" required pattern="[a-z0-9]([a-z0-9\-]{0,46}[a-z0-9])?" maxLength={48} defaultValue={v.slug ?? ""}
            aria-describedby="aide-slug" />
          <p id="aide-slug" className="aide">Minuscules, chiffres et tirets : il sert de dossier des fichiers et d&apos;adresse interne. Il ne change plus ensuite.</p>
        </div>
        <div className="champ">
          <label htmlFor="hote">Domaine principal</label>
          <input id="hote" name="hote" required placeholder="maboutique.tn" defaultValue={v.hote ?? ""} aria-describedby="aide-hote" />
          <p id="aide-hote" className="aide">Sans « https:// ». D&apos;autres domaines (www., ancien domaine) s&apos;ajoutent sur la fiche de la boutique.</p>
        </div>
        <fieldset className="champ">
          <legend className="text-petit font-medium">Gabarit</legend>
          <label className="opt">
            <input type="radio" name="theme" value="editorial" defaultChecked={(v.theme ?? "editorial") !== "technique"} />
            Éditorial — mode, bagages, maroquinerie : grandes images, typographie de magazine
          </label>
          <label className="opt">
            <input type="radio" name="theme" value="technique" defaultChecked={v.theme === "technique"} />
            Technique — outillage, quincaillerie, grands catalogues : recherche, références, stock chiffré
          </label>
        </fieldset>
        <button type="submit" className="btn btn-primaire">Créer la boutique</button>
      </form>
    </div>
  );
}
