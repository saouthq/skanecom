import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnTetePage, initiales, styleAvatar } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { quand, telephoneLisible } from "@/lib/gestion/libelles";
import { CLASSES_STATUT_PRO, FILTRES_PRO, LIBELLES_STATUT_PRO, PEUT_DECIDER_PRO, type ListeComptesPro } from "@/lib/gestion/pro";

export const metadata: Metadata = { title: "Comptes professionnels" };

/* ============================================================================
   LES COMPTES PROFESSIONNELS (module comptes_pro) — les demandes arrivées
   de la boutique en ligne, la plus ancienne d'abord, chacune avec ce que
   le client a écrit (raison sociale, matricule fiscal, métier, un mot) et
   ce que la boutique sait de lui (commandes, refus). Valider ouvre ses
   prix pro ; refuser dit pourquoi (il le lira dans son compte).
   Puis les comptes ouverts, et ceux refusés ou retirés.
   ========================================================================== */
export default async function ComptesPro({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ filtre?: string; ok?: string; erreur?: string }>;
}) {
  const [{ slug }, recherche] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const filtre = FILTRES_PRO.find((f) => f.cle === recherche.filtre) ?? FILTRES_PRO[0];
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_comptes_pro", { p_boutique_id: boutique.boutique_id, p_filtre: filtre.cle });
  if (error) throw new Error(`Comptes professionnels illisibles : ${error.message}`);
  const liste = data as ListeComptesPro;
  if (!liste.actif && liste.compteurs.demandes + liste.compteurs.valides + liste.compteurs.refuses === 0) notFound();

  const decide = PEUT_DECIDER_PRO.includes(boutique.role);
  const base = `/gestion/${slug}/clients`;
  const maintenant = new Date();

  return (
    <>
      <EnTetePage
        avant={<Link href={base}><Icone nom="retour" taille={14} /> Clients</Link>}
        titre="Comptes professionnels"
        description={
          liste.actif
            ? "Plombiers, électriciens, artisans : validés, ils voient leurs prix pro sur les fiches, au panier et à la commande."
            : "Le module est coupé : aucun prix pro ne s'applique. Les comptes restent ici, tels quels."
        }
      />

      {recherche.ok ? <p className="message message-succes" role="status">{recherche.ok}</p> : null}
      {recherche.erreur ? <p className="message message-erreur" role="alert">{recherche.erreur}</p> : null}

      <nav className="onglets" aria-label="Comptes professionnels">
        {FILTRES_PRO.map((f) => (
          <Link key={f.cle} href={`${base}/pros?filtre=${f.cle}`} aria-current={f.cle === filtre.cle ? "page" : undefined}>
            {f.libelle}
            <span className={`compte-onglet${f.cle === "demandes" && liste.compteurs.demandes > 0 ? " compte-alerte" : ""}`}>
              {liste.compteurs[f.cle]}
            </span>
          </Link>
        ))}
      </nav>

      {liste.comptes.length === 0 ? (
        <div className="vide cat-vide">
          <span className="vide-icone"><Icone nom="personne" taille={20} /></span>
          <strong>Personne ici</strong>
          <p>{filtre.vide}</p>
        </div>
      ) : (
        <ul className="pro-liste" role="list">
          {liste.comptes.map((c) => (
            <li key={c.client_id} className="carte pro-ligne" data-statut={c.statut}>
              <div className="pro-ligne-tete">
                <span className="initiale cl-initiale" style={styleAvatar(c.raison_sociale)} aria-hidden="true">{initiales(c.raison_sociale)}</span>
                <div className="pro-ligne-qui">
                  <strong>{c.raison_sociale}</strong>
                  <span className="discret">
                    <Link href={`${base}/${c.client_id}`}>{c.nom ?? "Fiche client"}</Link>
                    {" · "}<span className="tabular-nums">{telephoneLisible(c.telephone)}</span>
                    {c.metier ? <> · {c.metier}</> : null}
                  </span>
                </div>
                <span className={CLASSES_STATUT_PRO[c.statut]}>{LIBELLES_STATUT_PRO[c.statut]}</span>
              </div>
              <dl className="pro-ligne-faits">
                <div><dt>Matricule fiscal</dt><dd className="tabular-nums">{c.matricule_fiscal ?? <span className="discret">non donné</span>}</dd></div>
                <div><dt>Commandes</dt><dd>{c.commandes}{c.refus > 0 ? <span className="pro-refus"> · {c.refus} refus</span> : null}</dd></div>
                <div><dt>{c.statut === "demande" ? "Demandé" : "Décidé"}</dt><dd>{quand(c.statut === "demande" ? c.demande_le : (c.decide_le ?? c.demande_le), maintenant)}</dd></div>
              </dl>
              {c.message ? <blockquote className="pro-ligne-message">« {c.message} »</blockquote> : null}
              {c.motif && c.statut !== "demande" && c.statut !== "valide" ? <p className="aide">Motif : {c.motif}</p> : null}
              {decide && liste.actif && c.statut === "demande" ? (
                <div className="pro-ligne-gestes">
                  <form action={`${base}/${c.client_id}/action`} method="post">
                    <input type="hidden" name="action" value="compte_pro" />
                    <input type="hidden" name="decision" value="valide" />
                    <input type="hidden" name="statut_vu" value="demande" />
                    <input type="hidden" name="depuis" value="pros" />
                    <button className="btn btn-primaire btn-petit"><Icone nom="coche" taille={14} /> Valider</button>
                  </form>
                  <details className="pro-refuser">
                    <summary className="btn btn-second btn-petit">Refuser…</summary>
                    <form action={`${base}/${c.client_id}/action`} method="post" className="pro-refuser-form">
                      <input type="hidden" name="action" value="compte_pro" />
                      <input type="hidden" name="decision" value="refuse" />
                      <input type="hidden" name="statut_vu" value="demande" />
                      <input type="hidden" name="depuis" value="pros" />
                      <label htmlFor={`motif-${c.client_id}`} className="sr-only">Pourquoi</label>
                      <input id={`motif-${c.client_id}`} name="motif" className="entree" maxLength={300} required
                             placeholder="Ex. Pas d'activité professionnelle vérifiée" />
                      <button className="btn btn-danger btn-petit">Refuser</button>
                    </form>
                  </details>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
