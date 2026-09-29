import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { LIMITE_LIGNES } from "@/lib/console/import";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: `Import · ${(await params).slug}` };
}

/* C5 · Importer un catalogue : choisir le fichier. La vérification vient
   ensuite, sur la page du rapport, avant que rien ne soit écrit. */
export default async function Import({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  await exigeAdmin();
  const [{ slug }, { erreur }] = await Promise.all([params, searchParams]);
  const { data } = await clientService().rpc("console_boutique", { p_slug: slug });
  if (!data) notFound();
  const { boutique } = data as { boutique: { id: string; nom: string } };

  return (
    <div className="max-w-[48rem]">
      <div className="sous-tete">
        <h2>Importer un catalogue</h2>
        <p>
          Un fichier Excel (.xlsx) ou CSV. Rien n&apos;est écrit avant votre confirmation : la console vérifie d&apos;abord
          chaque ligne et vous montre ce qui sera créé, modifié ou refusé.
        </p>
      </div>

      <form action={`/boutiques/${slug}/import/analyser`} method="post" encType="multipart/form-data" className="carte formulaire">
        {erreur ? <p className="message message-erreur" role="alert">{erreur}</p> : null}
        <input type="hidden" name="boutique_id" value={boutique.id} />
        <div className="champ">
          <label htmlFor="fichier">Fichier du catalogue</label>
          <input id="fichier" name="fichier" type="file" required accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" />
          <p className="aide">5 Mo et {LIMITE_LIGNES.toLocaleString("fr-FR")} lignes au plus. Seule la première feuille est lue.</p>
        </div>
        <button type="submit" className="btn btn-primaire">Vérifier le fichier</button>
      </form>

      <section className="carte mt-5" aria-labelledby="t-format">
        <h2 id="t-format">Le format</h2>
        <p className="mt-2">
          <b>Une ligne par variante</b> (une référence), le nom du produit répété sur chaque ligne de ses variantes.{" "}
          <a className="text-accent hover:underline" href={`/boutiques/${slug}/import/modele.csv`}>Télécharger le modèle</a>
        </p>
        <table className="tableau mt-3">
          <thead><tr><th>Colonne</th><th>Ce qu&apos;elle contient</th></tr></thead>
          <tbody>
            <tr><td><b>Produit</b> *</td><td>Le nom affiché. Même nom = même produit.</td></tr>
            <tr><td><b>Référence</b> *</td><td>La référence de la variante (unique dans la boutique).</td></tr>
            <tr><td><b>Prix</b> *</td><td>En dinars : 189 · 189,000 · 1 234,500.</td></tr>
            <tr><td>Prix barré</td><td>L&apos;ancien prix, supérieur au prix (affiché si la boutique le permet).</td></tr>
            <tr><td>Stock</td><td>Pièces disponibles. Pour une variante existante, l&apos;écart passe au journal du stock.</td></tr>
            <tr><td>Rayon</td><td>« Outillage &gt; Perceuses » : le rayon et son parent, créés s&apos;ils n&apos;existent pas.</td></tr>
            <tr><td>Marque, Description</td><td>Texte libre.</td></tr>
            <tr><td>Poids</td><td>En grammes, ou en kg si la colonne s&apos;appelle « Poids (kg) ».</td></tr>
            <tr><td>Publié</td><td>« non » pour garder un produit hors de la vitrine ; les nouveaux produits sont publiés sinon.</td></tr>
            <tr><td><i>Toute autre colonne</i></td><td>Un axe de variante, sous son nom : Couleur, Taille, Tension, Conditionnement…</td></tr>
          </tbody>
        </table>
        <p className="aide mt-3">
          Une cellule vide ne remplace rien : on peut réimporter un fichier avec seulement les prix et les stocks.
          Rien n&apos;est jamais supprimé par un import.
        </p>
      </section>
    </div>
  );
}
