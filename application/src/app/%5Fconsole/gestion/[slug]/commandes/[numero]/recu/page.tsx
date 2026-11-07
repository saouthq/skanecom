import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prix } from "@/components/Prix";
import { BoutonImprimer } from "@/components/console/BoutonImprimer";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { lieu, type Magasin } from "@/lib/commande";
import { telephoneLisible } from "@/lib/gestion/libelles";
import { urlFichier } from "@/lib/photos";

/* ============================================================================
   LE REÇU D'UNE COMMANDE — à remettre au client : au comptoir surtout (il
   repart avec ses articles et un papier), mais aussi glissé dans un colis
   ou tendu au retrait. Qui vend (le logo, la raison sociale, l'adresse, le
   matricule fiscal s'ils sont renseignés), à qui, quoi, à quel prix, et ce
   qui est payé ou reste à payer.

   Ce n'est pas une facture (SkanFact les émet) : le reçu le dit. Format A5,
   fluide : sur une feuille A4 il se découpe, sur un rouleau de 80 mm il
   prend la largeur. Une commande annulée ou refusée n'en a pas.
   ========================================================================== */

type Fiche = {
  numero: string;
  statut: string;
  sur_place: boolean;
  cree_le: string;
  livree_le: string | null;
  mode_paiement: string;
  statut_paiement: string;
  mode_livraison: "domicile" | "retrait";
  retrait: Magasin | null;
  contact: { nom: string; telephone: string };
  livraison: { ligne1: string | null; ville: string | null; gouvernorat: string | null };
  sous_total_millimes: number;
  frais_livraison_millimes: number;
  remise_millimes: number;
  code_promo: string | null;
  total_millimes: number;
  lignes: {
    produit_nom: string;
    variante_libelle: string | null;
    sku: string | null;
    quantite: number;
    prix_unitaire_millimes: number;
    total_ligne_millimes: number;
    lot: string | null;
    remise_lot_millimes: number;
  }[];
};

type Facturation = { raison_sociale: string; matricule_fiscal: string; adresse: { ligne1: string; ville: string; code_postal: string | null } | null };

const DATE_HEURE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" });
const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Tunis" });

/** Le prix de l'article : celui du pack est fondu dans la ligne, le reçu le rend et montre le pack en remise. */
function unitaire(l: Fiche["lignes"][number]): number {
  return Math.round((l.total_ligne_millimes + l.remise_lot_millimes) / Math.max(1, l.quantite));
}

const IDENTITE = ["legal.raison_sociale", "legal.adresse", "legal.matricule_fiscal", "contact.telephone", "legal.email"];

export async function generateMetadata({ params }: { params: Promise<{ numero: string }> }): Promise<Metadata> {
  return { title: `Reçu ${(await params).numero}` };
}

export default async function Recu({ params }: { params: Promise<{ slug: string; numero: string }> }) {
  const { slug, numero } = await params;
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const [{ data, error }, { data: reglages }, { data: theme }, { data: fa }] = await Promise.all([
    sb.rpc("gestion_commande", { p_boutique_id: boutique.boutique_id, p_numero: numero }),
    sb.from("reglages").select("cle, valeur").eq("boutique_id", boutique.boutique_id).in("cle", IDENTITE),
    sb.from("themes").select("logo_chemin, logo_ratio, logo_mode").eq("boutique_id", boutique.boutique_id).maybeSingle(),
    sb.rpc("gestion_facturation", { p_boutique_id: boutique.boutique_id, p_numero: numero }),
  ]);
  if (error) throw new Error(`Commande illisible : ${error.message}`);
  if (!data) notFound();
  const f = data as Fiche;
  const fiche = `/gestion/${slug}/commandes/${f.numero}`;
  const r = new Map((reglages ?? []).map((x) => [x.cle as string, typeof x.valeur === "string" ? x.valeur.trim() : ""]));
  const societe = (fa as { facturation: Facturation | null } | null)?.facturation ?? null;
  // Un SVG n'a souvent pas de taille propre : le rapport largeur/hauteur du thème la donne (comme à la vitrine).
  const ratio = Number(theme?.logo_ratio);
  const logo = typeof theme?.logo_chemin === "string" && theme.logo_chemin
    ? { src: urlFichier(theme.logo_chemin), image: theme.logo_mode === "image", ratio: Number.isFinite(ratio) && ratio >= 0.2 && ratio <= 20 ? ratio : 5 }
    : null;

  if (f.statut === "annulee" || f.statut === "refusee") {
    return (
      <EnTetePage
        avant={<Link href={fiche}><Icone nom="retour" taille={14} /> {f.numero}</Link>}
        titre="Pas de reçu"
        description={f.statut === "annulee" ? "La commande est annulée : rien à remettre au client." : "La commande n'a pas été remise : rien à remettre au client."}
      />
    );
  }

  const retrait = f.mode_livraison === "retrait";
  const remiseLots = f.lignes.reduce((s, l) => s + l.remise_lot_millimes, 0);
  const paye = f.sur_place || f.statut_paiement === "paye";
  const payeLe = f.livree_le ?? f.cree_le;
  const raison = r.get("legal.raison_sociale");
  const adresse = r.get("legal.adresse") || (f.retrait ? `${f.retrait.adresse}, ${f.retrait.ville}` : "");

  return (
    <>
      <div className="rcu-ecran">
        <EnTetePage
          avant={<Link href={fiche}><Icone nom="retour" taille={14} /> {f.numero}</Link>}
          titre="Reçu"
          description="À remettre au client. Dans la boîte d'impression, « Enregistrer en PDF » en fait un fichier à lui envoyer."
          actions={<BoutonImprimer libelle="Imprimer le reçu" />}
        />
      </div>

      <article className="rcu" aria-label={`Reçu de la commande ${f.numero}`}>
        <header className="rcu-tete">
          <div className="rcu-vendeur">
            {logo ? (
              // Le logo tel que la vitrine le montre ; monochrome, il s'imprime en noir.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo.src} alt={boutique.nom} className={logo.image ? "rcu-logo" : "rcu-logo rcu-logo-mono"}
                   style={{ aspectRatio: String(logo.ratio), inlineSize: `min(42mm, ${(12 * logo.ratio).toFixed(1)}mm)` }} />
            ) : (
              <p className="rcu-nom">{boutique.nom}</p>
            )}
            {raison && raison !== boutique.nom ? <p>{raison}</p> : null}
            {adresse ? <p>{adresse}</p> : null}
            {r.get("contact.telephone") ? <p>{telephoneLisible(r.get("contact.telephone")!)}</p> : null}
            {r.get("legal.matricule_fiscal") ? <p>Matricule fiscal : {r.get("legal.matricule_fiscal")}</p> : null}
          </div>
          <div className="rcu-ref">
            <p className="rcu-titre">Reçu</p>
            <p className="rcu-num">{f.numero}</p>
            <p>{DATE_HEURE.format(new Date(f.cree_le))}</p>
          </div>
        </header>

        <section className="rcu-client" aria-label="Client">
          <p><span className="rcu-etiquette">Client</span> {f.contact.nom} · {telephoneLisible(f.contact.telephone)}</p>
          {societe ? (
            <p><span className="rcu-etiquette">Société</span> {societe.raison_sociale} · MF {societe.matricule_fiscal}</p>
          ) : null}
        </section>

        <table className="rcu-lignes">
          <thead>
            <tr><th scope="col">Article</th><th scope="col">Qté</th><th scope="col">Prix</th><th scope="col">Total</th></tr>
          </thead>
          <tbody>
            {f.lignes.map((l, i) => (
              <tr key={i}>
                <td>
                  {l.produit_nom}
                  {l.variante_libelle || l.sku ? (
                    <span className="rcu-detail">
                      {l.variante_libelle}{l.variante_libelle && l.sku ? " · " : ""}{l.sku ? <span className="rcu-sku">{l.sku}</span> : null}
                    </span>
                  ) : null}
                  {l.lot && l.remise_lot_millimes > 0 ? <span className="rcu-detail">Pack {l.lot}</span> : null}
                  {/* Étroit (téléphone, rouleau de 80 mm) : la colonne Prix se replie ici. */}
                  {l.quantite > 1 ? <span className="rcu-detail rcu-pu">{l.quantite} × <Prix millimes={unitaire(l)} /></span> : null}
                </td>
                <td>{l.quantite}</td>
                <td><Prix millimes={unitaire(l)} /></td>
                <td><Prix millimes={l.total_ligne_millimes + l.remise_lot_millimes} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="rcu-totaux">
          {f.sous_total_millimes !== f.total_millimes || remiseLots > 0 ? (
            <div><dt>Sous-total</dt><dd><Prix millimes={f.sous_total_millimes + remiseLots} /></dd></div>
          ) : null}
          {remiseLots > 0 ? <div><dt>Packs</dt><dd><Prix millimes={-remiseLots} /></dd></div> : null}
          {f.remise_millimes > 0 ? (
            <div><dt>{f.code_promo ? `Code ${f.code_promo}` : "Remise"}</dt><dd><Prix millimes={-f.remise_millimes} /></dd></div>
          ) : null}
          {f.sur_place ? null : retrait ? (
            <div><dt>Retrait en magasin</dt><dd>Gratuit</dd></div>
          ) : (
            <div><dt>Livraison{f.livraison.ville ? ` · ${lieu(f.livraison.ville, f.livraison.gouvernorat)}` : ""}</dt><dd>{f.frais_livraison_millimes > 0 ? <Prix millimes={f.frais_livraison_millimes} /> : "Offerte"}</dd></div>
          )}
          <div className="rcu-total"><dt>Total TTC</dt><dd><Prix millimes={f.total_millimes} /></dd></div>
        </dl>

        <p className={paye ? "rcu-paiement rcu-paye" : "rcu-paiement"}>
          {f.sur_place
            ? `Payé au comptoir le ${DATE.format(new Date(payeLe))}.`
            : paye
              ? "Payé en ligne."
              : retrait ? "À payer au retrait, au comptoir." : "À payer à la livraison, en espèces."}
        </p>

        <footer className="rcu-pied">
          <p>Merci{f.sur_place ? " de votre visite" : " pour votre commande"}.</p>
          <p>Ce reçu ne vaut pas facture.</p>
        </footer>
      </article>
    </>
  );
}
