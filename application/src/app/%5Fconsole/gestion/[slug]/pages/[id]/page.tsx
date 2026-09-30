import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { EditeurPage } from "@/components/console/EditeurPage";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { adresseVitrine } from "@/lib/console/libelles";
import { quand } from "@/lib/gestion/libelles";
import { cadreDeGestion, PEUT_ECRIRE, type PageGestion } from "@/lib/gestion/pages";

export const metadata: Metadata = { title: "Page" };

/* ============================================================================
   UNE PAGE DE LA BOUTIQUE — l'éditeur, et tout en bas le retrait.
   Qui l'a modifiée en dernier, et quand : en tête.
   ========================================================================== */
export default async function PageBoutique({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const [{ slug, id }, q] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const [{ data, error }, cadre, hoteConsole] = await Promise.all([
    sb.rpc("gestion_pages", { p_boutique_id: boutique.boutique_id }),
    cadreDeGestion(sb, boutique.boutique_id),
    headers().then((h) => h.get("host")),
  ]);
  if (error) throw new Error(`Pages illisibles : ${error.message}`);
  const page = (data as PageGestion[]).find((p) => p.id === id);
  if (!page) notFound();
  const base = `/gestion/${slug}/pages`;
  const action = `${base}/action`;
  const ecrit = PEUT_ECRIRE.includes(boutique.role);
  const hote = cadre?.boutique.hote_principal ?? null;
  const message = q.ok ? { ok: true, texte: q.ok } : q.erreur ? { ok: false, texte: q.erreur } : null;

  return (
    <>
      <EnTetePage
        avant={<Link href={base}><Icone nom="retour" taille={14} /> Pages</Link>}
        titre={<>{page.titre_fr} <span className={page.publie ? "ui-etat ui-etat-vert ui-etat-point" : "ui-etat ui-etat-point"}>{page.publie ? "Publiée" : "Brouillon"}</span></>}
        description={`Modifiée ${quand(page.modifiee_le)}${page.modifiee_par ? ` par ${page.modifiee_par}` : ""}.`}
      />
      <EditeurPage
        key={page.id}
        boutique={slug}
        base={base}
        action={action}
        vitrine={hote ? adresseVitrine(hote, hoteConsole) : null}
        affichee={hote ? hote.replace(/^www\./, "") : null}
        ecrit={ecrit}
        page={{
          id: page.id,
          version: page.version,
          titre: page.titre_fr,
          slug: page.slug,
          genre: page.genre,
          corps: page.corps_fr,
          publie: page.publie,
          dans_pied: page.dans_pied,
        }}
        message={message}
      />

      {ecrit ? (
        <section className="carte pg-retrait" aria-labelledby="t-retrait">
          <div className="carte-tete">
            <div>
              <h2 id="t-retrait" className="carte-titre-icone"><Icone nom="corbeille" /> Retirer la page</h2>
              <p>Elle quitte la boutique et son pied de page ; son adresse répond « page introuvable ». Le retrait est gardé au journal.</p>
            </div>
          </div>
          <details className="av-pli">
            <summary className="btn btn-danger btn-petit">Retirer « {page.titre_fr} »</summary>
            <form action={action} method="post" className="av-pli-form">
              <input type="hidden" name="geste" value="retirer" />
              <input type="hidden" name="id" value={page.id} />
              <p className="aide">Son texte est effacé. Pour la garder sans la montrer, décochez plutôt « Publiée ».</p>
              <button className="btn btn-danger btn-petit">Oui, retirer la page</button>
            </form>
          </details>
        </section>
      ) : null}
    </>
  );
}
