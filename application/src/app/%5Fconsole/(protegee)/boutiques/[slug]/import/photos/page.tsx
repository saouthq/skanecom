import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { boutiqueDe } from "@/lib/console/equipe-serveur";
import { dateJournal } from "@/lib/console/libelles";
import type { ProduitReference } from "@/lib/console/photos-import";
import { Icone } from "@/components/console/Icone";
import { ImportPhotos } from "./ImportPhotos";
import { titreBoutique } from "@/lib/console/titre-boutique";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: await titreBoutique(params, "Photos") };
}

type Lot = { id: string; cree_le: string; qui: string | null; photos: number; produits: number; retire_le: string | null; retire_par: string | null };

/* C5 · Les photos des produits, d'un coup : le dossier du fournisseur (ou
   son .zip), rapproché du catalogue par les références. Les envois
   précédents se relisent, et se retirent d'un geste. */
export default async function PhotosImport({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erreur?: string; ok?: string }>;
}) {
  await exigeAdmin();
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const boutique = await boutiqueDe(slug);
  if (!boutique) notFound();
  const [{ data: refs, error }, { data: lotsBruts }] = await Promise.all([
    clientService().rpc("console_references", { p_boutique_id: boutique.id }),
    clientService().rpc("console_lots_photos", { p_boutique_id: boutique.id }),
  ]);
  if (error) throw new Error(`Catalogue illisible : ${error.message}`);
  const produits = (refs ?? []) as ProduitReference[];
  const lots = (lotsBruts ?? []) as Lot[];
  const sansPhoto = produits.filter((p) => p.photos === 0).length;

  return (
    <div className="pile max-w-[56rem]">
      <div className="sous-tete">
        <p className="page-avant"><Link href={`/boutiques/${slug}/import`}><Icone nom="retour" taille={14} /> Importer un catalogue</Link></p>
        <h2>Les photos des produits</h2>
        <p>
          {produits.length === 0
            ? "Le catalogue est vide : importez d'abord le fichier du catalogue, puis ses photos."
            : `${produits.length.toLocaleString("fr-FR")} produit${produits.length > 1 ? "s" : ""}, dont ${sansPhoto.toLocaleString("fr-FR")} sans photo. Chaque photo est réduite dans votre navigateur (2 000 px, WebP) avant l'envoi.`}
        </p>
      </div>

      {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
      {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}

      {produits.length ? <ImportPhotos slug={slug} produits={produits} /> : null}
      <noscript><p className="message">Cette étape demande JavaScript : c&apos;est le navigateur qui lit le dossier et réduit les photos.</p></noscript>

      <section className="carte" aria-labelledby="t-pi-lots">
        <div className="carte-tete">
          <div>
            <h2 id="t-pi-lots" className="carte-titre-icone"><Icone nom="journal" /> Envois précédents</h2>
            <p>{lots.length ? "Un envoi se retire d'un geste : ses photos quittent les produits, celles ajoutées au backoffice restent." : "Aucune photo envoyée d'ici pour l'instant."}</p>
          </div>
        </div>
        {lots.length ? (
          <ul className="pi-lots" role="list">
            {lots.map((l) => (
              <li key={l.id} className="pi-lot" data-retire={l.retire_le ? "" : undefined}>
                <span className="pi-lot-texte">
                  <span className="pi-lot-titre tabular-nums">
                    {l.retire_le ? "Retiré" : `${l.photos} photo${l.photos > 1 ? "s" : ""} · ${l.produits} produit${l.produits > 1 ? "s" : ""}`}
                  </span>
                  <span className="pi-lot-detail tabular-nums">
                    {dateJournal(l.cree_le)}{l.qui ? ` · ${l.qui}` : ""}
                    {l.retire_le ? ` · retiré le ${dateJournal(l.retire_le)}${l.retire_par ? ` par ${l.retire_par}` : ""}` : ""}
                  </span>
                </span>
                {!l.retire_le && l.photos > 0 ? (
                  <details className="pi-lot-retirer">
                    <summary className="btn btn-second btn-petit">Retirer ces photos…</summary>
                    <form action={`/boutiques/${slug}/import/photos/retirer`} method="post" className="pi-lot-confirmer">
                      <input type="hidden" name="lot" value={l.id} />
                      <p>Les {l.photos} photo{l.photos > 1 ? "s" : ""} de cet envoi quitteront {l.produits > 1 ? `ses ${l.produits} produits` : "son produit"}.</p>
                      <button type="submit" className="btn btn-danger btn-petit">Oui, retirer</button>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
