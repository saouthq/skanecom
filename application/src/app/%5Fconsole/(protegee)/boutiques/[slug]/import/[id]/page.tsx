import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { dateJournal, deNom } from "@/lib/console/libelles";
import { formatePrix } from "@/lib/prix";
import type { LigneImport } from "@/lib/console/import";
import { valeurAvecUnite } from "@/lib/caracteristiques";
import { Icone } from "@/components/console/Icone";

export const metadata: Metadata = { title: "Rapport d'import" };

type Rapport = {
  lignes: number; produits: number; produits_nouveaux: number; variantes_nouvelles: number; variantes_modifiees: number;
  stocks_ajustes: number; rayons_nouveaux: string[]; erreurs: { ligne: number; message: string }[]; erreurs_total: number;
  /** Les caractéristiques reconnues dans le fichier (B9) ; absentes des rapports d'avant. */
  caracteristiques?: { cle: string; label: string; unite: string | null; type: "texte" | "nombre" }[];
  fiches_techniques?: number;
};
type Import = {
  id: string; fichier: string; statut: "pret" | "applique"; created_at: string; applique_le: string | null;
  rapport: Rapport; axes: { cle: string; label: string }[]; boutique: { id: string; slug: string; nom: string };
  acteur: string | null; apercu: LigneImport[];
};

function Chiffre({ valeur, libelle }: { valeur: number | string; libelle: string }) {
  return (
    <div className="chiffre-cle">
      <p className="chiffre-cle-valeur tabular-nums">{valeur}</p>
      <p className="text-petit text-encre-doux">{libelle}</p>
    </div>
  );
}

/* Le rapport : ce que l'import va faire, ou pourquoi il ne peut pas. */
export default async function RapportImport({ params }: { params: Promise<{ slug: string; id: string }> }) {
  await exigeAdmin();
  const { slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data, error } = await clientService().rpc("console_import", { p_import_id: id });
  if (error) throw new Error(`Import illisible : ${error.message}`);
  const imp = data as Import | null;
  if (!imp || imp.boutique.slug !== slug) notFound();
  const r = imp.rapport;
  const produitsModifies = r.produits - r.produits_nouveaux;
  const caracteristiques = r.caracteristiques ?? [];

  return (
    <>
      <div className="sous-tete">
        <p className="page-avant"><Link href={`/boutiques/${slug}/import`}><Icone nom="retour" taille={14} /> Importer un autre fichier</Link></p>
        <h2 className="carte-titre-icone"><Icone nom="fichier" /> {imp.fichier}</h2>
        <p>{r.lignes} lignes lues le {dateJournal(imp.created_at)}{imp.acteur ? ` par ${imp.acteur}` : ""}.</p>
      </div>

      <div className="grid gap-5">
        {imp.statut === "applique" ? (
          <p className="message message-succes" role="status">
            Import appliqué le {dateJournal(imp.applique_le!)} : le catalogue {deNom(imp.boutique.nom)} est à jour.{" "}
            <Link href={`/boutiques/${slug}`} className="underline">Retour à la boutique</Link>
          </p>
        ) : r.erreurs_total > 0 ? (
          <p className="message message-erreur" role="alert">
            {r.erreurs_total} erreur{r.erreurs_total > 1 ? "s" : ""} : rien ne sera importé. Corrigez le fichier, puis{" "}
            <Link href={`/boutiques/${slug}/import`} className="underline">vérifiez-le de nouveau</Link>.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Chiffre valeur={r.produits_nouveaux} libelle={`produit${r.produits_nouveaux > 1 ? "s" : ""} nouveau${r.produits_nouveaux > 1 ? "x" : ""}`} />
          <Chiffre valeur={produitsModifies} libelle={`produit${produitsModifies > 1 ? "s" : ""} mis à jour`} />
          <Chiffre valeur={r.variantes_nouvelles + r.variantes_modifiees} libelle={`variantes (${r.variantes_nouvelles} nouvelles)`} />
          <Chiffre valeur={r.stocks_ajustes} libelle="stocks ajustés au journal" />
        </div>
        {r.rayons_nouveaux.length > 0 ? (
          <p className="text-encre-doux">Rayons créés : <span className="text-encre">{r.rayons_nouveaux.join(", ")}</span></p>
        ) : null}
        {caracteristiques.length > 0 ? (
          <p className="text-encre-doux">
            Fiche technique : <span className="text-encre">{caracteristiques.map((c) => c.label).join(", ")}</span>
            {r.fiches_techniques ? ` · ${r.fiches_techniques} produit${r.fiches_techniques > 1 ? "s" : ""}` : ""}
          </p>
        ) : null}

        {r.erreurs.length > 0 ? (
          <section className="carte defile" aria-labelledby="t-erreurs">
            <h2 id="t-erreurs">Erreurs à corriger dans le fichier</h2>
            <table className="tableau mt-3">
              <thead><tr><th>Ligne</th><th>Problème</th></tr></thead>
              <tbody>
                {r.erreurs.map((e, i) => (
                  <tr key={i}><td className="tabular-nums">{e.ligne}</td><td>{e.message}</td></tr>
                ))}
              </tbody>
            </table>
            {r.erreurs_total > r.erreurs.length ? <p className="aide mt-2">Et {r.erreurs_total - r.erreurs.length} autres.</p> : null}
          </section>
        ) : null}

        <section className="carte defile" aria-labelledby="t-apercu">
          <h2 id="t-apercu">Aperçu{r.lignes > imp.apercu.length ? ` (${imp.apercu.length} premières lignes)` : ""}</h2>
          <table className="tableau mt-3">
            <thead>
              <tr>
                <th>Ligne</th><th>Produit</th><th>Référence</th><th>Prix</th><th>Stock</th>
                {imp.axes.map((a) => <th key={a.cle}>{a.label}</th>)}
                {caracteristiques.map((c) => <th key={`car-${c.cle}`}>{c.label}</th>)}
                <th>Rayon</th>
              </tr>
            </thead>
            <tbody>
              {imp.apercu.map((l) => (
                <tr key={l.ligne}>
                  <td className="tabular-nums">{l.ligne}</td>
                  <td>{l.produit}</td>
                  <td className="font-mono text-petit">{l.reference}</td>
                  <td className="tabular-nums whitespace-nowrap">{l.prix_millimes !== null ? formatePrix(l.prix_millimes) : "—"}</td>
                  <td className="tabular-nums">{l.stock ?? "—"}</td>
                  {imp.axes.map((a) => <td key={a.cle}>{l.options[a.cle] ?? ""}</td>)}
                  {caracteristiques.map((c) => (
                    <td key={`car-${c.cle}`} className="whitespace-nowrap">{l.caracteristiques?.[c.cle] ? valeurAvecUnite(l.caracteristiques[c.cle], c) : ""}</td>
                  ))}
                  <td className="text-encre-doux">{l.rayon.map((x) => x.nom).join(" › ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {imp.statut === "pret" && r.erreurs_total === 0 ? (
          <form action={`/boutiques/${slug}/import/${imp.id}/appliquer`} method="post" className="flex flex-wrap items-center gap-4">
            <button type="submit" className="btn btn-primaire">
              Importer {r.produits} produit{r.produits > 1 ? "s" : ""} ({r.lignes} variante{r.lignes > 1 ? "s" : ""})
            </button>
            <span className="text-petit text-encre-doux">Tout le fichier passe en une fois, ou rien.</span>
          </form>
        ) : null}
      </div>
    </>
  );
}
