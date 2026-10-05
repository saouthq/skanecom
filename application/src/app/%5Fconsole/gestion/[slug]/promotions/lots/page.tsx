import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { FormLot } from "@/components/console/FormLot";
import { OngletsPromotions } from "@/components/console/OngletsPromotions";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { formateMontant } from "@/lib/prix";
import { urlFichier } from "@/lib/photos";
import { PEUT_PROMOUVOIR } from "@/lib/gestion/promotions";
import { pourcentage, valeurDu, type EcranLots, type LotGestion } from "@/lib/gestion/lots";

export const metadata: Metadata = { title: "Lots" };

/* ============================================================================
   LES LOTS (module promotions) — « la chemise et les mocassins, 359 TND au
   lieu de 408 » : deux à quatre produits vendus ensemble à un prix. La
   vitrine les propose sur la fiche de chacun, le panier les applique dès
   qu'il les réunit, la commande les garde. Chaque lot dit ce qu'il vaut
   acheté pièce à pièce, ce qu'il fait économiser et ce qu'il a vendu. On en
   compose, on les change, on les coupe, on les retire (les commandes
   gardent leur nom). Propriétaire et administrateur ; la lecture regarde.
   ========================================================================== */
export default async function Lots({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const [{ slug }, recherche] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_lots", { p_boutique_id: boutique.boutique_id });
  if (error) throw new Error(`Lots illisibles : ${error.message}`);
  const ecran = data as EcranLots;
  if (!ecran.actif && ecran.lots.length === 0) notFound();

  const action = `/gestion/${slug}/promotions/lots/action`;
  const regle = PEUT_PROMOUVOIR.includes(boutique.role) && ecran.actif;
  const enVente = ecran.lots.filter((l) => l.actif);
  const coupes = ecran.lots.filter((l) => !l.actif);
  const commun = { regle, action, produits: ecran.produits };

  return (
    <>
      <EnTetePage
        titre="Promotions"
        description={
          ecran.actif
            ? "Des produits vendus ensemble à un prix : la tenue complète, le coffret, la paire de valises. La fiche de chacun propose le lot, le panier l'applique dès qu'il réunit les pièces, le client choisit sa taille."
            : "Le module est coupé : aucun lot ne s'applique plus. Ils restent ici, avec ce qu'ils ont vendu."
        }
        actions={regle ? <a className="btn btn-primaire" href="#nouveau"><Icone nom="etiquette" /> Nouveau lot</a> : undefined}
      />
      <OngletsPromotions slug={slug} courant="lots" />

      {recherche.ok ? <p className="message message-succes mb-4" role="status">{recherche.ok}</p> : null}
      {recherche.erreur ? <p className="message message-erreur mb-4" role="alert">{recherche.erreur}</p> : null}

      <section aria-labelledby="t-en-vente" className="pm-section">
        <h2 id="t-en-vente" className="pm-titre">En vente <span className="compte-onglet">{enVente.length}</span></h2>
        {enVente.length === 0 ? (
          <div className="vide cat-vide">
            <span className="vide-icone"><Icone nom="etiquette" taille={20} /></span>
            <strong>Aucun lot en vente</strong>
            <p>{regle ? "Composez-en un ci-dessous : il paraît sur la vitrine d'ici cinq minutes, le panier l'applique aussitôt." : "La direction de la boutique les compose."}</p>
          </div>
        ) : (
          <ul className="pm-liste" role="list">
            {enVente.map((l) => <CarteLot key={l.id} lot={l} {...commun} />)}
          </ul>
        )}
      </section>

      {regle ? (
        <section id="nouveau" className="carte pm-nouveau" aria-labelledby="t-nouveau">
          <div className="carte-tete">
            <div>
              <h2 id="t-nouveau" className="carte-titre-icone"><Icone nom="etiquette" /> Nouveau lot</h2>
              <p>Le panier prend, pour chaque produit, la taille ou la couleur la moins chère qu&apos;il contient. Le lot ne se cumule pas avec un prix par quantité, ni avec un devis ; un code promo s&apos;applique ensuite.</p>
            </div>
          </div>
          <FormLot action={action} produits={ecran.produits} suffixe="nouveau" />
        </section>
      ) : null}

      {coupes.length > 0 ? (
        <section aria-labelledby="t-coupes" className="pm-section">
          <h2 id="t-coupes" className="pm-titre">Coupés <span className="compte-onglet">{coupes.length}</span></h2>
          <ul className="pm-liste" role="list">
            {coupes.map((l) => <CarteLot key={l.id} lot={l} {...commun} />)}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** Un lot : ses pièces, son prix face à leur valeur, ce qu'il a vendu, ses gestes. */
function CarteLot({ lot, regle, action, produits }: {
  lot: LotGestion; regle: boolean; action: string; produits: EcranLots["produits"];
}) {
  const valeur = valeurDu(lot);
  const incomplet = valeur === null || lot.produits.length < 2;
  return (
    <li className="carte pm-carte lot-carte-bo" data-etat={lot.actif ? "actif" : "coupe"} id={`lot-${lot.id}`}>
      <div className="pm-tete">
        <h3 className="lot-nom">{lot.nom}</h3>
        <span className={lot.actif ? "ui-etat ui-etat-point ui-etat-vert" : "ui-etat"}>{lot.actif ? "En vente" : "Coupé"}</span>
      </div>
      <ul className="lot-vignettes" role="list" aria-label="Ses produits">
        {lot.produits.map((p) => (
          <li key={p.id} className="lot-vignette" data-hors-vente={p.publie && p.prix_min_millimes !== null ? undefined : ""}>
            <span className="lot-vignette-photo">
              {p.image ? <Image src={urlFichier(p.image)} alt="" fill sizes="56px" /> : <Icone nom="photo" taille={16} />}
            </span>
            <span className="lot-vignette-texte">
              <span className="lot-vignette-nom">{p.nom}</span>
              <span className="aide tabular-nums">{p.publie && p.prix_min_millimes !== null ? `${formateMontant(p.prix_min_millimes)} TND` : "plus en vente"}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="pm-offre">
        <span className="tabular-nums">{formateMontant(lot.prix_millimes)} TND</span>
        {valeur !== null && valeur > lot.prix_millimes ? (
          <span className="lot-valeur"> au lieu de <s className="tabular-nums">{formateMontant(valeur)}</s> <span className="lot-pourcent">{pourcentage(valeur, lot.prix_millimes)}</span></span>
        ) : null}
      </p>
      {lot.accroche ? <p className="pm-conditions">« {lot.accroche} »</p> : null}
      {incomplet ? (
        <p className="message message-alerte lot-alerte">
          Un produit du lot n&apos;est plus en vente : le panier ne l&apos;applique plus. Changez ses produits, ou coupez-le.
        </p>
      ) : valeur !== null && valeur <= lot.prix_millimes ? (
        <p className="message message-alerte lot-alerte">
          Les prix ont baissé : ses produits coûtent maintenant moins que le lot, le panier ne l&apos;applique plus. Baissez son prix.
        </p>
      ) : null}

      <div className="pm-chiffres">
        {lot.commandes > 0 ? (
          <p>
            <span className="ligne-points">
              <span><b className="tabular-nums">{lot.commandes}</b> commande{lot.commandes > 1 ? "s" : ""}</span>
              <span><b className="tabular-nums">{formateMontant(lot.remises_millimes)}</b> TND offerts aux clients</span>
            </span>
          </p>
        ) : (
          <p className="discret">Pas encore vendu.</p>
        )}
      </div>

      {regle ? (
        <div className="pm-gestes">
          <details className="pm-pli">
            <summary className="btn btn-second">Changer</summary>
            <FormLot action={action} produits={produits} lot={lot} suffixe={lot.id} />
          </details>
          <form action={action} method="post">
            <input type="hidden" name="geste" value={lot.actif ? "couper" : "rallumer"} />
            <input type="hidden" name="lot_id" value={lot.id} />
            <button className="btn btn-second">{lot.actif ? "Couper" : "Remettre en vente"}</button>
          </form>
          <form action={action} method="post">
            <input type="hidden" name="geste" value="retirer" />
            <input type="hidden" name="lot_id" value={lot.id} />
            <button className="btn btn-danger"><Icone nom="corbeille" taille={14} /> Retirer</button>
          </form>
        </div>
      ) : null}
    </li>
  );
}
