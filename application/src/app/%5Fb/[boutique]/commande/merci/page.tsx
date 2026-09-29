import type { Metadata } from "next";
import Image from "next/image";
import { cookies } from "next/headers";
import { Gabarit } from "@/components/Gabarit";
import { FinDeCommande } from "@/components/FinDeCommande";
import { Coche } from "@/components/Icones";
import { Prix } from "@/components/Prix";
import { cadre as chargeCadre } from "@/lib/boutique";
import { supabase } from "@/lib/supabase";
import { COOKIE_COMMANDE, lieu, prenomDe, telephoneLisible, type CommandeSuivie } from "@/lib/commande";
import { urlFichier } from "@/lib/photos";
import { formatePrix } from "@/lib/prix";
import { t } from "@/lib/i18n";

/* ============================================================================
   LA PAGE DE FIN DE COMMANDE — ce qui a été commandé, où, pour combien, et
   la suite (appel de confirmation si la boutique le pratique, expédition,
   paiement au livreur).

   Elle lit « numéro.jeton » dans le cookie HttpOnly posé par
   /commande/passer, puis public.commande_suivie : sans le bon jeton, la
   base ne rend rien. Jamais en cache (cookie, et `no-store` de la façade).
   ========================================================================== */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: t.commande.merciMeta,
  robots: { index: false, follow: false },
};

export default async function Merci({ params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  const [numero, jeton] = ((await cookies()).get(COOKIE_COMMANDE)?.value ?? "").split(".");

  let commande: CommandeSuivie | null = null;
  if (numero && jeton) {
    const { data } = await supabase.rpc("commande_suivie", {
      p_boutique_id: cadre.boutique.id,
      p_numero: numero,
      p_jeton: jeton,
    });
    commande = (data as CommandeSuivie | null) ?? null;
  }

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
  const zone = cadre.zones.find((z) => (z.nom_fr ?? z.nom_ar) === commande.livraison.zone);
  const delai =
    zone?.delai_jours_min != null && zone.delai_jours_max != null
      ? t.commande.delai(zone.delai_jours_min, zone.delai_jours_max)
      : undefined;
  const suite = [
    { titre: t.commande.suiteRecue, texte: t.commande.suiteRecueTexte, fait: true },
    ...(cadre.livraison.rappel && aConfirmer
      ? [{ titre: t.commande.suiteAppel, texte: t.commande.suiteAppelTexte(telephoneLisible(commande.contact.telephone)), fait: false }]
      : []),
    { titre: t.commande.suiteExpedition, texte: t.commande.suiteExpeditionTexte(delai), fait: false },
    { titre: t.commande.suiteLivraison, texte: t.commande.suiteLivraisonTexte(formatePrix(commande.total_millimes)), fait: false },
  ];
  const l = commande.livraison;

  return (
    <Gabarit className="enveloppe flex-1 merci-page">
      <FinDeCommande boutique={cadre.boutique.slug} creeLe={commande.cree_le} />
      <section className="merci" aria-labelledby="merci-titre">
        <header className="merci-tete">
          <p className="etiquette merci-etiquette">
            <Coche taille={16} />
            {aConfirmer ? t.commande.merciEtiquette : t.commande.merciEtiquetteConfirmee}
          </p>
          <h1 id="merci-titre">{t.commande.merciTitre(prenomDe(commande.contact.nom))}</h1>
          <p className="chapo">{t.commande.merciNumero(commande.numero)}</p>
        </header>

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
            <a className="btn btn-primaire merci-continuer" href="/">{t.commande.continuer}</a>
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
                  </span>
                  <span className="tunnel-ligne-prix">
                    <Prix millimes={ligne.total_ligne_millimes} />
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
                <dt>{l.zone ? t.commande.livraisonVers(l.zone) : t.commande.livraison}</dt>
                <dd>
                  {commande.frais_livraison_millimes === 0 ? t.commande.livraisonOfferte : <Prix millimes={commande.frais_livraison_millimes} />}
                </dd>
              </div>
              <div className="tunnel-total">
                <dt>
                  {t.commande.total} <span className="ttc">{t.commande.ttc}</span>
                </dt>
                <dd><Prix millimes={commande.total_millimes} fort /></dd>
              </div>
            </dl>
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
            <p className="legende">{t.commande.statut[commande.statut] ?? commande.statut}</p>
          </div>
        </div>
      </section>
    </Gabarit>
  );
}
