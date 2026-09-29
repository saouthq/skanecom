import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { LIBELLES_STATUT, LIBELLES_THEME, adresseVitrine, dateJournal } from "@/lib/console/libelles";
import { equipeDe } from "@/lib/console/equipe-serveur";

type Fiche = {
  boutique: { id: string; slug: string; nom: string; statut: string; langue_defaut: string; created_at: string };
  domaines: { hote: string; type: string; principal: boolean; statut_certificat: string }[];
  theme: { code: string; version: number; updated_at: string } | null;
  compteurs: { produits: number; publies: number; variantes: number; categories: number };
  journal: { at: string; action: string; cible: string | null; acteur: string | null }[];
};

const ACTIONS: Record<string, string> = {
  "boutique.creer": "Boutique créée",
  "boutique.statut": "Statut changé",
  "domaine.ajouter": "Domaine ajouté",
  "theme.modifier": "Marque modifiée",
  "catalogue.importer": "Catalogue importé",
  "equipe.ajouter": "Membre invité",
  "equipe.modifier": "Accès modifié",
  "equipe.lien": "Lien d'accès remis",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: (await params).slug };
}

export default async function FicheBoutique({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erreur?: string; cree?: string; ok?: string }>;
}) {
  await exigeAdmin();
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { data, error } = await clientService().rpc("console_boutique", { p_slug: slug });
  if (error) throw new Error(`Boutique illisible : ${error.message}`);
  if (!data) notFound();
  const f = data as Fiche;
  const b = f.boutique;
  const principal = f.domaines.find((d) => d.principal)?.hote;
  const hoteConsole = (await headers()).get("host");
  const equipe = await equipeDe(b.id);
  const actifs = equipe.filter((m) => m.actif).length;
  const enAttente = equipe.filter((m) => m.actif && m.en_attente).length;

  return (
    <>
      <p className="text-petit"><Link href="/" className="text-encre-doux hover:underline">Boutiques</Link></p>
      <div className="flex flex-wrap items-center gap-3 mt-1">
        <h1>{b.nom}</h1>
        <span className={`statut statut-${b.statut}`}>{LIBELLES_STATUT[b.statut] ?? b.statut}</span>
      </div>
      <p className="text-encre-doux mt-1">
        {b.slug}
        {principal ? (
          <> · <a className="text-accent hover:underline" href={adresseVitrine(principal, hoteConsole)} target="_blank" rel="noopener">voir la vitrine ↗</a></>
        ) : null}
      </p>

      <div className="mt-6 grid gap-5">
        {messages.cree ? <p className="message message-succes" role="status">Boutique créée, en préparation. Réglez sa marque, importez son catalogue, puis ouvrez-la.</p> : null}
        {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}

        <section className="carte" aria-labelledby="t-mise-en-ligne">
          <h2 id="t-mise-en-ligne">Mise en ligne</h2>
          <p className="text-encre-doux mt-1">
            {b.statut === "active"
              ? "La vitrine est ouverte au public."
              : b.statut === "en_preparation"
                ? "La vitrine n'est pas encore servie : les visiteurs voient « boutique fermée »."
                : "La vitrine est fermée au public."}
          </p>
          <form action={`/boutiques/${b.slug}/statut`} method="post" className="mt-4 flex gap-3">
            <input type="hidden" name="boutique_id" value={b.id} />
            {b.statut === "active" ? (
              <button type="submit" name="statut" value="suspendue" className="btn btn-second">Suspendre la boutique</button>
            ) : (
              <button type="submit" name="statut" value="active" className="btn btn-primaire">Ouvrir la boutique</button>
            )}
          </form>
        </section>

        <section className="carte" aria-labelledby="t-domaines">
          <h2 id="t-domaines">Domaines</h2>
          <table className="tableau mt-3">
            <thead><tr><th>Domaine</th><th>Rôle</th><th>Certificat</th></tr></thead>
            <tbody>
              {f.domaines.map((d) => (
                <tr key={d.hote}>
                  <td><a href={adresseVitrine(d.hote, hoteConsole)} target="_blank" rel="noopener">{d.hote}</a></td>
                  <td>{d.principal ? "Principal" : "Secondaire"}</td>
                  <td className="text-encre-doux">{d.statut_certificat === "actif" ? "Actif" : d.statut_certificat === "erreur" ? "En erreur" : "En attente"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={`/boutiques/${b.slug}/domaines`} method="post" className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="boutique_id" value={b.id} />
            <div className="champ flex-1 min-w-[14rem]">
              <label htmlFor="hote">Ajouter un domaine</label>
              <input id="hote" name="hote" required placeholder="www.maboutique.tn" />
            </div>
            <label className="opt"><input type="checkbox" name="principal" value="1" /> en faire le domaine principal</label>
            <button type="submit" className="btn btn-second">Ajouter</button>
          </form>
        </section>

        <section className="carte" aria-labelledby="t-equipe">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="t-equipe">Équipe</h2>
              <p className="text-encre-doux mt-1">
                {equipe.length === 0
                  ? "Personne n'entre encore dans son backoffice."
                  : `${actifs} ${actifs > 1 ? "personnes ont" : "personne a"} accès au backoffice${enAttente ? ` · ${enAttente} invitation${enAttente > 1 ? "s" : ""} en attente` : ""}`}
              </p>
            </div>
            <Link href={`/boutiques/${b.slug}/equipe`} className="btn btn-second">{equipe.length === 0 ? "Inviter le propriétaire" : "Gérer l'équipe"}</Link>
          </div>
        </section>

        <section className="carte" aria-labelledby="t-marque">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="t-marque">Marque</h2>
              <p className="text-encre-doux mt-1">
                {f.theme ? `${LIBELLES_THEME[f.theme.code] ?? f.theme.code} · version ${f.theme.version}` : "Aucun thème"}
              </p>
            </div>
            <Link href={`/boutiques/${b.slug}/marque`} className="btn btn-second">Régler la marque</Link>
          </div>
        </section>

        <section className="carte" aria-labelledby="t-catalogue">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="t-catalogue">Catalogue</h2>
              <p className="text-encre-doux mt-1 tabular-nums">
                {f.compteurs.produits} produits ({f.compteurs.publies} publiés) · {f.compteurs.variantes} variantes · {f.compteurs.categories} rayons
              </p>
            </div>
            <Link href={`/boutiques/${b.slug}/import`} className="btn btn-second">Importer un catalogue</Link>
          </div>
        </section>

        <section className="carte" aria-labelledby="t-journal">
          <h2 id="t-journal">Journal</h2>
          {f.journal.length === 0 ? (
            <p className="text-encre-doux mt-1">Aucune action tracée.</p>
          ) : (
            <table className="tableau mt-3">
              <thead><tr><th>Quand</th><th>Action</th><th>Détail</th><th>Par</th></tr></thead>
              <tbody>
                {f.journal.map((j, i) => (
                  <tr key={i}>
                    <td className="tabular-nums whitespace-nowrap">{dateJournal(j.at)}</td>
                    <td>{ACTIONS[j.action] ?? j.action}</td>
                    <td className="text-encre-doux">{j.action === "boutique.statut" && j.cible ? (LIBELLES_STATUT[j.cible] ?? j.cible) : (j.cible ?? "")}</td>
                    <td className="text-encre-doux">{j.acteur ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
