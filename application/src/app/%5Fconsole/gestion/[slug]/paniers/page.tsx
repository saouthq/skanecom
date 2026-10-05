import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { age, quand, telephoneLisible } from "@/lib/gestion/libelles";
import { adresseVitrine } from "@/lib/console/libelles";
import { cadreDeGestion } from "@/lib/gestion/pages";
import { formateMontant } from "@/lib/prix";
import { urlFichier } from "@/lib/photos";
import { PEUT_RELANCER, messageRelance, type EcranPaniers, type PanierSuivi } from "@/lib/gestion/paniers";

export const metadata: Metadata = { title: "Paniers abandonnés" };

/* ============================================================================
   LES PANIERS ABANDONNÉS — des clients connectés ont rempli leur panier sans
   commander (réglage commande.relance_paniers). Une heure plus tard, ils
   s'affichent ici : qui, quoi, combien, depuis quand ; le message WhatsApp
   prêt (ou l'e-mail) ; « Relancé » (une fois, pas deux) ou « Ignorer ».
   Puis ce que les relances ont donné : la commande qui a suivi, s'il y en a
   une. Propriétaire, administrateur et confirmation relancent ; toute
   l'équipe regarde.
   ========================================================================== */
export default async function Paniers({
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
    sb.rpc("gestion_paniers", { p_boutique_id: boutique.boutique_id }),
    cadreDeGestion(sb, boutique.boutique_id),
    headers().then((h) => h.get("host")),
  ]);
  if (error) throw new Error(`Paniers illisibles : ${error.message}`);
  const ecran = data as EcranPaniers;
  if (!ecran.actif && ecran.paniers.length === 0) notFound();
  const hote = cadre?.boutique.hote_principal ?? null;
  const vitrine = hote ? adresseVitrine(hote, hoteConsole) : null;

  const action = `/gestion/${slug}/paniers/action`;
  const relance = PEUT_RELANCER.includes(boutique.role);
  const maintenant = new Date();
  const aRelancer = ecran.paniers.filter((p) => p.etat === "a_relancer");
  const relances = ecran.paniers.filter((p) => p.etat === "relance");
  const c = ecran.compteurs;

  return (
    <>
      <EnTetePage
        titre="Paniers abandonnés"
        description="Des clients connectés ont rempli leur panier sans commander. Une relance, une seule, message prêt : souvent, il manquait un détail — une taille, la livraison, un doute."
      />

      {recherche.ok ? <p className="message message-succes mb-4" role="status">{recherche.ok}</p> : null}
      {recherche.erreur ? <p className="message message-erreur mb-4" role="alert">{recherche.erreur}</p> : null}
      {ecran.invites ? (
        <p className="message mb-4">
          <span>
            La commande en invité est ouverte : le tunnel ne sait pas qui achète, aucun nouveau panier n&apos;est gardé.{" "}
            <Link href={`/gestion/${slug}/reglages/commandes`}>Réglages, Commandes</Link>
          </span>
        </p>
      ) : null}

      <section className="carte pm-synthese" aria-label="Les relances">
        <p className="pm-synthese-ligne">
          <span className="ligne-points">
            <span><b className="tabular-nums">{c.a_relancer}</b> à relancer</span>
            <span><b className="tabular-nums">{c.relances}</b> {c.relances > 1 ? "relancés" : "relancé"} ces 30 jours</span>
            <span><b className="tabular-nums">{c.commandes_apres_relance}</b> {c.commandes_apres_relance > 1 ? "ont commandé" : "a commandé"} ensuite</span>
            {c.en_cours ? <span><b className="tabular-nums">{c.en_cours}</b> en train de commander</span> : null}
          </span>
        </p>
      </section>

      <section aria-labelledby="t-a-relancer" className="pm-section">
        <h2 id="t-a-relancer" className="pm-titre">À relancer <span className="compte-onglet">{aRelancer.length}</span></h2>
        {aRelancer.length === 0 ? (
          <div className="vide cat-vide">
            <span className="vide-icone"><Icone nom="panier" taille={20} /></span>
            <strong>Aucun panier à relancer</strong>
            <p>Un panier laissé depuis plus d&apos;une heure, sans commande depuis, s&apos;affiche ici.</p>
          </div>
        ) : (
          <ul className="ra-liste" role="list">
            {aRelancer.map((p) => <CartePanier key={p.id} p={p} boutique={boutique.nom} vitrine={vitrine} slug={slug}
                                               maintenant={maintenant} relance={relance} action={action} />)}
          </ul>
        )}
      </section>

      {relances.length > 0 ? (
        <section aria-labelledby="t-relances" className="pm-section">
          <h2 id="t-relances" className="pm-titre">Relancés <span className="compte-onglet">{relances.length}</span></h2>
          <ul className="ra-liste" role="list">
            {relances.map((p) => <CartePanier key={p.id} p={p} boutique={boutique.nom} vitrine={vitrine} slug={slug}
                                              maintenant={maintenant} relance={relance} action={action} />)}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** Un panier : qui, ce qu'il contient, son montant, les gestes. */
function CartePanier({ p, boutique, vitrine, slug, maintenant, relance, action }: {
  p: PanierSuivi; boutique: string; vitrine: string | null; slug: string; maintenant: Date; relance: boolean; action: string;
}) {
  const aRelancer = p.etat === "a_relancer";
  const message = messageRelance(p, boutique, vitrine ? `${vitrine}/panier/${p.id}` : null);
  const ecrire = p.telephone
    ? `https://wa.me/${p.telephone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`
    : p.email ? `mailto:${p.email}?subject=${encodeURIComponent(`Votre panier chez ${boutique}`)}&body=${encodeURIComponent(message)}` : null;
  const contact = p.telephone ? telephoneLisible(p.telephone) : p.email;
  return (
    <li className="carte ra-piece pn-panier" id={`panier-${p.id}`} data-relance={aRelancer ? undefined : ""}>
      <div className="pn-tete">
        <span className="pn-qui">
          <b>{p.nom ?? contact}</b>
          {p.nom ? <span className="aide tabular-nums">{contact}</span> : null}
        </span>
        <span className="pn-montant">
          <b className="tabular-nums">{formateMontant(p.sous_total_millimes)} TND</b>
          <span className="aide">{p.articles > 1 ? `${p.articles} articles` : "1 article"}</span>
        </span>
      </div>
      <ul className="pn-lignes" role="list">
        {p.lignes.map((l) => (
          <li key={l.variante_id} className="pn-ligne" data-hors-vente={l.en_vente ? undefined : ""}>
            <span className="ra-photo pn-photo">
              {l.image ? <Image src={urlFichier(l.image)} alt="" fill sizes="40px" /> : <Icone nom="colis" taille={15} />}
            </span>
            <span className="pn-article">
              <span>{l.produit}{l.quantite > 1 ? <span className="tabular-nums"> × {l.quantite}</span> : null}</span>
              <span className="aide">{[l.libelle, l.en_vente ? null : "plus disponible"].filter(Boolean).join(" · ")}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="aide ra-quand">
        {aRelancer
          ? `Laissé ${age(p.depuis, maintenant)}`
          : `Relancé ${quand(p.relance_le!, maintenant)}${p.relance_par ? ` par ${p.relance_par}` : ""}`}
      </p>
      {!aRelancer ? (
        <p className={p.commande ? "pn-issue pn-issue-ok" : "pn-issue"}>
          {p.commande ? (
            <>A commandé ensuite : <Link href={`/gestion/${slug}/commandes/${p.commande}`}>{p.commande}</Link></>
          ) : "Pas de commande depuis la relance."}
        </p>
      ) : null}

      {aRelancer ? (
        <div className="pm-gestes">
          {ecrire ? (
            <a className="btn btn-second" href={ecrire} target="_blank" rel="noopener">
              <Icone nom={p.telephone ? "message" : "courriel"} /> {p.telephone ? "WhatsApp" : "E-mail"}
            </a>
          ) : null}
          {relance ? (
            <>
              <form action={action} method="post">
                <input type="hidden" name="geste" value="relance" />
                <input type="hidden" name="panier" value={p.id} />
                <button className="btn btn-primaire" title="Le message est parti : ce panier passe dans « Relancés », il ne sera pas relancé deux fois"><Icone nom="coche" taille={14} /> Marquer relancé</button>
              </form>
              <form action={action} method="post">
                <input type="hidden" name="geste" value="ignore" />
                <input type="hidden" name="panier" value={p.id} />
                <button className="btn btn-second">Ignorer</button>
              </form>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
