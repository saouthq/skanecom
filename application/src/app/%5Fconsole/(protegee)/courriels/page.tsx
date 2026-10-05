import type { Metadata } from "next";
import Link from "next/link";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { cadre as chargeCadre } from "@/lib/boutique";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { courrielChangementEmail, courrielCode, courrielInvitation, courrielLettre, courrielLettreDeja, courrielMotDePasse, marqueDeBoutique, MARQUE_PLATEFORME } from "@/lib/courriels/messages";
import type { Courriel } from "@/lib/courriels/modele";
import { courrielCommande, type CourrielDu } from "@/lib/courriels/commandes";

export const metadata: Metadata = { title: "E-mails" };

/* ============================================================================
   LES E-MAILS — ce que reçoivent l'acheteur et l'équipe, tels qu'ils
   partent : aux couleurs de la boutique choisie, sur ordinateur ou sur
   téléphone, avec leur version texte. Des exemples (codes et liens fictifs) :
   rien n'est envoyé d'ici. Une liste à gauche, un seul aperçu à droite :
   avant, les six aperçus s'empilaient sur 5 600 px.
   ========================================================================== */

type Boutique = { slug: string; nom: string; statut: string; hote_principal: string | null };

export default async function Courriels({ searchParams }: { searchParams: Promise<{ boutique?: string; vue?: string; courriel?: string }> }) {
  await exigeAdmin();
  const p = await searchParams;
  const { data } = await clientService().rpc("console_boutiques");
  // (une boutique fermée n'envoie plus rien)
  const boutiques = ((data ?? []) as Boutique[]).filter((b) => b.slug && b.statut !== "fermee");
  const choisie = boutiques.find((b) => b.slug === p.boutique) ?? boutiques[0];
  const telephone = p.vue === "telephone";

  const exemples: { cle: string; nom: string; groupe: string; pour: string; courriel: Courriel }[] = [];
  if (choisie) {
    const cadre = await chargeCadre(choisie.slug);
    const marque = marqueDeBoutique(cadre, choisie.hote_principal ? `https://${choisie.hote_principal}` : null);
    const console = "https://app.skanecom.tn";
    exemples.push(
      { cle: "code", groupe: "L'acheteur", nom: "Code de connexion", pour: "Pour se connecter, au nom de la boutique", courriel: courrielCode(marque, "482913") },
      { cle: "adresse", groupe: "L'acheteur", nom: "Nouvelle adresse e-mail", pour: "Quand il change d'adresse dans son compte", courriel: courrielChangementEmail(marque, "705362") },
      { cle: "lettre", groupe: "La lettre", nom: "Confirmer l'inscription", pour: "Qui s'inscrit, pour confirmer son adresse", courriel: courrielLettre(marque, `${marque.site ?? "https://boutique.tn"}/lettre?j=exemple`) },
      { cle: "lettre-deja", groupe: "La lettre", nom: "Déjà inscrit", pour: "Qui s'inscrit une deuxième fois", courriel: courrielLettreDeja(marque) },
      ...commandes(choisie, marque, console),
      { cle: "invitation", groupe: "L'équipe", nom: "Invitation", pour: "Invitée depuis la console, au nom de SkanEcom", courriel: courrielInvitation(MARQUE_PLATEFORME, `${console}/bienvenue?jeton=exemple&type=invite`) },
      { cle: "mot-de-passe", groupe: "L'équipe", nom: "Mot de passe oublié", pour: "Au nom de SkanEcom, quelle que soit la boutique", courriel: courrielMotDePasse(MARQUE_PLATEFORME, `${console}/bienvenue?jeton=exemple&type=recovery`) },
    );
  }
  const vu = exemples.find((x) => x.cle === p.courriel) ?? exemples[0];
  // Changer de boutique ou d'écran garde l'e-mail ouvert.
  const lien = (valeurs: { boutique?: string; vue?: string; courriel?: string }) => {
    const courriel = valeurs.courriel ?? vu?.cle;
    return `/courriels?${new URLSearchParams({
      boutique: valeurs.boutique ?? choisie?.slug ?? "",
      ...(valeurs.vue ? { vue: valeurs.vue } : {}),
      ...(courriel && courriel !== exemples[0]?.cle ? { courriel } : {}),
    })}`;
  };
  const groupes = [...new Set(exemples.map((x) => x.groupe))];
  const plateforme = vu?.cle === "invitation" || vu?.cle === "mot-de-passe";

  return (
    <>
      <EnTetePage
        titre="E-mails"
        description="Ce que reçoivent l'acheteur et l'équipe, tels qu'ils partent. Des exemples : rien n'est envoyé d'ici."
      />
      <div className="crl-barre">
        {/* Une liste, pas une rangée d'onglets : elle tient à trente boutiques comme à trois. */}
        <form action="/courriels" method="get" className="crl-boutique">
          <label htmlFor="crl-boutique">Aux couleurs de</label>
          <select id="crl-boutique" name="boutique" className="entree" defaultValue={choisie?.slug} data-envoi-auto>
            {boutiques.map((b) => <option key={b.slug} value={b.slug}>{b.nom}</option>)}
          </select>
          {p.vue ? <input type="hidden" name="vue" value={p.vue} /> : null}
          {vu && vu.cle !== exemples[0]?.cle ? <input type="hidden" name="courriel" value={vu.cle} /> : null}
          <noscript><button type="submit" className="btn btn-second btn-petit">Voir</button></noscript>
        </form>
        <nav className="segments" aria-label="Écran">
          <Link href={lien({})} scroll={false} className={telephone ? "crl-segment" : "crl-segment crl-segment-actif"} aria-current={telephone ? undefined : "page"}>
            <Icone nom="apercu" taille={14} /> Ordinateur
          </Link>
          <Link href={lien({ vue: "telephone" })} scroll={false} className={telephone ? "crl-segment crl-segment-actif" : "crl-segment"} aria-current={telephone ? "page" : undefined}>
            <Icone nom="mobile" taille={14} /> Téléphone
          </Link>
        </nav>
      </div>

      <div className="crl-cadre-page">
        <nav className="carte crl-liste" aria-label="E-mails">
          {groupes.map((g) => (
            <div key={g} className="crl-groupe">
              <p className="crl-groupe-titre">{g}</p>
              <ul role="list">
                {exemples.filter((x) => x.groupe === g).map((x) => (
                  <li key={x.cle}>
                    <Link href={lien({ vue: p.vue, courriel: x.cle })} scroll={false} className="crl-lien"
                          aria-current={x.cle === vu?.cle ? "page" : undefined}>
                      <span className="crl-lien-nom">{x.nom}</span>
                      <span className="crl-lien-pour">{x.pour}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {vu ? (
          <section className={telephone ? "carte crl-carte crl-carte-telephone" : "carte crl-carte"} aria-label={vu.courriel.sujet}>
            <div className="crl-boite">
              <span className="crl-de">{plateforme ? MARQUE_PLATEFORME.nom : choisie?.nom}</span>
              <span className="crl-sujet">{vu.courriel.sujet}</span>
            </div>
            {plateforme ? <p className="aide crl-pour">Envoyé au nom de {MARQUE_PLATEFORME.nom} : le même pour toutes les boutiques.</p> : null}
            <iframe key={`${vu.cle}-${choisie?.slug}`} className="crl-cadre" title={vu.courriel.sujet} srcDoc={vu.courriel.html} sandbox="" />
            <details className="crl-texte">
              <summary>Version texte</summary>
              <pre>{vu.courriel.texte}</pre>
            </details>
          </section>
        ) : null}
      </div>
    </>
  );
}

/** Les e-mails de commande (réglage de la boutique), sur une commande d'exemple. */
function commandes(b: Boutique, marque: ReturnType<typeof marqueDeBoutique>, console: string) {
  const liens = { site: marque.site, console };
  const exemple = (evenement: CourrielDu["evenement"]): CourrielDu => ({
    id: 0, evenement, a: [],
    boutique: { id: "", slug: b.slug, nom: b.nom },
    commande: {
      numero: "CMD-2026-00042", statut: evenement, origine: "vitrine", mode_paiement: "cod", mode_livraison: "domicile",
      contact_nom: "Amel B.", contact_telephone: "+21620123456",
      livraison: { ligne1: "12 rue de Marseille", ligne2: null, ville: "Tunis", gouvernorat: "Tunis", code_postal: "1000" },
      sous_total_millimes: 267000, frais_livraison_millimes: 7000, remise_millimes: 0, total_millimes: 274000,
      code_promo: null, transporteur: "Aramex", numero_suivi: "AR-58201", motif_annulation: null, cree_le: new Date().toISOString(),
    },
    lignes: [
      { nom: "Un article du catalogue", detail: "Noir", quantite: 2, total_millimes: 178000, lot: null, precommande: false },
      { nom: "Un autre article", detail: null, quantite: 1, total_millimes: 89000, lot: null, precommande: false },
    ],
  });
  return [
    { cle: "commande-recue", groupe: "La commande", nom: "Commande reçue", pour: "Au client, si la boutique l'a réglé (Réglages → Commandes)", courriel: courrielCommande(marque, exemple("recue"), liens) },
    { cle: "commande-expediee", groupe: "La commande", nom: "En route", pour: "Au client : le transporteur, le numéro de suivi", courriel: courrielCommande(marque, exemple("expediee"), liens) },
    { cle: "commande-livree", groupe: "La commande", nom: "Livrée", pour: "Au client, une fois la commande remise", courriel: courrielCommande(marque, exemple("livree"), liens) },
    { cle: "commande-equipe", groupe: "La commande", nom: "Nouvelle commande (équipe)", pour: "Au propriétaire et aux administrateurs, si la boutique l'a réglé", courriel: courrielCommande(marque, exemple("equipe"), liens) },
  ];
}
