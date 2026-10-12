import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnTetePage, initiales, styleAvatar } from "@/components/console/Coquille";
import { Pagination } from "@/components/console/Pagination";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { age, lienAppel, quand, lienWhatsApp, telephoneLisible } from "@/lib/gestion/libelles";
import { PEUT_MODIFIER } from "@/lib/gestion/catalogue";

export const metadata: Metadata = { title: "Demandes" };

/* ============================================================================
   LES DEMANDES — ce que les visiteurs écrivent par le formulaire de contact
   de la vitrine (réglage vitrine.formulaire_contact), par étape : nouvelles
   (la plus ancienne en haut : c'est elle qu'on rappelle), en cours, traitées.
   Chacune dit qui, comment répondre (appeler, WhatsApp, e-mail : d'un
   geste), quoi, d'où (la réalisation ou le produit), et ce que l'équipe en a
   noté. Les gestes sont des formulaires ordinaires ; la base revérifie le
   rôle et l'étape affichée (…_demandes_contact.sql).
   ========================================================================== */

type Statut = "nouvelle" | "en_cours" | "traitee";

type Demande = {
  numero: string;
  statut: Statut;
  nom: string;
  telephone: string | null;
  email: string | null;
  sujet: string | null;
  message: string;
  produit_slug: string | null;
  produit_nom: string | null;
  page: string | null;
  note: string | null;
  cree_le: string;
  traitee_le: string | null;
  precedentes: number;
};

type Liste = { total: number; compteurs: Record<"nouvelles" | "en_cours" | "traitees", number>; demandes: Demande[] };

const ETAPES = [
  { cle: "nouvelles", libelle: "Nouvelles", vide: "Aucune demande ne vous attend : celles du formulaire arrivent ici, et par e-mail." },
  { cle: "en_cours", libelle: "En cours", vide: "Aucune demande en cours." },
  { cle: "traitees", libelle: "Traitées", vide: "Aucune demande traitée pour l'instant. Elles s'effacent au bout d'un an." },
] as const;

const LIBELLES: Record<Statut, string> = { nouvelle: "Nouvelle", en_cours: "En cours", traitee: "Traitée" };

const PAR_PAGE = 30;

export default async function Demandes({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ etape?: string; page?: string; ok?: string; erreur?: string; carte?: string }>;
}) {
  const [{ slug }, recherche] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const etape = ETAPES.find((e) => e.cle === recherche.etape) ?? ETAPES[0];
  const page = Math.max(1, Number.parseInt(recherche.page ?? "1", 10) || 1);
  const [{ data: etat }, { data, error }] = await Promise.all([
    sb.rpc("gestion_demandes_etat", { p_boutique_id: boutique.boutique_id }),
    sb.rpc("gestion_liste_demandes", { p_boutique_id: boutique.boutique_id, p_etape: etape.cle, p_limite: PAR_PAGE, p_decalage: (page - 1) * PAR_PAGE }),
  ]);
  if (error) throw new Error(`Demandes illisibles : ${error.message}`);
  const liste = data as Liste;
  const e = etat as { actif: boolean; total: number } | null;
  // Formulaire fermé et aucune demande passée : rien à montrer ici.
  if (!e?.actif && !e?.total) notFound();
  const maintenant = new Date();
  const pages = Math.max(1, Math.ceil(liste.total / PAR_PAGE));
  const lien = (cle: string, p = 1) => `/gestion/${slug}/demandes?etape=${cle}${p > 1 ? `&page=${p}` : ""}`;
  const action = `/gestion/${slug}/demandes/action`;
  const direction = PEUT_MODIFIER.includes(boutique.role);
  // Le message d'un geste paraît sur la carte où il a été fait (?carte=demande-…), sinon en tête.
  const message = (carte: string | null) => {
    if ((recherche.carte ?? null) !== carte) return null;
    const classe = carte ? "message" : "message dm-annonce";
    return recherche.ok ? <p className={`${classe} message-succes`} role="status">{recherche.ok}</p>
      : recherche.erreur ? <p className={`${classe} message-erreur`} role="alert">{recherche.erreur}</p> : null;
  };

  return (
    <>
      <EnTetePage
        titre="Demandes"
        description={etape.cle === "nouvelles"
          ? "Ce que les visiteurs écrivent par le formulaire de la vitrine, la plus ancienne en haut : répondez, puis dites « Je m'en occupe »."
          : "Les demandes du formulaire de contact, et ce que l'équipe en a fait."}
      />
      {e?.actif ? null : (
        <p className="message message-attention dm-annonce">Le formulaire de contact est fermé : la vitrine ne propose plus que WhatsApp, l&apos;appel et l&apos;e-mail. <Link href={`/gestion/${slug}/reglages`}>Réglages</Link></p>
      )}
      {message(null)}

      <nav className="onglets bo-etapes" aria-label="Étapes des demandes">
        {ETAPES.map((x) => (
          <Link key={x.cle} href={lien(x.cle)} aria-current={x.cle === etape.cle ? "page" : undefined}>
            {x.libelle}
            <span className="compte-onglet">{liste.compteurs[x.cle]}</span>
          </Link>
        ))}
      </nav>

      {liste.demandes.length === 0 ? (
        <div className="vide bo-vide">
          <span className="vide-icone"><Icone nom="courriel" taille={20} /></span>
          <strong>Rien ici</strong>
          <p>{etape.vide}</p>
        </div>
      ) : (
        <ul className="dm-liste" role="list">
          {liste.demandes.map((d) => {
            const carte = `demande-${d.numero}`;
            const prenom = d.nom.split(" ")[0];
            const reponse = `Bonjour ${prenom}, ici ${boutique.nom}. Merci pour votre message${d.produit_nom ? ` à propos de « ${d.produit_nom} »` : ""} : `;
            return (
              <li key={d.numero} id={carte} className="carte dm-carte" data-statut={d.statut}>
                <div className="dm-tete">
                  <span className="avatar" style={styleAvatar(d.nom)} aria-hidden="true">{initiales(d.nom)}</span>
                  <div className="dm-qui">
                    <strong>{d.nom}</strong>
                    <span className="discret text-petit">
                      {d.numero} · <span title={quand(d.cree_le, maintenant)}>{age(d.cree_le, maintenant)}</span>
                      {d.precedentes > 0 ? ` · a déjà écrit ${d.precedentes === 1 ? "une fois" : `${d.precedentes} fois`}` : ""}
                    </span>
                  </div>
                  <span className={`bo-statut dm-statut-${d.statut}`}>{LIBELLES[d.statut]}</span>
                </div>
                {d.sujet || d.produit_nom ? (
                  <p className="dm-objet ui-etats">
                    {d.sujet ? <span className="ui-etat">{d.sujet}</span> : null}
                    {d.produit_nom ? <span className="ui-etat"><Icone nom="photo" taille={12} /> {d.produit_nom}</span> : null}
                  </p>
                ) : null}
                <p className="dm-message">{d.message}</p>
                <div className="dm-joindre">
                  {d.telephone ? (
                    <>
                      <a className="btn btn-second btn-petit" href={lienAppel(d.telephone)}><Icone nom="telephone" taille={15} /> {telephoneLisible(d.telephone)}</a>
                      <a className="btn btn-second btn-petit" href={lienWhatsApp(d.telephone, reponse)} target="_blank" rel="noopener"><Icone nom="message" taille={15} /> WhatsApp</a>
                    </>
                  ) : null}
                  {d.email ? (
                    <a className="btn btn-second btn-petit" href={`mailto:${d.email}?subject=${encodeURIComponent(`Votre demande ${d.numero} — ${boutique.nom}`)}&body=${encodeURIComponent(reponse)}`}>
                      <Icone nom="courriel" taille={15} /> {d.email}
                    </a>
                  ) : null}
                </div>
                {d.note ? <p className="dm-note"><Icone nom="note" taille={14} /> <span>{d.note}</span></p> : null}
                {message(carte)}
                <div className="dm-gestes">
                  {d.statut === "nouvelle" ? (
                    <form action={action} method="post">
                      <input type="hidden" name="numero" value={d.numero} /><input type="hidden" name="statut" value={d.statut} />
                      <input type="hidden" name="etape" value={etape.cle} />
                      <button className="btn btn-primaire btn-petit" name="geste" value="prendre">Je m&apos;en occupe</button>
                    </form>
                  ) : d.statut === "en_cours" ? (
                    <form action={action} method="post">
                      <input type="hidden" name="numero" value={d.numero} /><input type="hidden" name="statut" value={d.statut} />
                      <input type="hidden" name="etape" value={etape.cle} />
                      <button className="btn btn-primaire btn-petit" name="geste" value="traiter"><Icone nom="coche" taille={15} /> Traitée</button>
                    </form>
                  ) : (
                    <form action={action} method="post">
                      <input type="hidden" name="numero" value={d.numero} /><input type="hidden" name="statut" value={d.statut} />
                      <input type="hidden" name="etape" value={etape.cle} />
                      <button className="btn btn-second btn-petit" name="geste" value="rouvrir">Rouvrir</button>
                    </form>
                  )}
                  <details className="dm-pli">
                    <summary className="btn btn-lien btn-petit">{d.note ? "Changer la note" : "Ajouter une note"}</summary>
                    <form action={action} method="post" className="formulaire dm-note-form">
                      <input type="hidden" name="numero" value={d.numero} /><input type="hidden" name="statut" value={d.statut} />
                      <input type="hidden" name="etape" value={etape.cle} />
                      <div className="champ">
                        <label htmlFor={`note-${d.numero}`}>Note de l&apos;équipe</label>
                        <textarea id={`note-${d.numero}`} name="note" rows={2} maxLength={1000} defaultValue={d.note ?? ""} placeholder="Rappelée le 12, visite fixée…" />
                      </div>
                      <button className="btn btn-second btn-petit" name="geste" value="noter">Enregistrer la note</button>
                    </form>
                  </details>
                  {direction ? (
                    <details className="dm-pli dm-effacer">
                      <summary className="btn btn-lien btn-petit">Effacer</summary>
                      <form action={action} method="post" className="ft-confirmer">
                        <input type="hidden" name="numero" value={d.numero} /><input type="hidden" name="statut" value={d.statut} />
                        <input type="hidden" name="etape" value={etape.cle} />
                        <p className="text-petit">Effacer la demande de {d.nom} ? Ses coordonnées et son message disparaissent, sans retour.</p>
                        <button className="btn btn-danger btn-petit" name="geste" value="retirer">Effacer la demande</button>
                      </form>
                    </details>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination page={page} pages={pages} total={liste.total} parPage={PAR_PAGE} lien={(n) => lien(etape.cle, n)} unite={["demande", "demandes"]} />
    </>
  );
}
