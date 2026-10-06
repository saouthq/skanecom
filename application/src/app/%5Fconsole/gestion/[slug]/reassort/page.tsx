import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { quand } from "@/lib/gestion/libelles";
import { adresseVitrine } from "@/lib/console/libelles";
import { cadreDeGestion } from "@/lib/gestion/pages";
import { urlFichier } from "@/lib/photos";
import { PEUT_PREVENIR, messageRetour, telephoneLisible, type EcranReassort, type PieceAttendue } from "@/lib/gestion/reassort";

export const metadata: Metadata = { title: "Réassort" };

/* ============================================================================
   LE RÉASSORT — les pièces épuisées que des clients attendent (« Prévenez-moi
   de son retour », réglage catalogue.prevenir_retour). Celles revenues en
   stock d'abord : qui prévenir, le message WhatsApp prêt (ou l'e-mail), puis
   « Prévenue » — le contact s'efface. Ensuite celles qu'on attend encore :
   combien de personnes, depuis quand, de quoi décider d'un arrivage ; ou
   « Ne reviendra pas », qui clôt les demandes. Propriétaire, administrateur
   et confirmation préviennent ; toute l'équipe regarde.
   ========================================================================== */
export default async function Reassort({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const [{ slug }, recherche] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const [{ data, error }, cadre, hoteConsole] = await Promise.all([
    sb.rpc("gestion_alertes_retour", { p_boutique_id: boutique.boutique_id }),
    cadreDeGestion(sb, boutique.boutique_id),
    headers().then((h) => h.get("host")),
  ]);
  if (error) throw new Error(`Réassort illisible : ${error.message}`);
  const ecran = data as EcranReassort;
  if (!ecran.actif && ecran.pieces.length === 0) notFound();
  const hote = cadre?.boutique.hote_principal ?? null;
  const vitrine = hote ? adresseVitrine(hote, hoteConsole) : null;

  const action = `/gestion/${slug}/reassort/action`;
  const previent = PEUT_PREVENIR.includes(boutique.role);
  const maintenant = new Date();
  const revenues = ecran.pieces.filter((p) => p.a_prevenir.length > 0);
  const attendues = ecran.pieces.filter((p) => p.a_prevenir.length === 0);
  const c = ecran.compteurs;

  return (
    <>
      <EnTetePage
        titre="Réassort"
        description="Les pièces épuisées que des clients attendent. Quand l'une revient en stock, prévenez-les : le message est prêt. Leur contact s'efface une fois prévenus."
      />

      {recherche.ok ? <p className="message message-succes mb-4" role="status">{recherche.ok}</p> : null}
      {recherche.erreur ? <p className="message message-erreur mb-4" role="alert">{recherche.erreur}</p> : null}
      {!ecran.actif ? (
        <p className="message mb-4">
          <span>
            Le réglage est coupé : les fiches ne proposent plus l&apos;alerte. Les demandes déjà faites restent ici.{" "}
            <Link href={`/gestion/${slug}/reglages/vitrine`}>Réglages, Fonctions de la vitrine</Link>
          </span>
        </p>
      ) : null}

      <section className="carte pm-synthese" aria-label="Les demandes">
        <p className="pm-synthese-ligne">
          <span className="ligne-points">
            <span><b className="tabular-nums">{c.a_prevenir}</b> {c.a_prevenir > 1 ? "personnes" : "personne"} à prévenir</span>
            <span><b className="tabular-nums">{c.attend}</b> {c.attend > 1 ? "personnes attendent" : "personne attend"} une pièce épuisée</span>
            <span><b className="tabular-nums">{c.prevenues_30j}</b> {c.prevenues_30j > 1 ? "prévenues" : "prévenue"} ces 30 jours</span>
          </span>
        </p>
      </section>

      <section aria-labelledby="t-revenues" className="pm-section">
        <h2 id="t-revenues" className="pm-titre">De retour, à prévenir <span className="compte-onglet">{revenues.length}</span></h2>
        {revenues.length === 0 ? (
          <div className="vide cat-vide">
            <span className="vide-icone"><Icone nom="cloche" taille={20} /></span>
            <strong>Personne à prévenir</strong>
            <p>Quand une pièce demandée revient en stock (un arrivage, un inventaire), ceux qui l&apos;attendaient s&apos;affichent ici.</p>
          </div>
        ) : (
          <ul className="ra-liste" role="list">
            {revenues.map((p) => <CartePiece key={p.variante_id} p={p} boutique={boutique.nom} vitrine={vitrine} slug={slug}
                                              maintenant={maintenant} previent={previent} action={action} />)}
          </ul>
        )}
      </section>

      {attendues.length > 0 ? (
        <section aria-labelledby="t-attendues" className="pm-section">
          <h2 id="t-attendues" className="pm-titre">Attendues <span className="compte-onglet">{attendues.length}</span></h2>
          <ul className="ra-liste" role="list">
            {attendues.map((p) => <CartePiece key={p.variante_id} p={p} boutique={boutique.nom} vitrine={vitrine} slug={slug}
                                               maintenant={maintenant} previent={previent} action={action} />)}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** Une pièce demandée : ce qu'il en reste, qui l'attend, les gestes. */
function CartePiece({ p, boutique, vitrine, slug, maintenant, previent, action }: {
  p: PieceAttendue; boutique: string; vitrine: string | null; slug: string; maintenant: Date; previent: boolean; action: string;
}) {
  const revenue = p.a_prevenir.length > 0;
  const lien = vitrine ? `${vitrine}/produit/${p.slug}` : null;
  return (
    <li className="carte ra-piece" id={`piece-${p.variante_id}`} data-revenue={revenue ? "" : undefined}>
      <div className="ra-tete">
        <span className="ra-photo">
          {p.image ? <Image src={urlFichier(p.image)} alt="" fill sizes="56px" /> : <Icone nom="colis" taille={18} />}
        </span>
        <span className="ra-nom">
          <Link href={`/gestion/${slug}/produits/${p.produit_id}#var-${p.variante_id}`}>{p.produit}</Link>
          <span className="aide">{[p.libelle, p.sku].filter(Boolean).join(" · ")}</span>
        </span>
        <span className={p.disponible ? "ui-etat ui-etat-point ui-etat-vert" : "ui-etat ui-etat-point ui-etat-ambre"}>
          {p.disponible ? `${p.stock} en stock` : p.stock > 0 ? `${p.stock} en stock, par ${p.minimum}` : "Épuisée"}
        </span>
      </div>

      {revenue ? (
        <>
          <p className="aide ra-quand">
            De retour {quand(p.revenue_le!, maintenant)} · {p.a_prevenir.length > 1 ? `${p.a_prevenir.length} personnes l'attendaient` : "une personne l'attendait"}
            {p.attend > 0 ? `, ${p.attend} de plus depuis` : ""}
          </p>
          <ul className="ra-contacts" role="list">
            {p.a_prevenir.map((a) => {
              const message = messageRetour(p, boutique, lien);
              const ecrire = a.telephone
                ? `https://wa.me/${a.telephone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`
                : `mailto:${a.email}?subject=${encodeURIComponent(`${p.produit} est de retour`)}&body=${encodeURIComponent(message)}`;
              return (
                <li key={a.id} className="ra-contact">
                  <span className="ra-qui">
                    <b className="tabular-nums">{a.telephone ? telephoneLisible(a.telephone) : a.email}</b>
                    <span className="aide">demandé {quand(a.demande_le, maintenant)}</span>
                  </span>
                  <span className="ra-gestes">
                    <a className="btn btn-second" href={ecrire} target="_blank" rel="noopener">
                      <Icone nom={a.telephone ? "message" : "courriel"} /> {a.telephone ? "WhatsApp" : "E-mail"}
                    </a>
                    {previent ? (
                      <form action={action} method="post">
                        <input type="hidden" name="geste" value="prevenue" />
                        <input type="hidden" name="ids" value={a.id} />
                        <input type="hidden" name="piece" value={p.variante_id} />
                        <button className="btn btn-second"><Icone nom="coche" taille={14} /> Prévenue</button>
                      </form>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {previent && p.a_prevenir.length > 1 ? (
            <form action={action} method="post" className="ra-toutes">
              <input type="hidden" name="geste" value="prevenue" />
              <input type="hidden" name="ids" value={p.a_prevenir.map((a) => a.id).join(",")} />
              <input type="hidden" name="piece" value={p.variante_id} />
              <button className="btn btn-primaire"><Icone nom="coche" taille={15} /> Toutes prévenues</button>
            </form>
          ) : null}
        </>
      ) : (
        <p className="ra-attente">
          <b className="tabular-nums">{p.attend}</b> {p.attend > 1 ? "personnes l'attendent" : "personne l'attend"}, depuis {quand(p.depuis, maintenant)}.
        </p>
      )}

      {!revenue ? (
        <div className="pm-gestes">
          <Link className="btn btn-second" href={`/gestion/${slug}/produits/${p.produit_id}#var-${p.variante_id}`}>
            <Icone nom="colis" /> Réceptionner un arrivage
          </Link>
          {previent ? (
            <details className="pm-pli">
              <summary className="btn btn-second">Ne reviendra pas</summary>
              <form action={action} method="post" className="pb-terminer">
                <input type="hidden" name="geste" value="annulee" />
                <input type="hidden" name="piece" value={p.variante_id} />
                <p className="aide">
                  Les demandes de cette pièce sont closes et leurs contacts effacés. Personne n&apos;est prévenu : pensez à le dire si vous en avez l&apos;occasion.
                </p>
                <button className="btn btn-danger">Clore les demandes</button>
              </form>
            </details>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
