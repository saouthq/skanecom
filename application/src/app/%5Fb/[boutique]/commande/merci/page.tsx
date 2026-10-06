import type { Metadata } from "next";
import Image from "next/image";
import { cookies } from "next/headers";
import { Gabarit } from "@/components/Gabarit";
import { FinDeCommande } from "@/components/FinDeCommande";
import { Calendrier, Coche } from "@/components/Icones";
import { Prix } from "@/components/Prix";
import { cadre as chargeCadre } from "@/lib/boutique";
import { jourPrevu } from "@/lib/catalogue";
import { supabase } from "@/lib/supabase";
import { COOKIE_COMMANDE, lieu, prenomDe, telephoneLisible, type CommandeSuivie } from "@/lib/commande";
import { urlFichier } from "@/lib/photos";
import { lignesPub } from "@/lib/pixels";
import { formatePrix } from "@/lib/prix";
import { t } from "@/lib/i18n";
import { relirePaiement } from "@/lib/paiement/commande";

/* ============================================================================
   LA PAGE DE FIN DE COMMANDE — ce qui a été commandé, où, pour combien, et
   la suite (appel de confirmation si la boutique le pratique, expédition,
   paiement au livreur ; ou, en retrait, préparation et paiement au comptoir).

   Elle lit « numéro.jeton » dans le cookie HttpOnly posé par
   /commande/passer, puis public.commande_suivie : sans le bon jeton, la
   base ne rend rien. Jamais en cache (cookie, et `no-store` de la façade).
   ========================================================================== */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: t.commande.merciMeta,
  robots: { index: false, follow: false },
};

type Etape = { titre: string; texte: string; fait: boolean };

type Facturation = { raison_sociale: string; matricule_fiscal: string; adresse: { ligne1: string; ville: string; code_postal: string | null } | null };

/** Le paiement en ligne de la commande (public.vitrine_paiement, migration …_konnect). */
type EtatPaiement = {
  mode_paiement: string; statut_paiement: string; total_millimes: number; cod_actif: boolean; konnect_pret: boolean;
  paiement: { reference: string; adresse: string | null; statut: string } | null;
};

export default async function Merci({ params, searchParams }: {
  params: Promise<{ boutique: string }>;
  searchParams: Promise<{ paiement?: string }>;
}) {
  const [{ boutique }, sp] = await Promise.all([params, searchParams]);
  const cadre = await chargeCadre(boutique);
  // « numéro.jeton », ou « numéro.jeton.devis » pour la commande d'un devis
  // accepté, « numéro.jeton.express » pour un achat express : celles-là ne
  // vident pas le panier du moment.
  const [numero, jeton, origine] = ((await cookies()).get(COOKIE_COMMANDE)?.value ?? "").split(".");

  let commande: CommandeSuivie | null = null;
  if (numero && jeton) {
    const { data } = await supabase.rpc("commande_suivie", {
      p_boutique_id: cadre.boutique.id,
      p_numero: numero,
      p_jeton: jeton,
    });
    commande = (data as CommandeSuivie | null) ?? null;
  }
  // Le paiement en ligne : au retour de Konnect, ou tant qu'il attend, on le
  // relit chez Konnect avant de dire quoi que ce soit.
  let paiement: EtatPaiement | null = null;
  if (commande && numero && jeton) {
    const { data } = await supabase.rpc("vitrine_paiement", { p_boutique_id: cadre.boutique.id, p_numero: numero, p_jeton: jeton });
    paiement = (data as EtatPaiement | null) ?? null;
    if (paiement?.paiement?.statut === "en_attente") {
      const r = await relirePaiement(paiement.paiement.reference, cadre.boutique.id);
      if (r && r.statut !== paiement.paiement.statut) {
        paiement = { ...paiement, statut_paiement: r.statut === "paye" ? "paye" : r.statut === "echoue" ? "echoue" : paiement.statut_paiement,
          paiement: { ...paiement.paiement, statut: r.statut } };
      }
    }
  }
  // La facture au nom d'une société, si elle a été demandée (migration …_facturation_commande).
  let facture: Facturation | null = null;
  if (commande && numero && jeton) {
    const { data } = await supabase.rpc("vitrine_facturation", { p_boutique_id: cadre.boutique.id, p_numero: numero, p_jeton: jeton });
    facture = (data as Facturation | null) ?? null;
  }
  const enLigne = paiement?.mode_paiement === "konnect";
  const payee = enLigne && paiement?.statut_paiement === "paye";
  const enAttente = enLigne && !payee && paiement?.paiement?.statut === "en_attente";

  if (!commande) {
    return (
      <Gabarit className="enveloppe flex-1 merci-page">
        <div className="listing-vide merci-aucune">
          <h1>{t.commande.aucune}</h1>
          <p>{t.commande.aucuneTexte}</p>
          <a className="btn btn-primaire" href="/">{t.commande.continuer}</a>
        </div>
      </Gabarit>
    );
  }

  const aConfirmer = commande.statut === "recue" || commande.statut === "a_arbitrer";
  const retrait = commande.mode_livraison === "retrait";
  const magasin = commande.retrait;
  const zone = cadre.zones.find((z) => (z.nom_fr ?? z.nom_ar) === commande.livraison.zone);
  const delai =
    zone?.delai_jours_min != null && zone.delai_jours_max != null
      ? t.commande.delai(zone.delai_jours_min, zone.delai_jours_max)
      : undefined;
  const suite: Etape[] = [
    { titre: t.commande.suiteRecue, texte: retrait ? t.commande.suiteRecueTexteRetrait : t.commande.suiteRecueTexte, fait: true },
    ...(payee ? [{ titre: t.commande.suitePayee, texte: t.commande.suitePayeeFaite(formatePrix(commande.total_millimes)), fait: true }] : []),
    ...(cadre.livraison.rappel && aConfirmer
      ? [{
          titre: t.commande.suiteAppel,
          texte: (retrait ? t.commande.suiteAppelTexteRetrait : t.commande.suiteAppelTexte)(telephoneLisible(commande.contact.telephone)),
          fait: false,
        }]
      : []),
    // Une précommande : elle attend son arrivage avant de partir (migration 88).
    ...(commande.arrivage_prevu
      ? [{ titre: t.precommande.suiteTitre, texte: t.precommande.merci(jourPrevu(commande.arrivage_prevu)), fait: false }]
      : []),
    // Pas encore payée en ligne : le paiement attend, ou a échoué.
    ...(enLigne && !payee ? [{ titre: t.commande.suitePaiement, texte: enAttente ? t.commande.paiementAttente : t.commande.paiementEchoue, fait: false }] : []),
    ...(retrait
      ? [
          { titre: t.commande.suitePreparation, texte: t.commande.suitePreparationTexte(t.commande.pretSous(magasin?.delai_heures ?? 24)), fait: false },
          payee
            ? { titre: t.commande.suiteRemiseRetrait, texte: t.commande.suitePayeeTexteRetrait, fait: false }
            : { titre: t.commande.suiteRetrait, texte: t.commande.suiteRetraitTexte(formatePrix(commande.total_millimes)), fait: false },
        ]
      : ([
          { titre: t.commande.suiteExpedition, texte: t.commande.suiteExpeditionTexte(delai), fait: false },
          payee
            ? { titre: t.commande.suiteRemise, texte: t.commande.suitePayeeTexte, fait: false }
            : enLigne ? null
            : { titre: t.commande.suiteLivraison, texte: t.commande.suiteLivraisonTexte(formatePrix(commande.total_millimes)), fait: false },
        ] as (Etape | null)[]).filter((x): x is Etape => x !== null)),
  ];
  const l = commande.livraison;

  return (
    <Gabarit className="enveloppe flex-1 merci-page">
      {origine === "devis" ? null : (
        <FinDeCommande boutique={cadre.boutique.slug} creeLe={commande.cree_le} videLePanier={origine !== "express"}
          achat={cadre.pixels ? { numero: commande.numero, lignes: lignesPub(commande.lignes) } : undefined} />
      )}
      <section className="merci" aria-labelledby="merci-titre">
        <header className="merci-tete">
          <p className="etiquette merci-etiquette">
            <Coche taille={16} />
            {aConfirmer ? t.commande.merciEtiquette : t.commande.merciEtiquetteConfirmee}
          </p>
          <h1 id="merci-titre">{t.commande.merciTitre(prenomDe(commande.contact.nom))}</h1>
          <p className="chapo">{t.commande.merciNumero(commande.numero)}</p>
        </header>

        {payee ? (
          <p className="merci-paiement merci-paiement-ok" role="status">
            <Coche taille={16} /> {(retrait ? t.commande.paiementRecuRetrait : t.commande.paiementRecu)(formatePrix(commande.total_millimes))}
          </p>
        ) : enLigne ? (
          <div className="merci-paiement" role="status">
            <p>{enAttente ? t.commande.paiementAttente : sp.paiement === "indisponible" ? t.commande.paiementIndisponibleSeul : t.commande.paiementEchoue}</p>
            <div className="merci-paiement-gestes">
              {enAttente && paiement?.paiement?.adresse ? (
                <a className="btn btn-primaire" href={paiement.paiement.adresse}>{t.commande.payerMaintenant}</a>
              ) : (
                <form action="/commande/paiement" method="post">
                  <button type="submit" name="geste" value="reessayer" className="btn btn-primaire">{t.commande.reessayerPaiement}</button>
                </form>
              )}
              {paiement?.cod_actif ? (
                <form action="/commande/paiement" method="post">
                  <button type="submit" name="geste" value="livraison" className="btn btn-second">
                    {retrait ? t.commande.payerAuRetrait : t.commande.payerALaLivraison}
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        ) : sp.paiement === "indisponible" ? (
          <p className="merci-paiement" role="status">{t.commande.paiementIndisponible}</p>
        ) : sp.paiement === "livraison" ? (
          <p className="merci-paiement merci-paiement-ok" role="status">
            <Coche taille={16} /> {(retrait ? t.commande.paiementAuRetraitNote : t.commande.paiementALaLivraisonNote)(formatePrix(commande.total_millimes))}
          </p>
        ) : null}

        <div className="merci-grille">
          <div className="merci-suite">
            <h2>{t.commande.laSuite}</h2>
            <ol>
              {suite.map((etape, i) => (
                <li key={etape.titre} data-fait={etape.fait ? "" : undefined}>
                  <span className="merci-puce" aria-hidden="true">
                    {etape.fait ? <Coche taille={14} /> : i + 1}
                  </span>
                  <div>
                    <strong>{etape.titre}</strong>
                    <p>{etape.texte}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="merci-actions">
              <a className="btn btn-primaire merci-continuer" href="/">{t.commande.continuer}</a>
              {cadre.reglages["compte.obligatoire"] !== false ? <a className="btn-lien" href="/compte">{t.compte.suivre}</a> : null}
            </p>
          </div>

          <div className="merci-recap">
            <h2>{t.commande.articles}</h2>
            <ul className="tunnel-lignes">
              {commande.lignes.map((ligne, i) => (
                <li key={`${ligne.sku}-${i}`} className="tunnel-ligne">
                  <span className="tunnel-vignette">
                    {ligne.image ? (
                      <Image src={urlFichier(ligne.image)} alt="" fill sizes="64px" />
                    ) : (
                      <span className="attente-photo" aria-hidden="true">
                        <span className="filigrane" />
                      </span>
                    )}
                    <span className="tunnel-vignette-n" aria-hidden="true">{ligne.quantite}</span>
                  </span>
                  <span className="tunnel-ligne-corps">
                    <span className="tunnel-ligne-nom">{ligne.produit_nom}</span>
                    {ligne.variante_libelle ? <span className="legende">{ligne.variante_libelle}</span> : null}
                    <span className="legende">{t.commande.quantite(ligne.quantite)}</span>
                    {ligne.precommande ? (
                      <span className="tunnel-ligne-precommande"><Calendrier taille={13} /> {t.precommande.ligneCourte}</span>
                    ) : null}
                  </span>
                  <span className="tunnel-ligne-prix">
                    <Prix millimes={ligne.total_ligne_millimes} />
                    {ligne.lot ? <span className="tunnel-ligne-palier">{t.commande.lot(ligne.lot)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="tunnel-totaux">
              <div>
                <dt>{t.commande.sousTotal}</dt>
                <dd><Prix millimes={commande.sous_total_millimes} /></dd>
              </div>
              <div>
                <dt>{retrait ? t.commande.modeRetrait : l.zone ? t.commande.livraisonVers(l.zone) : t.commande.livraison}</dt>
                <dd>
                  {retrait ? t.commande.gratuit
                    : commande.frais_livraison_millimes === 0 ? t.commande.livraisonOfferte : <Prix millimes={commande.frais_livraison_millimes} />}
                </dd>
              </div>
              {commande.remise_millimes > 0 ? (
                <div className="tunnel-remise">
                  <dt>{commande.code_promo ? t.promo.ligne(commande.code_promo) : t.promo.libelle}</dt>
                  <dd>−<Prix millimes={commande.remise_millimes} /></dd>
                </div>
              ) : null}
              <div className="tunnel-total">
                <dt>
                  {t.commande.total} <span className="ttc">{t.commande.ttc}</span>
                </dt>
                <dd><Prix millimes={commande.total_millimes} fort /></dd>
              </div>
            </dl>
            {retrait ? (
              <>
                <h3>{t.commande.aRetirerA}</h3>
                <address className="merci-adresse">
                  {magasin ? (
                    <>
                      {magasin.adresse}
                      <br />
                      {magasin.ville}
                      {magasin.horaires ? (
                        <>
                          <br />
                          {magasin.horaires}
                        </>
                      ) : null}
                      <br />
                    </>
                  ) : null}
                  {commande.contact.nom} · <bdi>{telephoneLisible(commande.contact.telephone)}</bdi>
                </address>
              </>
            ) : (
              <>
                <h3>{t.commande.livreeA}</h3>
                <address className="merci-adresse">
                  {commande.contact.nom}
                  <br />
                  {l.ligne1}
                  {l.ligne2 ? (
                    <>
                      <br />
                      {l.ligne2}
                    </>
                  ) : null}
                  <br />
                  {l.code_postal ? `${l.code_postal} ` : ""}
                  {lieu(l.ville, l.gouvernorat)}
                  <br />
                  <bdi>{telephoneLisible(commande.contact.telephone)}</bdi>
                </address>
              </>
            )}
            {facture ? (
              <>
                <h3>{t.facture.auNomDe}</h3>
                <address className="merci-adresse">
                  {facture.raison_sociale}
                  <br />
                  {t.facture.matriculeCourt(facture.matricule_fiscal)}
                  {facture.adresse ? (
                    <>
                      <br />
                      {facture.adresse.ligne1}
                      <br />
                      {facture.adresse.code_postal ? `${facture.adresse.code_postal} ` : ""}
                      {facture.adresse.ville}
                    </>
                  ) : null}
                </address>
              </>
            ) : null}
            <p className="legende">
              {(retrait ? t.commande.statutRetrait[commande.statut] : undefined) ?? t.commande.statut[commande.statut] ?? commande.statut}
            </p>
          </div>
        </div>
      </section>
    </Gabarit>
  );
}
