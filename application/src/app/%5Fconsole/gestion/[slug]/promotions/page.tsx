import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { BoutonCopier } from "@/components/console/BoutonCopier";
import { OuvrirDetails } from "@/components/console/OuvrirDetails";
import { FormCodePromo } from "@/components/console/FormCodePromo";
import { OngletsPromotions } from "@/components/console/OngletsPromotions";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { quand } from "@/lib/gestion/libelles";
import { formateMontant } from "@/lib/prix";
import { adresseVitrine } from "@/lib/console/libelles";
import { cadreDeGestion } from "@/lib/gestion/pages";
import { ETATS_CODE, PEUT_PROMOUVOIR, conditionsDe, messagePartage, offreDe, type CodePromo, type ListeCodes } from "@/lib/gestion/promotions";

export const metadata: Metadata = { title: "Codes promo" };

/* ============================================================================
   LES CODES PROMO (module promotions) — ceux qui vivent (actifs, programmés)
   d'abord, puis ceux qui ont fini ; chacun dit ce qu'il offre, à quelles
   conditions, et ce qu'il a rapporté (commandes, ventes, remises). On en
   crée un, on le règle, on le coupe, on le retire s'il n'a jamais servi ;
   on le copie ou on le partage sur WhatsApp, message prêt. Propriétaire et
   administrateur ; la lecture regarde.
   ========================================================================== */
export default async function Promotions({
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
    sb.rpc("gestion_codes_promo", { p_boutique_id: boutique.boutique_id }),
    cadreDeGestion(sb, boutique.boutique_id),
    headers().then((h) => h.get("host")),
  ]);
  if (error) throw new Error(`Codes promo illisibles : ${error.message}`);
  const liste = data as ListeCodes;
  // Module coupé, sans code : il reste peut-être des prix barrés à rendre.
  if (!liste.actif && liste.codes.length === 0) redirect(`/gestion/${slug}/promotions/prix-barres`);
  // L'adresse de la vitrine, pour le message à partager.
  const hote = cadre?.boutique.hote_principal ?? null;
  const vitrine = hote ? adresseVitrine(hote, hoteConsole) : null;

  const base = `/gestion/${slug}/promotions`;
  const action = `${base}/action`;
  const regle = PEUT_PROMOUVOIR.includes(boutique.role) && liste.actif;
  const maintenant = new Date();
  const c = liste.compteurs;
  const vivants = liste.codes.filter((x) => x.etat === "actif" || x.etat === "programme");
  const finis = liste.codes.filter((x) => x.etat !== "actif" && x.etat !== "programme");
  const commun = { boutique: boutique.nom, vitrine, maintenant, regle, action };

  return (
    <>
      <EnTetePage
        titre="Promotions"
        description={
          liste.actif
            ? "Des codes à donner — en story, dans le colis, à une cliente fidèle : un pourcentage, un montant ou la livraison offerte. La base les vérifie à chaque commande ; une commande passée garde sa remise."
            : "Le module est coupé : aucun code ne s'applique plus. Ils restent ici, avec ce qu'ils ont rapporté."
        }
        actions={regle ? <OuvrirDetails cible="nouveau" className="btn btn-primaire"><Icone nom="etiquette" /> Nouveau code</OuvrirDetails> : undefined}
      />
      <OngletsPromotions slug={slug} courant="codes" />

      {recherche.ok ? <p className="message message-succes mb-4" role="status">{recherche.ok}</p> : null}
      {recherche.erreur ? <p className="message message-erreur mb-4" role="alert">{recherche.erreur}</p> : null}

      {c.utilisations > 0 ? (
        <section className="carte pm-synthese" aria-label="Ce que les codes ont rapporté">
          {/* Sans marge intérieure : les points d'une ligne repliée tombent hors champ. */}
          <p className="pm-synthese-ligne">
            <span className="ligne-points">
              <span><b className="tabular-nums">{c.utilisations}</b> commande{c.utilisations > 1 ? "s" : ""} avec un code</span>
              <span><b className="tabular-nums">{formateMontant(c.ventes_millimes)}</b> TND de ventes</span>
              <span><b className="tabular-nums">{formateMontant(c.remises_millimes)}</b> TND de remises accordées</span>
            </span>
          </p>
        </section>
      ) : null}

      {/* Le formulaire d'un nouveau code : replié en tête (il prenait la moitié de
          la page entre deux listes), ouvert d'office tant qu'aucun code n'existe. */}
      {regle ? (
        <details id="nouveau" className="carte pm-nouveau" open={liste.codes.length === 0 ? true : undefined}>
          <summary className="pm-nouveau-tete">
            <span className="carte-titre-icone"><Icone nom="plus" /> Nouveau code</span>
            <span className="aide">Un pourcentage, un montant ou la livraison offerte, à donner en story, dans le colis, à une cliente fidèle.</span>
          </summary>
          <p className="aide pm-nouveau-aide">Il s&apos;applique au tunnel, sur les articles ; jamais au-delà de leur montant. Un code ne vaut pas sur un devis, dont le prix est déjà négocié.</p>
          <FormCodePromo action={action} suffixe="nouveau" />
        </details>
      ) : null}

      <section aria-labelledby="t-vivants" className="pm-section">
        <h2 id="t-vivants" className="pm-titre">En cours <span className="compte-onglet">{vivants.length}</span></h2>
        {vivants.length === 0 ? (
          <div className="vide cat-vide">
            <span className="vide-icone"><Icone nom="etiquette" taille={20} /></span>
            <strong>Aucun code en cours</strong>
            <p>{regle ? "Créez-en un ci-dessus : il vaut dès son premier jour." : "La direction de la boutique les crée."}</p>
          </div>
        ) : (
          <ul className="pm-liste" role="list">
            {vivants.map((x) => <CarteCode key={x.id} x={x} {...commun} />)}
          </ul>
        )}
      </section>

      {finis.length > 0 ? (
        <section aria-labelledby="t-finis" className="pm-section">
          <h2 id="t-finis" className="pm-titre">Terminés, épuisés ou coupés <span className="compte-onglet">{finis.length}</span></h2>
          <ul className="pm-liste" role="list">
            {finis.map((x) => <CarteCode key={x.id} x={x} {...commun} />)}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** Un code : ce qu'il offre, ses conditions, ce qu'il a rapporté, ses gestes. */
function CarteCode({ x, boutique, vitrine, maintenant, regle, action }: {
  x: CodePromo; boutique: string; vitrine: string | null; maintenant: Date; regle: boolean; action: string;
}) {
  const etat = ETATS_CODE[x.etat];
  const partage = messagePartage(x, boutique, vitrine, maintenant);
  const part = x.limite_utilisations ? Math.min(100, (x.utilisations / x.limite_utilisations) * 100) : null;
  return (
    <li className="carte pm-carte" data-etat={x.etat} id={`code-${x.id}`}>
      <div className="pm-tete">
        <span className="pm-ticket">{x.code}</span>
        <span className={etat.classe}>{etat.libelle}</span>
      </div>
      <p className="pm-offre">{offreDe(x)}</p>
      <p className="pm-conditions"><span className="ligne-points">{conditionsDe(x, maintenant).map((t) => <span key={t}>{t}</span>)}</span></p>

      <div className="pm-chiffres">
        {x.utilisations > 0 ? (
          <p>
            <span className="ligne-points">
              <span><b className="tabular-nums">{x.utilisations}</b> commande{x.utilisations > 1 ? "s" : ""}</span>
              <span><b className="tabular-nums">{formateMontant(x.ventes_millimes)}</b> TND de ventes</span>
              <span><b className="tabular-nums">{formateMontant(x.remises_millimes)}</b> TND de remise</span>
            </span>
          </p>
        ) : (
          <p className="discret">Pas encore utilisé.</p>
        )}
        {part !== null && x.utilisations > 0 ? (
          <span className="pm-jauge" role="img" aria-label={`${x.utilisations} utilisations sur ${x.limite_utilisations}`}>
            <span style={{ inlineSize: `${part}%` }} />
          </span>
        ) : null}
        {x.derniere_utilisation ? <p className="aide">Dernière utilisation {quand(x.derniere_utilisation, maintenant)}</p> : null}
      </div>
      {x.note ? <p className="aide pm-note"><Icone nom="note" taille={13} /> {x.note}</p> : null}

      <div className="pm-gestes">
        {x.etat === "actif" || x.etat === "programme" ? (
          <>
            <BoutonCopier texte={x.code} libelle="Copier" classe="btn btn-second" />
            <a className="btn btn-second" href={`https://wa.me/?text=${encodeURIComponent(partage)}`} target="_blank" rel="noopener">
              <Icone nom="message" /> Partager
            </a>
          </>
        ) : null}
        {regle ? (
          <>
            <details className="pm-pli">
              <summary className="btn btn-second">Régler</summary>
              <FormCodePromo action={action} code={x} suffixe={x.id} />
            </details>
            {/* Un code fini par ses dates se prolonge en le réglant ; on ne le coupe pas. */}
            {x.etat !== "termine" ? (
              <form action={action} method="post">
                <input type="hidden" name="geste" value={x.actif ? "couper" : "reactiver"} />
                <input type="hidden" name="code_id" value={x.id} />
                <button className="btn btn-second">{x.actif ? "Couper" : "Réactiver"}</button>
              </form>
            ) : null}
            {!x.a_servi ? (
              <form action={action} method="post">
                <input type="hidden" name="geste" value="retirer" />
                <input type="hidden" name="code_id" value={x.id} />
                <button className="btn btn-danger"><Icone nom="corbeille" taille={14} /> Retirer</button>
              </form>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}
