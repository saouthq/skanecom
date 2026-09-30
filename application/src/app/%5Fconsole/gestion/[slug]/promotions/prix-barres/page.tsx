import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { OngletsPromotions } from "@/components/console/OngletsPromotions";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { quand } from "@/lib/gestion/libelles";
import { formateMontant } from "@/lib/prix";
import { adresseVitrine } from "@/lib/console/libelles";
import { cadreDeGestion } from "@/lib/gestion/pages";
import { PEUT_PROMOUVOIR, pluriel, type ApercuPrix, type EcranPrixBarres, type OperationPrix } from "@/lib/gestion/promotions";

export const metadata: Metadata = { title: "Prix barrés" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/* ============================================================================
   LES PRIX BARRÉS D'UN RAYON (module promotions) — « −30 % sur les robes » :
   on nomme l'opération, on choisit le rayon (ou tout le catalogue) et la
   remise, on voit ce que ça change, on lance ; chaque déclinaison prend son
   prix remisé, l'ancien est barré. Terminer rend les prix d'avant (sauf
   ceux que l'équipe a changés entre-temps). En deux temps, sans script :
   « Voir ce que ça change » revient sur cette page avec l'aperçu
   (?nom=…&rayon=…&remise=…), « Lancer » agit. Propriétaire et
   administrateur ; la lecture regarde.
   ========================================================================== */
export default async function PrixBarres({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string; nom?: string; rayon?: string; remise?: string }>;
}) {
  const [{ slug }, recherche] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const [{ data, error }, cadre, hoteConsole] = await Promise.all([
    sb.rpc("gestion_soldes", { p_boutique_id: boutique.boutique_id }),
    cadreDeGestion(sb, boutique.boutique_id),
    headers().then((h) => h.get("host")),
  ]);
  if (error) throw new Error(`Prix barrés illisibles : ${error.message}`);
  const ecran = data as EcranPrixBarres;
  if (!ecran.actif && ecran.soldes.length === 0) notFound();
  const hote = cadre?.boutique.hote_principal ?? null;
  const vitrine = hote ? adresseVitrine(hote, hoteConsole) : null;

  const action = `/gestion/${slug}/promotions/prix-barres/action`;
  const direction = PEUT_PROMOUVOIR.includes(boutique.role);
  const regle = direction && ecran.actif;
  const maintenant = new Date();
  const enCours = ecran.soldes.filter((s) => s.statut === "en_cours");
  const finies = ecran.soldes.filter((s) => s.statut !== "en_cours");

  // Ce qui a été saisi (l'aperçu, ou un refus à corriger) revient dans l'adresse.
  const saisie = {
    nom: (recherche.nom ?? "").slice(0, 60),
    rayon: UUID.test(recherche.rayon ?? "") ? recherche.rayon! : "",
    remise: /^\d{1,2}$/.test(recherche.remise ?? "") ? recherche.remise! : "",
  };
  const rayonChoisi = ecran.rayons.find((r) => r.id === saisie.rayon) ?? null;
  let apercu: ApercuPrix | null = null;
  let refusApercu: string | null = null;
  if (regle && saisie.remise && !recherche.erreur) {
    const r = await sb.rpc("gestion_apercu_soldes", {
      p_boutique_id: boutique.boutique_id, p_categorie_id: saisie.rayon || null, p_pourcentage: Number(saisie.remise),
    });
    if (r.error) refusApercu = r.error.message;
    else apercu = r.data as ApercuPrix;
  }
  const commun = { vitrine, maintenant, termine: direction, action };

  return (
    <>
      <EnTetePage
        titre="Promotions"
        description={
          ecran.actif
            ? "Les prix d'un rayon baissés d'un coup, l'ancien prix barré à côté. Le panier et la commande appliquent le nouveau prix tout de suite ; terminer rend les prix d'avant."
            : "Le module est coupé : rien ne se lance plus. Une opération encore en cours se termine ici, pour rendre ses prix."
        }
        actions={regle ? <a className="btn btn-primaire" href="#nouvelle"><Icone nom="etiquette" /> Nouvelle opération</a> : undefined}
      />
      <OngletsPromotions slug={slug} courant="prix-barres" />

      {recherche.ok ? <p className="message message-succes mb-4" role="status">{recherche.ok}</p> : null}
      {recherche.erreur ? <p className="message message-erreur mb-4" role="alert">{recherche.erreur}</p> : null}

      {!ecran.prix_barres ? (
        <p className="message pb-reglage mb-4">
          <span>
            La vitrine n&apos;affiche pas les prix barrés : vos clients voient le nouveau prix, sans l&apos;ancien à côté.
            {direction ? <> <Link href={`/gestion/${slug}/reglages#t-vitrine`}>Les afficher</Link> (Réglages, Vitrine et contact), ou cochez-le au lancement.</> : null}
          </span>
        </p>
      ) : null}

      <section aria-labelledby="t-en-cours" className="pm-section">
        <h2 id="t-en-cours" className="pm-titre">En cours <span className="compte-onglet">{enCours.length}</span></h2>
        {enCours.length === 0 ? (
          <div className="vide cat-vide">
            <span className="vide-icone"><Icone nom="etiquette" taille={20} /></span>
            <strong>Aucune opération en cours</strong>
            <p>{regle ? "Lancez-en une ci-dessous : vous voyez ce qu'elle change avant qu'elle change quoi que ce soit." : "La direction de la boutique les lance."}</p>
          </div>
        ) : (
          <ul className="pm-liste" role="list">
            {enCours.map((s) => <CarteOperation key={s.id} s={s} {...commun} />)}
          </ul>
        )}
      </section>

      {regle ? (
        <section id="nouvelle" className="carte pm-nouveau" aria-labelledby="t-nouvelle">
          <div className="carte-tete">
            <div>
              <h2 id="t-nouvelle" className="carte-titre-icone"><Icone nom="etiquette" /> Nouvelle opération</h2>
              <p>Chaque déclinaison en vente du rayon (ses sous-rayons compris) prend le prix remisé, arrondi au dinar en dessous ; l&apos;ancien prix devient le prix barré.</p>
            </div>
          </div>
          <form action={action} method="post" className="pm-form">
            <input type="hidden" name="geste" value="apercu" />
            <div className="champ">
              <label htmlFor="pb-nom">Le nom de l&apos;opération</label>
              <input id="pb-nom" name="nom" required minLength={2} maxLength={60} placeholder="Ex. Promo de la rentrée" defaultValue={saisie.nom} aria-describedby="pb-nom-aide" />
              <p id="pb-nom-aide" className="aide">
                Pour l&apos;équipe et le journal. En Tunisie, les soldes se font aux périodes fixées chaque année par le ministère du Commerce ; hors de ces périodes, parlez plutôt de promotion.
              </p>
            </div>
            <div className="pm-grille pb-grille">
              <div className="champ">
                <label htmlFor="pb-rayon">Le rayon</label>
                {/* La clé : un select ne relit pas sa valeur par défaut ; après
                    l'aperçu, il repart de celle que l'adresse porte. */}
                <select id="pb-rayon" name="rayon" defaultValue={saisie.rayon} key={saisie.rayon}>
                  <option value="">Tout le catalogue ({pluriel(ecran.declinaisons, "déclinaison")})</option>
                  {ecran.rayons.map((r) => (
                    <option key={r.id} value={r.id}>{r.nom} ({pluriel(r.declinaisons, "déclinaison")})</option>
                  ))}
                </select>
              </div>
              <div className="champ">
                <label htmlFor="pb-remise">La remise</label>
                <span className="pm-unite">
                  <input id="pb-remise" name="remise" className="tabular-nums" required inputMode="numeric" placeholder="30" defaultValue={saisie.remise} aria-describedby="pb-remise-aide" />
                  <span aria-hidden="true">%</span>
                </span>
                <p id="pb-remise-aide" className="aide">De 5 à 90 %.</p>
              </div>
            </div>
            <div className="carte-pied">
              <span className="aide">Rien ne change avant « Lancer ».</span>
              <button className="btn btn-second"><Icone nom="oeil" taille={15} /> Voir ce que ça change</button>
            </div>
          </form>
        </section>
      ) : null}

      {apercu || refusApercu ? (
        <section id="apercu" className="carte pb-apercu" aria-labelledby="t-apercu">
          <div className="carte-tete">
            <div>
              <h2 id="t-apercu" className="carte-titre-icone">
                <Icone nom="oeil" /> {saisie.nom ? <>« {saisie.nom} »</> : "L'opération"} : −{saisie.remise}&nbsp;% sur {rayonChoisi ? rayonChoisi.nom : "tout le catalogue"}
              </h2>
              <p>Ce qui changera au lancement. Rien n&apos;a encore bougé.</p>
            </div>
          </div>
          {refusApercu ? (
            <p className="message message-erreur" role="alert">{refusApercu}</p>
          ) : apercu && apercu.declinaisons > 0 ? (
            <form action={action} method="post" className="pm-form">
              <input type="hidden" name="geste" value="lancer" />
              <input type="hidden" name="nom" value={saisie.nom} />
              <input type="hidden" name="rayon" value={saisie.rayon} />
              <input type="hidden" name="remise" value={saisie.remise} />
              <p className="pb-apercu-total">
                <b className="tabular-nums">{pluriel(apercu.declinaisons, "déclinaison")}</b> de {pluriel(apercu.produits, "produit")} {apercu.declinaisons > 1 ? "passent" : "passe"} en prix barrés, par exemple :
              </p>
              <ul className="pb-exemples" role="list">
                {apercu.exemples.map((x) => (
                  <li key={x.avant}>
                    <s className="tabular-nums">{formateMontant(x.avant)}</s>
                    <span aria-hidden="true">→</span><span className="sr-only">devient</span>
                    <b className="tabular-nums">{formateMontant(x.apres)} TND</b>
                  </li>
                ))}
              </ul>
              {apercu.deja_soldees > 0 ? (
                <p className="aide">
                  {pluriel(apercu.deja_soldees, "déclinaison est déjà", "déclinaisons sont déjà")} dans une autre opération en cours : {apercu.deja_soldees > 1 ? "elles restent telles quelles" : "elle reste telle quelle"}.
                </p>
              ) : null}
              {!ecran.prix_barres ? (
                <label className="pm-case">
                  <input type="checkbox" name="afficher" value="1" defaultChecked />
                  <span>
                    <b>Afficher les prix barrés sur la vitrine</b>
                    <span className="aide">Le réglage de la boutique (Vitrine et contact) : sans lui, le nouveau prix paraît seul.</span>
                  </span>
                </label>
              ) : null}
              <div className="carte-pied">
                <span className="aide">La vitrine montre les nouveaux prix d&apos;ici cinq minutes ; le panier et la commande tout de suite.</span>
                <button className="btn btn-primaire"><Icone nom="etiquette" taille={15} /> Lancer à −{saisie.remise}&nbsp;%</button>
              </div>
            </form>
          ) : (
            <p className="message">
              Rien à remiser ici : {apercu && apercu.deja_soldees > 0
                ? `${pluriel(apercu.deja_soldees, "déclinaison est déjà", "déclinaisons sont déjà")} dans une opération en cours.`
                : "aucune déclinaison en vente dans ce rayon."}
            </p>
          )}
        </section>
      ) : null}

      {finies.length > 0 ? (
        <section aria-labelledby="t-finies" className="pm-section">
          <h2 id="t-finies" className="pm-titre">Terminées <span className="compte-onglet">{finies.length}</span></h2>
          <ul className="pm-liste" role="list">
            {finies.map((s) => <CarteOperation key={s.id} s={s} {...commun} />)}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** Une opération : sa remise, son rayon, ce qu'elle a vendu, ses gestes. */
function CarteOperation({ s, vitrine, maintenant, termine, action }: {
  s: OperationPrix; vitrine: string | null; maintenant: Date; termine: boolean; action: string;
}) {
  const enCours = s.statut === "en_cours";
  const rendues = s.declinaisons - s.gardees;
  const ou = s.rayon ? `/categorie/${s.rayon.slug}` : "/catalogue";
  return (
    <li className="carte pm-carte" data-etat={enCours ? "actif" : "termine"} id={`op-${s.id}`}>
      <div className="pm-tete">
        <h3 className="pb-nom">{s.nom}</h3>
        <span className={enCours ? "ui-etat ui-etat-point ui-etat-vert" : "ui-etat"}>{enCours ? "En cours" : "Terminée"}</span>
      </div>
      <p className="pm-offre">−{s.pourcentage}&nbsp;%</p>
      <p className="pm-conditions">
        <span className="ligne-points">
          <span>{s.rayon ? <>{s.rayon.nom}{s.rayon.sous_rayons > 0 ? <span className="discret"> (et ses sous-rayons)</span> : null}</> : "Tout le catalogue"}</span>
          <span>{pluriel(s.declinaisons, "déclinaison")} de {pluriel(s.produits, "produit")}</span>
        </span>
      </p>
      <div className="pm-chiffres">
        {s.vendues > 0 ? (
          <p>
            <span className="ligne-points">
              <span><b className="tabular-nums">{s.vendues}</b> pièce{s.vendues > 1 ? "s" : ""} vendue{s.vendues > 1 ? "s" : ""}</span>
              <span><b className="tabular-nums">{formateMontant(s.ventes_millimes)}</b> TND de ventes</span>
            </span>
          </p>
        ) : (
          <p className="discret">{enCours ? "Rien de vendu pour l'instant." : "Rien de vendu pendant l'opération."}</p>
        )}
        {!enCours ? (
          <p>
            {pluriel(rendues, "prix rendu", "prix rendus")}
            {s.gardees > 0 ? ` · ${pluriel(s.gardees, "prix gardé", "prix gardés")}, changé${s.gardees > 1 ? "s" : ""} à la main pendant l'opération` : ""}
          </p>
        ) : null}
        <p className="aide">
          Lancée {quand(s.lancees_le, maintenant)}{s.lancees_par && (enCours || s.lancees_par !== s.terminees_par) ? ` par ${s.lancees_par}` : ""}
          {!enCours && s.terminees_le ? ` · terminée ${quand(s.terminees_le, maintenant)}${s.terminees_par ? ` par ${s.terminees_par}` : ""}` : ""}
        </p>
      </div>

      {enCours && (vitrine || termine) ? (
        <div className="pm-gestes">
          {vitrine ? (
            <a className="btn btn-second" href={`${vitrine}${ou}`} target="_blank" rel="noopener">
              <Icone nom="externe" /> Voir en vitrine
            </a>
          ) : null}
          {termine ? (
            <details className="pm-pli">
              <summary className="btn btn-second">Terminer</summary>
              <form action={action} method="post" className="pb-terminer">
                <input type="hidden" name="geste" value="terminer" />
                <input type="hidden" name="solde_id" value={s.id} />
                <p className="aide">
                  {s.declinaisons > 1 ? `Les ${s.declinaisons} déclinaisons retrouvent` : "La déclinaison retrouve"} leur prix d&apos;avant, sans prix barré s&apos;il n&apos;y en avait pas. Un prix changé à la main pendant l&apos;opération reste tel qu&apos;il a été saisi.
                </p>
                <button className="btn btn-primaire"><Icone nom="coche" taille={15} /> Terminer et rendre les prix</button>
              </form>
            </details>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
