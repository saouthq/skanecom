import type { Metadata } from "next";
import Link from "next/link";
import { Prix } from "@/components/Prix";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone, type NomIcone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";

export const metadata: Metadata = { title: "Aujourd'hui" };

/* ============================================================================
   « AUJOURD'HUI » — le matin, ce qui attend l'équipe : les commandes à
   appeler (et à rappeler), à préparer, en route depuis trop longtemps, les
   retraits prêts ; ce que les modules demandent ; les pièces à réassortir.
   Chaque carte mène à sa liste. Ce qui attend un geste vient d'abord ; ce
   qui est à jour se range en dessous, discret. La journée en chiffres, pour
   la direction (public.gestion_aujourdhui).
   ========================================================================== */

type Etat = {
  jour: string;
  direction: boolean;
  commandes: {
    a_confirmer: number; a_rappeler: number; attente_depuis: string | null;
    a_preparer: number; en_livraison: number; en_retard: number; retraits_prets: number;
  };
  journee: { recues: number; livrees: number; refusees: number; recues_millimes: number | null; livrees_millimes: number | null };
  modules: { sav: number | null; devis: number | null; avis: number | null; comptes_pro: number | null };
  stock: {
    ruptures: number;
    bas: number;
    pieces: { produit_id: string; produit: string; declinaison: string | null; sku: string; stock: number; seuil: number }[];
  };
};

type Tache = { cle: string; nombre: number; titre: string; detail: string; href: string; icone: NomIcone; action?: { href: string; libelle: string } };

const JOUR = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Tunis" });

/** « 35 min », « 2 h », « 3 jours » : depuis quand la plus ancienne attend. */
function depuis(iso: string, maintenant: Date): string {
  const minutes = Math.max(1, Math.round((maintenant.getTime() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes}\u00a0min`;
  const heures = Math.round(minutes / 60);
  if (heures < 48) return `${heures}\u00a0h`;
  return `${Math.round(heures / 24)}\u00a0jours`;
}

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const majuscule = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

export default async function Aujourdhui({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_aujourdhui", { p_boutique_id: boutique.boutique_id });
  if (error) throw new Error(`Aujourd'hui illisible : ${error.message}`);
  const e = data as Etat;
  const base = `/gestion/${slug}`;
  const maintenant = new Date();
  const c = e.commandes;

  const taches: Tache[] = [
    {
      cle: "a_confirmer", nombre: c.a_confirmer, icone: "telephone", href: `${base}?etape=a_confirmer`,
      titre: c.a_confirmer > 1 ? "Commandes à confirmer" : "Commande à confirmer",
      detail: c.a_confirmer
        ? [c.a_rappeler ? `dont ${c.a_rappeler} à rappeler` : null, c.attente_depuis ? `la plus ancienne attend depuis ${depuis(c.attente_depuis, maintenant)}` : null]
            .filter(Boolean).join(" · ")
        : "Tous les appels sont faits.",
    },
    {
      cle: "a_preparer", nombre: c.a_preparer, icone: "colis", href: `${base}?etape=a_preparer`,
      titre: "Colis à préparer",
      detail: c.a_preparer ? "Confirmés par le client : à emballer et à remettre au transporteur." : "Rien en attente de préparation.",
      action: c.a_preparer ? { href: `${base}/bordereaux?etape=a_preparer`, libelle: "Imprimer les bordereaux" } : undefined,
    },
    {
      cle: "en_livraison", nombre: c.en_livraison, icone: "camion", href: `${base}?etape=expediees`,
      titre: "En route chez le client",
      detail: c.en_retard
        ? `${pluriel(c.en_retard, "colis", "colis")} depuis plus de 5 jours : un appel au transporteur.`
        : c.en_livraison ? "Rien d'anormal sur la route." : "Aucun colis en route.",
    },
    ...(c.retraits_prets
      ? [{ cle: "retraits", nombre: c.retraits_prets, icone: "boutique" as const, href: `${base}?etape=expediees`,
          titre: "Prêtes au comptoir", detail: "Le client vient la retirer : la commande l'attend au magasin." }]
      : []),
    ...(e.modules.sav !== null
      ? [{ cle: "sav", nombre: e.modules.sav, icone: "outil" as const, href: `${base}/sav`,
          titre: "Demandes de SAV", detail: e.modules.sav ? "Nouvelles : le client attend votre appel." : "Aucune nouvelle demande." }]
      : []),
    ...(e.modules.devis !== null
      ? [{ cle: "devis", nombre: e.modules.devis, icone: "fichier" as const, href: `${base}/devis`,
          titre: "Devis à chiffrer", detail: e.modules.devis ? "Des listes de chantier attendent vos prix." : "Aucune demande de devis en attente." }]
      : []),
    ...(e.modules.avis !== null
      ? [{ cle: "avis", nombre: e.modules.avis, icone: "etoile" as const, href: `${base}/avis`,
          titre: "Avis à relire", detail: e.modules.avis ? "Relisez-les avant qu'ils paraissent sur la vitrine." : "Aucun avis à relire." }]
      : []),
    ...(e.modules.comptes_pro !== null
      ? [{ cle: "pros", nombre: e.modules.comptes_pro, icone: "personne" as const, href: `${base}/clients/pros`,
          titre: "Comptes pro à valider", detail: e.modules.comptes_pro ? "Des professionnels demandent leurs prix." : "Aucune demande de compte pro." }]
      : []),
  ];
  const aFaire = taches.filter((x) => x.nombre > 0);
  const aJour = taches.filter((x) => x.nombre === 0);
  const stockAlerte = e.stock.ruptures + e.stock.bas;
  const total = aFaire.reduce((n, x) => n + x.nombre, 0);

  return (
    <>
      <EnTetePage
        titre="Aujourd'hui"
        description={
          <>
            <span className="jd-jour">{majuscule(JOUR.format(new Date(`${e.jour}T12:00:00`)))}</span>
            {" · "}
            {total
              ? `${pluriel(total, "chose attend", "choses attendent")} un geste de l'équipe.`
              : "Tout est à jour : rien n'attend."}
          </>
        }
      />

      {aFaire.length ? (
        <section aria-labelledby="jd-a-faire">
          <h2 id="jd-a-faire" className="jd-titre">À faire</h2>
          <ul className="jd-grille" role="list">
            {aFaire.map((x, i) => <Carte key={x.cle} tache={x} rang={i} />)}
          </ul>
        </section>
      ) : (
        <div className="carte jd-calme">
          <span className="jd-calme-icone"><Icone nom="succes" taille={22} /></span>
          <div>
            <strong>Tout est à jour</strong>
            <p className="aide">Aucune commande n&apos;attend d&apos;appel ni de préparation. Les nouvelles s&apos;afficheront ici, et dans la pastille « Commandes ».</p>
          </div>
        </div>
      )}

      {stockAlerte ? (
        <section className="carte jd-stock" aria-labelledby="jd-stock">
          <div className="jd-stock-tete">
            <h2 id="jd-stock" className="carte-titre-icone"><Icone nom="alerte" /> Stock à réassortir</h2>
            <span className="aide">
              {[e.stock.ruptures ? pluriel(e.stock.ruptures, "déclinaison épuisée", "déclinaisons épuisées") : null,
                e.stock.bas ? `${e.stock.bas} sous le seuil d'alerte` : null].filter(Boolean).join(" · ")}
            </span>
          </div>
          <ul className="jd-pieces" role="list">
            {e.stock.pieces.map((p) => (
              <li key={p.sku}>
                <Link href={`${base}/produits/${p.produit_id}`} className="jd-piece">
                  <span className="jd-piece-nom">
                    <b>{p.produit}</b>
                    <span className="discret">{[p.declinaison, p.sku].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className={p.stock <= 0 ? "ui-etat ui-etat-rouge" : "ui-etat ui-etat-ambre"}>
                    {p.stock <= 0 ? "Épuisé" : `${p.stock} en stock`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link className="btn btn-second btn-petit" href={`${base}/produits/reception`}>
            <Icone nom="colis" taille={14} /> Enregistrer un arrivage
          </Link>
        </section>
      ) : null}

      {e.direction ? (
        <section className="carte jd-journee" aria-labelledby="jd-journee">
          <h2 id="jd-journee" className="carte-titre-icone"><Icone nom="graphique" /> La journée</h2>
          <dl className="jd-chiffres">
            <div>
              <dt>Reçues</dt>
              <dd>{e.journee.recues}</dd>
              {e.journee.recues_millimes !== null ? <dd className="aide"><Prix millimes={e.journee.recues_millimes} /></dd> : null}
            </div>
            <div>
              <dt>Livrées</dt>
              <dd>{e.journee.livrees}</dd>
              {e.journee.livrees_millimes !== null ? <dd className="aide"><Prix millimes={e.journee.livrees_millimes} /> encaissés</dd> : null}
            </div>
            <div>
              <dt>Refusées</dt>
              <dd>{e.journee.refusees}</dd>
            </div>
          </dl>
          <Link className="btn-lien aide" href={`${base}/tableau`}>Le tableau de bord, sur 30 jours →</Link>
        </section>
      ) : null}

      {aJour.length ? (
        <section aria-labelledby="jd-a-jour">
          <h2 id="jd-a-jour" className="jd-titre jd-titre-discret">À jour</h2>
          <ul className="jd-grille jd-grille-calme" role="list">
            {aJour.map((x, i) => <Carte key={x.cle} tache={x} rang={i} />)}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function Carte({ tache, rang }: { tache: Tache; rang: number }) {
  return (
    <li className="jd-carte" data-a-faire={tache.nombre > 0 ? "" : undefined} style={{ "--i": rang } as React.CSSProperties}>
      <Link href={tache.href} className="jd-carte-lien">
        <span className="jd-carte-icone"><Icone nom={tache.icone} taille={18} /></span>
        <span className="jd-carte-nombre">{tache.nombre}</span>
        <span className="jd-carte-titre">{tache.titre}</span>
        <span className="jd-carte-detail">{tache.detail}</span>
        <span className="jd-carte-fleche" aria-hidden="true"><Icone nom="droite" taille={16} /></span>
      </Link>
      {tache.action ? (
        <Link href={tache.action.href} className="jd-carte-action">{tache.action.libelle}</Link>
      ) : null}
    </li>
  );
}
