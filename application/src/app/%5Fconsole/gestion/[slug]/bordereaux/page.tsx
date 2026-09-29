import type { Metadata } from "next";
import Link from "next/link";
import { Prix } from "@/components/Prix";
import { BoutonImprimer } from "@/components/console/BoutonImprimer";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { telephoneLisible } from "@/lib/gestion/libelles";

export const metadata: Metadata = { title: "Bordereaux" };

type Bordereau = {
  numero: string;
  statut: string;
  cree_le: string;
  nom: string;
  telephone: string;
  ligne1: string;
  ligne2: string | null;
  ville: string;
  gouvernorat: string;
  code_postal: string | null;
  zone: string | null;
  note_client: string | null;
  transporteur: string | null;
  suivi: string | null;
  paiement: string;
  statut_paiement: string;
  total: number;
  lignes: { produit: string; declinaison: string | null; reference: string | null; quantite: number }[];
};

type Donnees = {
  expediteur: { nom: string; raison_sociale: string | null; adresse: string | null; telephone: string | null };
  commandes: Bordereau[];
  /** Les commandes à retirer en magasin, qui n'ont pas de bordereau. */
  retraits: number;
};

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Tunis" });

/* ============================================================================
   LES BORDEREAUX DE LIVRAISON (B5, en attendant les transporteurs branchés)
   — deux par feuille A4, à découper et coller sur le colis : qui expédie,
   qui reçoit (le téléphone en grand : le livreur appelle), le numéro de la
   commande, ce que contient le colis, et le montant à encaisser.

   /gestion/<boutique>/bordereaux?etape=a_preparer  — toutes les commandes
   confirmées ; ?n=MAY-2026-00001&n=…  — celles-là.
   ========================================================================== */
export default async function Bordereaux({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ n?: string | string[]; etape?: string }>;
}) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const numeros = q.n ? (Array.isArray(q.n) ? q.n : [q.n]).filter((n) => /^[A-Z0-9-]{3,40}$/.test(n)).slice(0, 200) : null;
  const etape = numeros?.length ? null : q.etape === "expediees" ? "expediees" : "a_preparer";

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_bordereaux", {
    p_boutique_id: boutique.boutique_id, p_numeros: numeros?.length ? numeros : null, p_etape: etape,
  });
  if (error) throw new Error(`Bordereaux illisibles : ${error.message}`);
  const d = data as Donnees;
  const exp = d.expediteur;
  const n = d.commandes.length;
  const retour = numeros?.length === 1 ? `/gestion/${slug}/commandes/${numeros[0]}` : `/gestion/${slug}?etape=a_preparer`;

  return (
    <>
      <div className="bdx-ecran">
        <EnTetePage
          avant={<Link href={retour}><Icone nom="retour" taille={14} /> {numeros?.length === 1 ? numeros[0] : "Commandes"}</Link>}
          titre={n === 1 ? "Bordereau de livraison" : `${n} bordereaux de livraison`}
          description={
            <>
              {n === 0
                ? "Aucune commande à livrer : rien à imprimer."
                : "Deux par feuille A4, à découper et coller sur le colis. Dans la boîte d'impression, « Enregistrer en PDF » en fait un fichier."}
              {d.retraits > 0
                ? ` ${d.retraits} commande${d.retraits > 1 ? "s" : ""} à retirer en magasin : pas de bordereau, elle${d.retraits > 1 ? "s" : ""} attend${d.retraits > 1 ? "ent" : ""} au comptoir.`
                : ""}
            </>
          }
          actions={n > 0 ? <BoutonImprimer libelle={n === 1 ? "Imprimer le bordereau" : `Imprimer les ${n} bordereaux`} /> : null}
        />
      </div>

      <div className="bdx-feuilles">
        {d.commandes.map((c) => {
          const aEncaisser = c.paiement === "cod" && c.statut_paiement !== "paye";
          const pieces = c.lignes.reduce((s, l) => s + l.quantite, 0);
          return (
            <article key={c.numero} className="bdx" aria-label={`Bordereau ${c.numero}`}>
              <header className="bdx-tete">
                <div className="bdx-expediteur">
                  <p className="bdx-etiquette">Expéditeur</p>
                  <p className="bdx-exp-nom">{exp.nom}</p>
                  {exp.raison_sociale && exp.raison_sociale !== exp.nom ? <p>{exp.raison_sociale}</p> : null}
                  {exp.adresse ? <p>{exp.adresse}</p> : null}
                  {exp.telephone ? <p>{telephoneLisible(exp.telephone)}</p> : null}
                </div>
                <div className="bdx-numero">
                  <p className="bdx-etiquette">Commande</p>
                  <p className="bdx-num">{c.numero}</p>
                  <p>{DATE.format(new Date(c.cree_le))}</p>
                </div>
              </header>

              <section className="bdx-destinataire">
                <p className="bdx-etiquette">Destinataire</p>
                <p className="bdx-dest-nom">{c.nom}</p>
                <p className="bdx-dest-tel">{telephoneLisible(c.telephone)}</p>
                <p className="bdx-adresse">
                  {c.ligne1}{c.ligne2 ? <><br />{c.ligne2}</> : null}
                  <br />
                  <b>{[c.code_postal, c.ville].filter(Boolean).join(" ")}</b> — {c.gouvernorat}
                </p>
                {c.note_client ? <p className="bdx-note">« {c.note_client} »</p> : null}
              </section>

              <div className="bdx-bas">
                <section className="bdx-contenu">
                  <p className="bdx-etiquette">Contenu · {pieces} pièce{pieces > 1 ? "s" : ""}</p>
                  <ul>
                    {c.lignes.map((l, i) => (
                      <li key={i}>
                        <b>{l.quantite} ×</b> {l.produit}{l.declinaison ? ` — ${l.declinaison}` : ""}
                        {l.reference ? <span className="bdx-ref"> {l.reference}</span> : null}
                      </li>
                    ))}
                  </ul>
                </section>
                <section className={aEncaisser ? "bdx-montant" : "bdx-montant bdx-paye"}>
                  <p className="bdx-etiquette">{aEncaisser ? "À encaisser" : "Déjà payé"}</p>
                  <p className="bdx-somme">{aEncaisser ? <Prix millimes={c.total} /> : "0,000 TND"}</p>
                  {aEncaisser ? <p>En espèces, à la remise. Refus : ne rien encaisser.</p> : null}
                </section>
              </div>

              {c.transporteur || c.suivi || c.zone ? (
                <footer className="bdx-pied">
                  {c.transporteur ? <span>Transporteur : <b>{c.transporteur}</b></span> : null}
                  {c.suivi ? <span>Suivi : <b>{c.suivi}</b></span> : null}
                  {c.zone ? <span>Zone : <b>{c.zone}</b></span> : null}
                </footer>
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
}
