import Link from "next/link";
import type { Cadre } from "@/lib/boutique";
import { formatePrix } from "@/lib/prix";
import { poidsLisible } from "@/lib/caracteristiques";
import { identiteLegale, moyensDeContact, numeroLisible, type IdentiteLegale } from "@/lib/legal";
import type { SectionLegale } from "./PageLegale";

/* ============================================================================
   LES TEXTES LÉGAUX D'UNE BOUTIQUE — composés à partir de ses réglages. Ce
   qu'une boutique n'a pas renseigné n'est pas inventé : la ligne manque, et
   le backoffice le signale (Réglages → Informations légales).

   Références : loi n° 2000-83 du 9 août 2000 relative aux échanges et au
   commerce électroniques (information de l'acheteur, rétractation) ; loi
   organique n° 2004-63 du 27 juillet 2004 portant sur la protection des
   données à caractère personnel.
   ========================================================================== */

function Editeur({ id }: { id: IdentiteLegale }) {
  const lignes: [string, string | null][] = [
    ["Raison sociale", id.raisonSociale ? `${id.raisonSociale}${id.forme ? `, ${id.forme}` : ""}` : null],
    ["Nom commercial", id.nom],
    ["Siège", id.adresse],
    ["Identifiant unique (RNE)", id.rne],
    ["Matricule fiscal", id.matriculeFiscal],
    ["Courriel", id.email],
    ["Téléphone", id.telephone ? numeroLisible(id.telephone) : null],
  ];
  return (
    <dl className="legal-fiche">
      {lignes.filter(([, v]) => v).map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

/* ---------------------------------------------------------------------- */

export function mentionsLegales(cadre: Cadre): { intro: React.ReactNode; sections: SectionLegale[] } {
  const id = identiteLegale(cadre);
  return {
    intro: <p>Qui édite ce site, qui l&apos;héberge, et comment joindre la boutique.</p>,
    sections: [
      { id: "editeur", titre: "Éditeur du site", corps: <Editeur id={id} /> },
      {
        id: "plateforme",
        titre: "Plateforme et hébergement",
        corps: (
          <>
            <p>
              La boutique est réalisée et exploitée techniquement sur la plateforme <b>SkanEcom</b>. Les pages sont servies
              par le réseau de Cloudflare ; les données des commandes et des comptes sont conservées dans une base de
              données Supabase située dans l&apos;Union européenne (région de Paris).
            </p>
            <p>SkanEcom agit pour le compte de la boutique, qui reste seule responsable de son catalogue, de ses prix et de ses ventes.</p>
          </>
        ),
      },
      {
        id: "propriete",
        titre: "Propriété intellectuelle",
        corps: (
          <p>
            Les textes, photos, logos et marques présentés sur ce site appartiennent à {id.raisonSociale ?? id.nom} ou à leurs
            titulaires respectifs. Toute reproduction sans autorisation est interdite.
          </p>
        ),
      },
      {
        id: "contact",
        titre: "Nous joindre",
        corps: <p>Pour toute question, joignez la boutique {moyensDeContact(id)}.</p>,
      },
    ],
  };
}

/* ---------------------------------------------------------------------- */

export function conditionsDeVente(cadre: Cadre): { intro: React.ReactNode; sections: SectionLegale[] } {
  const id = identiteLegale(cadre);
  const vendeur = id.raisonSociale ?? id.nom;
  const compte = cadre.reglages["compte.obligatoire"] !== false;
  const transporteur = typeof cadre.reglages["livraison.transporteur"] === "string" ? String(cadre.reglages["livraison.transporteur"]).trim() : "";
  const zones = cadre.zones.filter((z) => z.nom_fr || z.nom_ar);
  const jours = id.retractationJours;

  return {
    intro: (
      <p>
        Ces conditions régissent les ventes conclues sur ce site entre {vendeur} et toute personne qui y passe commande.
        L&apos;acheteur les accepte en cochant la case prévue avant de confirmer sa commande ; la version en vigueur ce
        jour-là est gardée avec la commande.
      </p>
    ),
    sections: [
      { id: "vendeur", titre: "Le vendeur", corps: <Editeur id={id} /> },
      {
        id: "produits",
        titre: "Produits et prix",
        corps: (
          <>
            <p>
              Les produits sont présentés avec leurs caractéristiques principales. Le stock affiché est celui de la boutique
              au moment de la visite ; une commande n&apos;est acceptée que si l&apos;article est disponible.
            </p>
            <p>
              Les prix sont indiqués en dinars tunisiens (TND), toutes taxes comprises. Les frais de livraison sont annoncés
              avant la confirmation de la commande, et ajoutés au total.
            </p>
          </>
        ),
      },
      {
        id: "commande",
        titre: "Passer commande",
        corps: (
          <>
            <ol className="legal-etapes">
              <li>L&apos;acheteur choisit ses articles et ouvre son panier.</li>
              <li>
                Il indique ses coordonnées et l&apos;adresse de livraison
                {compte ? " ; son numéro de téléphone est confirmé par un code reçu par SMS" : ""}.
              </li>
              <li>Il relit le récapitulatif : articles, frais de livraison, total à payer.</li>
              <li>Il accepte les présentes conditions et confirme la commande.</li>
            </ol>
            <p>
              La commande reçoit un numéro, affiché à l&apos;acheteur.
              {cadre.livraison.rappel
                ? " Avant de préparer le colis, la boutique appelle l'acheteur pour confirmer la commande ; une commande qui ne peut pas être confirmée peut être annulée."
                : " Elle est confirmée dès sa réception."}
            </p>
          </>
        ),
      },
      {
        id: "paiement",
        titre: "Paiement",
        corps: (
          <p>
            {cadre.livraison.cod
              ? "Le paiement se fait à la livraison, en espèces, à la remise du colis. Aucune carte bancaire n'est demandée en ligne."
              : "Le paiement se fait selon les moyens proposés au moment de la commande."}
            {cadre.konnectActif ? " Le paiement en ligne par carte bancaire ou e-dinar est également proposé (Konnect)." : ""}
          </p>
        ),
      },
      {
        id: "livraison",
        titre: "Livraison",
        corps: (
          <>
            <p>
              La boutique livre partout en Tunisie
              {transporteur ? `, par ${transporteur}` : ""}. Les délais annoncés sont indicatifs et comptés en jours ouvrés à
              partir de la confirmation de la commande.
            </p>
            {cadre.fraisMillimes !== null ? (
              <p>Les frais de livraison sont de {formatePrix(cadre.fraisMillimes)} par commande.</p>
            ) : zones.length ? (
              <table className="legal-table">
                <caption>Frais et délais de livraison, par zone</caption>
                <thead><tr><th scope="col">Zone</th><th scope="col">Frais</th><th scope="col">Délai indicatif</th></tr></thead>
                <tbody>
                  {zones.map((z) => (
                    <tr key={`${z.nom_fr}-${z.frais_millimes}`}>
                      <th scope="row">{z.nom_fr ?? z.nom_ar}</th>
                      <td>{formatePrix(z.frais_millimes)}</td>
                      <td>{z.delai_jours_min != null && z.delai_jours_max != null ? `${z.delai_jours_min} à ${z.delai_jours_max} jours ouvrés` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>Les frais de livraison dépendent du gouvernorat ; ils sont annoncés avant la confirmation de la commande.</p>
            )}
            {cadre.tranchesPoids?.length ? (
              <table className="legal-table">
                <caption>Supplément selon le poids du colis, ajouté aux frais de livraison</caption>
                <thead><tr><th scope="col">Poids du colis</th><th scope="col">Supplément</th></tr></thead>
                <tbody>
                  {cadre.tranchesPoids.map((x, i, toutes) => {
                    const avant = i > 0 ? toutes[i - 1].jusqu_a_grammes : null;
                    const plage = x.jusqu_a_grammes === null
                      ? (avant ? `Plus de ${poidsLisible(avant)}` : "Tout colis")
                      : (avant ? `Plus de ${poidsLisible(avant)}, jusqu'à ${poidsLisible(x.jusqu_a_grammes)}` : `Jusqu'à ${poidsLisible(x.jusqu_a_grammes)}`);
                    return (
                      <tr key={x.jusqu_a_grammes ?? "au-dela"}>
                        <th scope="row">{plage}</th>
                        <td>{x.supplement_millimes ? formatePrix(x.supplement_millimes) : "Aucun"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
            {cadre.tranchesPoids?.length ? (
              <p>
                Le poids du colis est la somme des poids des articles commandés
                {cadre.tranchesPoids.at(-1)?.jusqu_a_grammes != null ? " ; au-delà de la dernière tranche, son supplément s'applique" : ""}. Le
                supplément est compris dans les frais annoncés avant la confirmation de la commande.
              </p>
            ) : null}
            {cadre.seuilGratuiteMillimes ? (
              <p>
                La livraison est offerte à partir de {formatePrix(cadre.seuilGratuiteMillimes)} d&apos;achats
                {cadre.tranchesPoids?.length ? ", supplément selon le poids compris" : ""}.
              </p>
            ) : null}
            {cadre.retrait ? (
              <p>
                L&apos;acheteur peut aussi choisir de retirer sa commande au magasin, sans frais : {cadre.retrait.adresse},{" "}
                {cadre.retrait.ville}
                {cadre.retrait.horaires ? ` (${cadre.retrait.horaires.charAt(0).toLowerCase()}${cadre.retrait.horaires.slice(1)})` : ""}. La
                commande est prête dans un délai indicatif de {cadre.retrait.delai_heures} heure{cadre.retrait.delai_heures > 1 ? "s" : ""} après
                sa confirmation ; elle se retire au nom de l&apos;acheteur et se paie au comptoir, en espèces.
              </p>
            ) : null}
          </>
        ),
      },
      {
        id: "refus",
        titre: "Refus à la livraison",
        corps: (
          <>
            <p>
              L&apos;acheteur peut refuser le colis à sa remise : il ne paie alors rien. La boutique peut ne plus accepter de
              commandes en ligne d&apos;un numéro qui refuse ses colis de façon répétée, sans motif.
            </p>
            {cadre.retrait ? (
              <p>
                Il en va de même d&apos;une commande à retirer au magasin qui n&apos;est pas retirée : elle est annulée sans frais,
                après que la boutique a tenté de joindre l&apos;acheteur.
              </p>
            ) : null}
          </>
        ),
      },
      {
        id: "retractation",
        titre: "Droit de rétractation",
        corps: (
          <>
            <p>
              Conformément à la loi n° 2000-83 du 9 août 2000 relative aux échanges et au commerce électroniques,
              l&apos;acheteur dispose de <b>{jours} jours ouvrables</b> à compter de la réception de sa commande pour se
              rétracter, sans avoir à se justifier. Il en informe la boutique {moyensDeContact(id)}.
            </p>
            <p>
              Le produit est retourné complet, dans son état et son emballage d&apos;origine.{" "}
              {id.retourOffert
                ? "Les frais de retour sont pris en charge par la boutique."
                : "Les frais de retour sont à la charge de l'acheteur."}{" "}
              La boutique rembourse le montant payé dans les dix jours ouvrables qui suivent le retour du produit.
            </p>
            <p>
              La rétractation ne s&apos;applique pas aux produits confectionnés selon les demandes de l&apos;acheteur, ni à ceux
              qui, par leur nature, ne peuvent pas être renvoyés ou risquent de se détériorer.
            </p>
          </>
        ),
      },
      {
        id: "garanties",
        titre: "Garanties",
        corps: (
          <p>
            Les produits bénéficient des garanties prévues par la loi et, le cas échéant, de la garantie du fabricant.
            {cadre.sav?.garantieMois ? ` La boutique garantit en outre les articles qu'elle vend ${cadre.sav.garantieMois} mois à compter de leur livraison.` : ""}{" "}
            En cas de produit défectueux ou non conforme, l&apos;acheteur joint la boutique {moyensDeContact(id)}
            {cadre.sav ? (
              <>
                , ou fait une demande de service après-vente depuis « Mes commandes » (voir{" "}
                <Link href="/garantie-et-sav">garantie et service après-vente</Link>)
              </>
            ) : null}
            .
          </p>
        ),
      },
      {
        id: "donnees",
        titre: "Données personnelles",
        corps: (
          <p>
            Les coordonnées de l&apos;acheteur servent à traiter et livrer ses commandes. Ce qui en est fait, et ses droits,
            sont décrits dans la <Link href="/confidentialite">politique de confidentialité</Link>.
          </p>
        ),
      },
      {
        id: "litiges",
        titre: "Réclamations et litiges",
        corps: (
          <p>
            Toute réclamation est adressée à la boutique {moyensDeContact(id)} ; elle y répond au plus vite. Les présentes
            conditions sont soumises au droit tunisien. À défaut d&apos;accord amiable, le litige est porté devant les
            tribunaux tunisiens compétents.
          </p>
        ),
      },
    ],
  };
}

/* ---------------------------------------------------------------------- */

export function confidentialite(cadre: Cadre): { intro: React.ReactNode; sections: SectionLegale[] } {
  const id = identiteLegale(cadre);
  const responsable = id.raisonSociale ?? id.nom;
  const compte = cadre.reglages["compte.obligatoire"] !== false;
  return {
    intro: (
      <p>
        Ce que {responsable} fait des données de ses clients, où elles sont conservées, et comment exercer vos droits, au
        sens de la loi organique n° 2004-63 du 27 juillet 2004 portant sur la protection des données à caractère personnel.
      </p>
    ),
    sections: [
      {
        id: "responsable",
        titre: "Responsable du traitement",
        corps: (
          <>
            <p>Le responsable du traitement est {responsable}{id.adresse ? `, ${id.adresse}` : ""}.</p>
            <p>
              La plateforme <b>SkanEcom</b>, qui fait fonctionner le site, traite les données pour le compte de la boutique et
              selon ses instructions, sans les utiliser à d&apos;autres fins.
            </p>
          </>
        ),
      },
      {
        id: "donnees",
        titre: "Les données recueillies",
        corps: (
          <ul className="legal-liste">
            <li>le nom et le numéro de téléphone de l&apos;acheteur{compte ? ", confirmé par un code reçu par SMS" : ""} ;</li>
            <li>l&apos;adresse de livraison, et l&apos;adresse électronique si elle est donnée ;</li>
            <li>les commandes : articles, montants, dates, suivi de la livraison, refus éventuels ;</li>
            <li>les échanges avec la boutique au sujet d&apos;une commande (appel de confirmation, note de livraison).</li>
          </ul>
        ),
      },
      {
        id: "finalites",
        titre: "Pourquoi",
        corps: (
          <>
            <p>
              Pour préparer, confirmer et livrer les commandes, répondre aux demandes de l&apos;acheteur, assurer le service
              après-vente, et limiter les commandes refusées à la livraison. Les données ne sont ni vendues, ni louées, ni
              utilisées pour de la publicité ciblée.
            </p>
            <p>L&apos;acheteur donne son accord en cochant la case prévue avant de confirmer sa commande.</p>
          </>
        ),
      },
      {
        id: "destinataires",
        titre: "Qui les reçoit",
        corps: (
          <p>
            L&apos;équipe de la boutique ; le livreur ou le transporteur, pour le nom, le téléphone et l&apos;adresse de
            livraison ; les prestataires techniques de la plateforme, dans la stricte mesure nécessaire (hébergement,
            envoi des codes SMS).
          </p>
        ),
      },
      {
        id: "lieu",
        titre: "Où, et combien de temps",
        corps: (
          <>
            <p>
              Les données sont conservées dans une base de données située dans l&apos;Union européenne (région de Paris).
              {id.inpdp ? ` Ce traitement a fait l'objet d'une déclaration auprès de l'Instance nationale de protection des données personnelles (INPDP), sous la référence ${id.inpdp}.` : ""}
            </p>
            <p>
              Elles sont gardées le temps nécessaire à la gestion des commandes et de la relation avec le client, puis le
              temps imposé par les obligations légales de conservation.
            </p>
          </>
        ),
      },
      {
        id: "droits",
        titre: "Vos droits",
        corps: (
          <>
            <p>
              Vous pouvez accéder à vos données, les faire rectifier ou compléter, et vous opposer à leur traitement pour un
              motif légitime. Adressez votre demande à la boutique {moyensDeContact(id)}.
            </p>
            <p>
              Vous pouvez aussi saisir l&apos;Instance nationale de protection des données personnelles (INPDP).
            </p>
          </>
        ),
      },
      {
        id: "temoins",
        titre: "Témoins de connexion",
        corps: (
          <p>
            Le site n&apos;utilise que ce qui est nécessaire à son fonctionnement : le témoin de connexion de votre compte, et
            le contenu de votre panier gardé dans votre navigateur. Aucun traceur publicitaire ni outil de mesure
            d&apos;audience tiers.
          </p>
        ),
      },
    ],
  };
}
