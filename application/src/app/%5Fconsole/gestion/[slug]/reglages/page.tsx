import type { Metadata } from "next";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone, type NomIcone } from "@/components/console/Icone";
import { SuiviSommaire } from "@/components/console/Raccourcis";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { formateMontant } from "@/lib/prix";
import { quand } from "@/lib/gestion/libelles";
import { PEUT_MODIFIER } from "@/lib/gestion/catalogue";
import { kilos, kilosChamp, libelleTranche, lignesJournal, montantChamp, type EtatReglages, type Reglage } from "@/lib/gestion/reglages";
import { CHAMPS_LEGAUX } from "@/lib/legal";
import { EXPORTS } from "@/lib/gestion/export";

export const metadata: Metadata = { title: "Réglages" };

/* ============================================================================
   LES RÉGLAGES DE LA BOUTIQUE — « quand t'as un doute, fais les deux et
   mets-le en réglage ». Chaque alternative est posée côte à côte, avec ce
   qu'elle change pour la boutique ; une section s'enregistre d'un coup.

   Toute l'équipe lit ; propriétaire et administrateur changent. Chaque
   changement passe au journal (colonne de droite).
   ========================================================================== */

function Section({ id, icone, titre, description, children }: { id: string; icone: NomIcone; titre: string; description: string; children: React.ReactNode }) {
  return (
    <section className="carte" aria-labelledby={`t-${id}`}>
      <div className="carte-tete">
        <div>
          <h2 id={`t-${id}`} className="carte-titre-icone"><Icone nom={icone} /> {titre}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Deux (ou plus) possibilités côte à côte, en cartes. */
function Alternative({ nom, valeur, options, legende }: {
  nom: string; valeur: string; legende: string;
  options: { valeur: string; titre: string; aide: string; conseil?: string }[];
}) {
  return (
    <fieldset className="choix choix-2 rg-alternative">
      <legend>{legende}</legend>
      {options.map((o) => (
        <label key={o.valeur} className="choix-carte">
          <input type="radio" name={nom} value={o.valeur} defaultChecked={valeur === o.valeur} />
          <span>
            <b>{o.titre}{o.conseil ? <span className="rg-conseil">{o.conseil}</span> : null}</b>
            <span className="aide">{o.aide}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function Case({ cle, valeur, titre, aide }: { cle: string; valeur: boolean; titre: string; aide: string }) {
  return (
    <label className="choix-carte">
      <input type="hidden" name={`champ.${cle}`} value="1" />
      <input type="checkbox" name={cle} value="1" defaultChecked={valeur} />
      <span><b>{titre}</b><span className="aide">{aide}</span></span>
    </label>
  );
}

function Pied({ modifie, texte = "Enregistrer" }: { modifie: boolean; texte?: string }) {
  return modifie ? (
    <div className="carte-pied">
      <span className="aide">La boutique en tient compte dans les cinq minutes.</span>
      <button className="btn btn-primaire">{texte}</button>
    </div>
  ) : null;
}

export default async function Reglages({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_reglages", { p_boutique_id: boutique.boutique_id });
  if (error) throw new Error(`Réglages illisibles : ${error.message}`);
  const e = data as EtatReglages;

  const modifie = PEUT_MODIFIER.includes(boutique.role);
  const action = `/gestion/${slug}/reglages/enregistrer`;
  const r = new Map<string, Reglage>(e.reglages.map((x) => [x.cle, x]));
  const v = (cle: string) => r.get(cle)?.valeur;
  const parZone = v("livraison.mode_frais") === "zone";
  const zonesParId = new Map(e.zones.map((z) => [z.id, z.nom]));
  const gouvParCode = new Map(e.gouvernorats.map((g) => [g.code, g.nom]));
  const sansZone = e.gouvernorats.filter((g) => !g.zone_id).length;
  const konnect = r.get("paiement.konnect_actif");
  const retraitActif = Boolean(r.get("retrait.adresse")?.module_actif);
  const savActif = Boolean(r.get("sav.garantie_mois")?.module_actif);
  const avisActif = Boolean(r.get("avis.moderation")?.module_actif);
  const retraitIncomplet = retraitActif && (!String(v("retrait.adresse") ?? "").trim() || !String(v("retrait.ville") ?? "").trim());
  const maintenant = new Date();
  const prefixe = String(v("commande.prefixe_numero") ?? "");
  const manquants = CHAMPS_LEGAUX.filter((c) => !String(v(c.cle) ?? "").trim()).map((c) => c.libelle);
  const auPoids = Boolean(v("livraison.supplement_poids"));
  const dernier = e.tranches.at(-1);
  // Les déclinaisons en vente sans poids : elles pèsent 0 kg dans le supplément.
  const { count: sansPoids } = await sb.from("variantes").select("id", { count: "exact", head: true })
    .eq("boutique_id", boutique.boutique_id).eq("actif", true).is("poids_grammes", null);

  // Le sommaire : la colonne de droite sur ordinateur, des pastilles en tête
  // sur téléphone.
  const sections: [string, string, string][] = [
    ["commandes", "Commandes", "commandes"],
    ["livraison", "Livraison", "camion"],
    ["zones", "Zones de livraison", "lieu"],
    ["gouvernorats", "Gouvernorats", "domaine"],
    ["poids", "Supplément au poids", "colis"],
    ...(retraitActif ? [["retrait", "Retrait en magasin", "boutique"] as [string, string, string]] : []),
    ...(savActif ? [["sav", "Service après-vente", "outil"] as [string, string, string]] : []),
    ...(avisActif ? [["avis", "Avis clients", "etoile"] as [string, string, string]] : []),
    ["paiement", "Paiement", "billet"],
    ["vitrine", "Vitrine et contact", "boutique"],
    ["legal", "Informations légales", "fichier"],
    ...(modifie ? [["donnees", "Vos données", "importer"] as [string, string, string]] : []),
    ["journal", "Journal", "journal"],
  ];

  return (
    <>
      <EnTetePage
        titre="Réglages"
        description="Ce qui s'applique à la boutique et à ses commandes. Chaque changement est gardé au journal, avec son auteur."
      />

      <div className="pile">
        {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
        {!modifie ? (
          <p className="message">Lecture seule : le propriétaire ou l&apos;administrateur de la boutique change les réglages.</p>
        ) : null}

        <nav className="rg-puces" id="rg-puces" aria-label="Aller à une section">
          <SuiviSommaire sommaire="rg-puces" />
          {sections.map(([id, titre]) => (
            <a key={id} href={`#t-${id}`}>{titre}</a>
          ))}
        </nav>

        <div className="grille-2">
          <div className="pile">
            {/* ---------------- Commandes ---------------- */}
            <Section id="commandes" icone="commandes" titre="Commandes" description="Qui peut commander, et ce qui se passe une fois la commande passée.">
              <form action={action} method="post">
                <input type="hidden" name="section" value="commandes" />
                <fieldset className="pile rg-corps" disabled={!modifie}>
                  <Alternative
                    nom="compte.obligatoire" legende="Pour commander" valeur={v("compte.obligatoire") ? "1" : "0"}
                    options={[
                      { valeur: "1", titre: "Compte obligatoire", conseil: "Conseillé", aide: "L'acheteur confirme son numéro par un code SMS. Moins de refus à la livraison." },
                      { valeur: "0", titre: "Commande en invité", aide: "Plus rapide pour l'acheteur, mais plus de commandes fantaisistes à appeler." },
                    ]}
                  />
                  <Alternative
                    nom="commande.mode_confirmation" legende="Une fois la commande passée" valeur={String(v("commande.mode_confirmation"))}
                    options={[
                      { valeur: "telephonique", titre: "Confirmée par téléphone", conseil: "Conseillé", aide: "Chaque commande attend votre appel avant d'être préparée." },
                      { valeur: "automatique", titre: "Confirmée d'office", aide: "La commande passe seule en « à préparer ». Pour une clientèle connue." },
                    ]}
                  />
                  <Alternative
                    nom="commande.achat_express" legende="Depuis la fiche d'un produit" valeur={v("commande.achat_express") ? "1" : "0"}
                    options={[
                      { valeur: "0", titre: "Par le panier", aide: "L'acheteur ajoute au panier, puis commande. Plusieurs articles, un seul colis." },
                      { valeur: "1", titre: "Achat express en plus", aide: "«\u00a0Commander maintenant\u00a0» à côté de «\u00a0Ajouter au panier\u00a0» : cet article seul, droit à la commande. Plus rapide sur téléphone." },
                    ]}
                  />
                  <div className="champ rg-court">
                    <label htmlFor="max_en_attente">Commandes en attente par numéro</label>
                    <input id="max_en_attente" name="commande.max_en_attente" type="number" min={0} max={50} defaultValue={Number(v("commande.max_en_attente") ?? 3)} />
                    <span className="aide">Au-delà, un même numéro ne commande plus tant que ses commandes ne sont pas confirmées ou annulées. 0 = sans limite.</span>
                  </div>
                  <p className="aide rg-fixe">
                    <Icone nom="cle" taille={14} /> Numéros de commande : <b className="font-medium">{prefixe || "préfixe automatique"}-{maintenant.getFullYear()}-00001</b> — réglé par SkanEcom.
                  </p>
                </fieldset>
                <Pied modifie={modifie} />
              </form>
            </Section>

            {/* ---------------- Livraison ---------------- */}
            <Section id="livraison" icone="camion" titre="Livraison" description="Ce que paie l'acheteur pour être livré, et par qui.">
              <form action={action} method="post">
                <input type="hidden" name="section" value="livraison" />
                <fieldset className="pile rg-corps" disabled={!modifie}>
                  <Alternative
                    nom="livraison.mode_frais" legende="Frais de livraison" valeur={String(v("livraison.mode_frais"))}
                    options={[
                      { valeur: "fixe", titre: "Même tarif partout", aide: "Un seul montant, quel que soit le gouvernorat." },
                      { valeur: "zone", titre: "Tarif par zone", aide: "Grand Tunis, Sahel, Sud… chaque zone son tarif et son délai (ci-dessous)." },
                    ]}
                  />
                  <div className="grille-champs">
                    <div className="champ">
                      <label htmlFor="frais_fixes">Tarif de livraison <span className="discret">TND</span></label>
                      <input id="frais_fixes" name="livraison.frais_fixes_millimes" inputMode="decimal" defaultValue={montantChamp(v("livraison.frais_fixes_millimes"))} placeholder="7,000" />
                      <span className="aide">{parZone ? "Pour un gouvernorat qui n'est dans aucune zone." : "Partout en Tunisie."}</span>
                    </div>
                    <div className="champ">
                      <label htmlFor="seuil">Livraison offerte dès <span className="discret">TND</span></label>
                      <input id="seuil" name="livraison.seuil_gratuite_millimes" inputMode="decimal" defaultValue={montantChamp(v("livraison.seuil_gratuite_millimes"))} placeholder="Jamais" />
                      <span className="aide">D&apos;achats. Vide = jamais offerte.</span>
                    </div>
                  </div>
                  <div className="champ">
                    <label htmlFor="transporteur">Transporteur <span className="discret">(facultatif)</span></label>
                    <input id="transporteur" name="livraison.transporteur" defaultValue={String(v("livraison.transporteur") ?? "")} placeholder="Ex. Aramex, First Delivery…" maxLength={60} />
                    <span className="aide">Affiché à l&apos;acheteur et proposé à l&apos;expédition.</span>
                  </div>
                  <div className="choix">
                    <Case cle="livraison.supplement_poids" valeur={auPoids} titre="Supplément selon le poids du colis"
                      aide="Le supplément de sa tranche (plus bas) s'ajoute au tarif. La livraison offerte reste offerte, supplément compris." />
                  </div>
                </fieldset>
                <Pied modifie={modifie} />
              </form>
            </Section>

            {/* ---------------- Zones ---------------- */}
            <section className="carte" aria-labelledby="t-zones" data-eteinte={parZone ? undefined : ""}>
              <div className="carte-tete">
                <div>
                  <h2 id="t-zones" className="carte-titre-icone">
                    <Icone nom="lieu" /> Zones de livraison
                    {parZone ? <span className="ui-etat ui-etat-point ui-etat-vert">Appliquées</span> : <span className="ui-etat">Non appliquées</span>}
                  </h2>
                  <p>{parZone
                    ? "Chaque zone a son tarif et son délai, annoncés à l'acheteur dès qu'il choisit son gouvernorat."
                    : "Préparées ici, elles ne s'appliquent qu'avec « Tarif par zone » (ci-dessus)."}</p>
                </div>
              </div>
              <ul className="rg-zones" role="list">
                {e.zones.map((z) => (
                  <li key={z.id} className="rg-zone">
                    <form id={`zone-${z.id}`} action={action} method="post">
                      <input type="hidden" name="section" value="zone" />
                      <input type="hidden" name="zone_id" value={z.id} />
                      <fieldset className="rg-zone-champs" disabled={!modifie}>
                        <div className="champ rg-zone-nom">
                          <label htmlFor={`zn-${z.id}`}>Zone</label>
                          <input id={`zn-${z.id}`} name="nom" defaultValue={z.nom} required maxLength={60} />
                        </div>
                        <div className="champ">
                          <label htmlFor={`zf-${z.id}`}>Tarif <span className="discret">TND</span></label>
                          <input id={`zf-${z.id}`} name="frais" inputMode="decimal" defaultValue={formateMontant(z.frais)} required />
                        </div>
                        <div className="champ rg-delai">
                          <span className="rg-etiquette" aria-hidden="true">Délai <span className="discret">jours</span></span>
                          <span className="rg-delai-entrees">
                            <input aria-label={`${z.nom} : délai au plus tôt, en jours`} name="delai_min" type="number" min={0} max={60} defaultValue={z.delai_min ?? ""} />
                            <span aria-hidden="true">à</span>
                            <input aria-label={`${z.nom} : délai au plus tard, en jours`} name="delai_max" type="number" min={0} max={60} defaultValue={z.delai_max ?? ""} />
                          </span>
                        </div>
                        <label className="rg-actif">
                          <input type="checkbox" name="actif" value="1" defaultChecked={z.actif} /> Active
                        </label>
                      </fieldset>
                    </form>
                    <div className="rg-zone-pied">
                      <span className="aide">{z.gouvernorats} gouvernorat{z.gouvernorats > 1 ? "s" : ""}{z.actif ? "" : " · inactive : tarif fixe"}</span>
                      {modifie ? (
                        <span className="rg-zone-gestes">
                          <form action={action} method="post">
                            <input type="hidden" name="section" value="zone_supprimer" />
                            <input type="hidden" name="zone_id" value={z.id} />
                            <button className="btn btn-fantome btn-petit ph-retirer" aria-label={`Supprimer la zone ${z.nom}`}>
                              <Icone nom="corbeille" taille={14} /> Supprimer
                            </button>
                          </form>
                          <button form={`zone-${z.id}`} className="btn btn-second btn-petit">Enregistrer</button>
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              {e.zones.length === 0 ? <p className="discret rg-vide">Aucune zone pour le moment.</p> : null}
              {modifie ? (
                <form action={action} method="post" className="rg-zone-ajout">
                  <input type="hidden" name="section" value="zone" />
                  <div className="champ rg-zone-nom">
                    <label htmlFor="zn-neuve">Nouvelle zone</label>
                    <input id="zn-neuve" name="nom" required maxLength={60} placeholder="Ex. Grand Tunis" />
                  </div>
                  <div className="champ">
                    <label htmlFor="zf-neuve">Tarif <span className="discret">TND</span></label>
                    <input id="zf-neuve" name="frais" inputMode="decimal" required placeholder="7,000" />
                  </div>
                  <div className="champ rg-delai">
                    <span className="rg-etiquette" aria-hidden="true">Délai <span className="discret">jours</span></span>
                    <span className="rg-delai-entrees">
                      <input aria-label="Nouvelle zone : délai au plus tôt, en jours" name="delai_min" type="number" min={0} max={60} placeholder="1" />
                      <span aria-hidden="true">à</span>
                      <input aria-label="Nouvelle zone : délai au plus tard, en jours" name="delai_max" type="number" min={0} max={60} placeholder="3" />
                    </span>
                  </div>
                  <button className="btn btn-second"><Icone nom="plus" taille={14} /> Ajouter la zone</button>
                </form>
              ) : null}
            </section>

            {/* ---------------- Gouvernorats ---------------- */}
            <section className="carte" aria-labelledby="t-gouvernorats" data-eteinte={parZone ? undefined : ""}>
              <div className="carte-tete">
                <div>
                  <h2 id="t-gouvernorats" className="carte-titre-icone">
                    <Icone nom="domaine" /> Gouvernorats
                    {sansZone ? <span className="ui-etat ui-etat-ambre">{sansZone} au tarif fixe</span> : null}
                  </h2>
                  <p>La zone de chacun des 24 gouvernorats. Sans zone, c&apos;est le tarif de livraison ci-dessus : jamais la gratuité par oubli.</p>
                </div>
              </div>
              <form action={action} method="post">
                <input type="hidden" name="section" value="gouvernorats" />
                <fieldset className="rg-gouvernorats" disabled={!modifie || e.zones.length === 0}>
                  <legend className="sr-only">Zone de chaque gouvernorat</legend>
                  {e.gouvernorats.map((g) => (
                    <div key={g.code} className="rg-gouv">
                      <label htmlFor={`g-${g.code}`}>{g.nom}</label>
                      <select id={`g-${g.code}`} name={`g.${g.code}`} className="entree" defaultValue={g.zone_id ?? ""}>
                        <option value="">Tarif fixe</option>
                        {e.zones.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}
                      </select>
                    </div>
                  ))}
                </fieldset>
                {modifie && e.zones.length ? (
                  <div className="carte-pied">
                    <span className="aide">Seuls les gouvernorats changés sont enregistrés.</span>
                    <button className="btn btn-primaire">Enregistrer les gouvernorats</button>
                  </div>
                ) : null}
              </form>
            </section>

            {/* ---------------- Supplément au poids ---------------- */}
            <section className="carte" aria-labelledby="t-poids" data-eteinte={auPoids ? undefined : ""}>
              <div className="carte-tete">
                <div>
                  <h2 id="t-poids" className="carte-titre-icone">
                    <Icone nom="colis" /> Supplément au poids
                    {auPoids ? <span className="ui-etat ui-etat-point ui-etat-vert">Appliqué</span> : <span className="ui-etat">Non appliqué</span>}
                  </h2>
                  <p>{auPoids
                    ? "Le colis pèse la somme de ses articles ; le supplément de sa tranche s'ajoute au tarif de livraison, annoncé à l'acheteur avant qu'il commande."
                    : "Préparées ici, les tranches ne s'appliquent qu'avec « Supplément selon le poids du colis » (Livraison, ci-dessus)."}</p>
                </div>
              </div>
              {sansPoids ? (
                <p className={`message ${auPoids ? "rg-manque" : ""} rg-poids-manque`} role="note">
                  {sansPoids} déclinaison{sansPoids > 1 ? "s actives" : " active"} sans poids : {sansPoids > 1 ? "elles comptent" : "elle compte"} pour 0 kg.{" "}
                  <a href={`/gestion/${slug}/produits`}>Renseigner au catalogue</a>
                </p>
              ) : null}
              <fieldset className="rg-tranches" disabled={!modifie}>
                <legend className="sr-only">Les tranches de poids</legend>
                <ul role="list">
                  {e.tranches.map((t, i) => {
                    const avant = i > 0 ? e.tranches[i - 1].jusqu_a_grammes : null;
                    const plage = t.jusqu_a_grammes === null
                      ? (avant ? `Plus de ${kilos(avant)}` : "Tous les colis")
                      : (avant ? `Plus de ${kilos(avant)}, jusqu'à ${kilos(t.jusqu_a_grammes)}` : `Jusqu'à ${kilos(t.jusqu_a_grammes)}`);
                    const nom = libelleTranche(t.jusqu_a_grammes);
                    const f = `tranche-${t.id}`;
                    return (
                      <li key={t.id} className="rg-tranche">
                        <form id={f} action={action} method="post">
                          <input type="hidden" name="section" value="tranche" />
                          <input type="hidden" name="tranche_id" value={t.id} />
                        </form>
                        <span className="rg-tranche-plage">
                          {plage}
                          <span className="aide">{t.supplement ? `+ ${formateMontant(t.supplement)} TND` : "Sans supplément"}</span>
                        </span>
                        <span className="rg-borne">
                          jusqu&apos;à
                          <input form={f} className="entree" name="jusqu_a" inputMode="decimal" defaultValue={kilosChamp(t.jusqu_a_grammes)}
                            placeholder="au-delà" aria-label={`Tranche ${nom} : poids maximal, en kg (vide : au-delà)`} />
                          kg
                        </span>
                        <span className="rg-borne rg-borne-tnd">
                          +
                          <input form={f} className="entree" name="supplement" inputMode="decimal" defaultValue={formateMontant(t.supplement)} required
                            aria-label={`Tranche ${nom} : supplément, en TND`} />
                          TND
                        </span>
                        {modifie ? (
                          <span className="rg-tranche-gestes">
                            <button form={f} className="btn btn-second btn-petit">Enregistrer</button>
                            <form action={action} method="post">
                              <input type="hidden" name="section" value="tranche_supprimer" />
                              <input type="hidden" name="tranche_id" value={t.id} />
                              <button className="btn-icone ph-retirer" aria-label={`Supprimer la tranche ${nom}`} title="Supprimer">
                                <Icone nom="corbeille" taille={15} />
                              </button>
                            </form>
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                  {modifie && e.tranches.length < 12 ? (
                    <li className="rg-tranche rg-tranche-ajout">
                      <form id="tranche-neuve" action={action} method="post">
                        <input type="hidden" name="section" value="tranche" />
                      </form>
                      <span className="rg-tranche-plage">
                        Nouvelle tranche
                        <span className="aide">« jusqu&apos;à » vide : au-delà de toutes.</span>
                      </span>
                      <span className="rg-borne">
                        jusqu&apos;à
                        <input id="tj-neuve" form="tranche-neuve" className="entree" name="jusqu_a" inputMode="decimal" placeholder={dernier ? "au-delà" : "5"}
                          aria-label="Nouvelle tranche : poids maximal, en kg (vide : au-delà)" />
                        kg
                      </span>
                      <span className="rg-borne rg-borne-tnd">
                        +
                        <input id="ts-neuve" form="tranche-neuve" className="entree" name="supplement" inputMode="decimal" required placeholder="3,000"
                          aria-label="Nouvelle tranche : supplément, en TND" />
                        TND
                      </span>
                      <span className="rg-tranche-gestes">
                        <button form="tranche-neuve" className="btn btn-second btn-petit"><Icone nom="plus" taille={14} /> Ajouter la tranche</button>
                      </span>
                    </li>
                  ) : null}
                </ul>
              </fieldset>
              {e.tranches.length === 0 ? (
                <p className="aide rg-fixe mt-4">
                  <Icone nom="colis" taille={14} /> Par exemple : jusqu&apos;à 5 kg sans supplément, jusqu&apos;à 20 kg + 3,000 TND, au-delà + 8,000 TND.
                </p>
              ) : dernier && dernier.jusqu_a_grammes !== null ? (
                <p className="aide rg-fixe mt-4">
                  <Icone nom="alerte" taille={14} /> Plus lourd que {kilos(dernier.jusqu_a_grammes)} : le supplément de la dernière tranche s&apos;applique.
                </p>
              ) : null}
            </section>
            {/* ---------------- Retrait en magasin (module) ---------------- */}
            {retraitActif ? (
              <Section id="retrait" icone="boutique" titre="Retrait en magasin"
                description="L'acheteur commande en ligne et vient chercher sa commande au comptoir : gratuit, payé au retrait.">
                <form action={action} method="post">
                  <input type="hidden" name="section" value="retrait" />
                  <fieldset className="pile rg-corps" disabled={!modifie}>
                    {retraitIncomplet ? (
                      <p className="message rg-manque" role="note">
                        Sans l&apos;adresse et la ville du magasin, la vitrine ne propose pas encore le retrait.
                      </p>
                    ) : null}
                    <div className="grille-champs">
                      <div className="champ">
                        <label htmlFor="retrait_adresse">Adresse du magasin</label>
                        <input id="retrait_adresse" name="retrait.adresse" defaultValue={String(v("retrait.adresse") ?? "")} maxLength={200}
                          placeholder="Ex. Route de Tunis, km 3" />
                      </div>
                      <div className="champ">
                        <label htmlFor="retrait_ville">Ville</label>
                        <input id="retrait_ville" name="retrait.ville" defaultValue={String(v("retrait.ville") ?? "")} maxLength={80} placeholder="Ex. Sfax" />
                      </div>
                    </div>
                    <div className="champ">
                      <label htmlFor="retrait_horaires">Horaires d&apos;ouverture</label>
                      <input id="retrait_horaires" name="retrait.horaires" defaultValue={String(v("retrait.horaires") ?? "")} maxLength={200}
                        placeholder="Du lundi au samedi, de 8 h à 18 h" />
                      <span className="aide">Affichés à la commande et sur sa page de suivi.</span>
                    </div>
                    <div className="champ rg-court">
                      <label htmlFor="retrait_delai">Prête en</label>
                      <span className="rg-unite">
                        <input id="retrait_delai" name="retrait.delai_heures" type="number" min={1} max={720} inputMode="numeric"
                          defaultValue={Number(v("retrait.delai_heures") ?? 24)} />
                        <span>heures</span>
                      </span>
                      <span className="aide">Le temps de préparer une commande confirmée. L&apos;acheteur lit « prête sous 2 heures ».</span>
                    </div>
                  </fieldset>
                  <Pied modifie={modifie} />
                </form>
              </Section>
            ) : null}

            {/* ---------------- Service après-vente (module) ---------------- */}
            {savActif ? (
              <Section id="sav" icone="outil" titre="Service après-vente"
                description="Vos clients signalent un problème sur un article livré depuis « Mes commandes » ; vous traitez la demande dans SAV.">
                <form action={action} method="post">
                  <input type="hidden" name="section" value="sav" />
                  <fieldset className="pile rg-corps" disabled={!modifie}>
                    <div className="champ rg-court">
                      <label htmlFor="garantie">Garantie annoncée</label>
                      <span className="rg-unite">
                        <input id="garantie" name="sav.garantie_mois" type="number" min={0} max={120} inputMode="numeric"
                          defaultValue={Number(v("sav.garantie_mois") ?? 0)} />
                        <span>mois</span>
                      </span>
                      <span className="aide">Sur la vitrine (« Garantie 12 mois ») et sur chaque demande : encore couverte ou non. 0 = la garantie légale et celle du fabricant, sans durée annoncée.</span>
                    </div>
                    <p className="aide rg-fixe">
                      <Icone nom="outil" taille={14} /> <span><a href={`/gestion/${slug}/sav`}>Les demandes des clients</a> : à rappeler, en cours, closes.</span>
                    </p>
                  </fieldset>
                  <Pied modifie={modifie} />
                </form>
              </Section>
            ) : null}

            {/* ---------------- Avis clients (module) ---------------- */}
            {avisActif ? (
              <Section id="avis" icone="etoile" titre="Avis clients"
                description="Seul un client livré note l'article reçu, depuis « Mes commandes » ; vous publiez, écartez ou répondez dans Avis.">
                <form action={action} method="post">
                  <input type="hidden" name="section" value="avis" />
                  <fieldset className="pile rg-corps" disabled={!modifie}>
                    <Alternative
                      nom="avis.moderation" legende="Quand un client donne son avis" valeur={String(v("avis.moderation") ?? "a_priori")}
                      options={[
                        { valeur: "a_priori", titre: "Relu avant publication", conseil: "Conseillé", aide: "L'avis attend votre relecture dans Avis ; rien ne paraît sans vous." },
                        { valeur: "automatique", titre: "Publié aussitôt", aide: "L'avis paraît tout de suite sur la fiche ; vous pouvez l'écarter ensuite." },
                      ]}
                    />
                    <p className="aide rg-fixe">
                      <Icone nom="etoile" taille={14} /> <span><a href={`/gestion/${slug}/avis`}>Les avis des clients</a> : à relire, publiés, écartés.</span>
                    </p>
                  </fieldset>
                  <Pied modifie={modifie} />
                </form>
              </Section>
            ) : null}

            {/* ---------------- Paiement ---------------- */}
            <Section id="paiement" icone="billet" titre="Paiement" description="Comment l'acheteur règle sa commande.">
              <form action={action} method="post">
                <input type="hidden" name="section" value="paiement" />
                <fieldset className="choix rg-corps" disabled={!modifie}>
                  <legend className="sr-only">Moyens de paiement</legend>
                  <Case cle="paiement.cod_actif" valeur={Boolean(v("paiement.cod_actif"))} titre="Paiement à la livraison"
                    aide="L'acheteur paie le livreur en espèces. Toujours au moins un moyen de paiement actif." />
                  {konnect?.module_actif ? (
                    <Case cle="paiement.konnect_actif" valeur={Boolean(konnect.valeur)} titre="Paiement en ligne (Konnect)"
                      aide="Carte bancaire ou e-dinar, sur le compte marchand de la boutique." />
                  ) : (
                    <div className="choix-carte rg-indispo" aria-disabled="true">
                      <input type="checkbox" disabled aria-label="Paiement en ligne (Konnect), non disponible" />
                      <span>
                        <b>Paiement en ligne (Konnect) <span className="ui-etat">Bientôt</span></b>
                        <span className="aide">Prévu, mais à activer par SkanEcom une fois le compte marchand de la boutique ouvert.</span>
                      </span>
                    </div>
                  )}
                </fieldset>
                <Pied modifie={modifie} />
              </form>
            </Section>

            {/* ---------------- Vitrine et contact ---------------- */}
            <Section id="vitrine" icone="boutique" titre="Vitrine et contact" description="Ce que la boutique affiche, et comment la joindre.">
              <form action={action} method="post">
                <input type="hidden" name="section" value="vitrine" />
                <fieldset className="pile rg-corps" disabled={!modifie}>
                  <div className="choix">
                    <Case cle="catalogue.afficher_prix_barres" valeur={Boolean(v("catalogue.afficher_prix_barres"))} titre="Afficher les prix barrés"
                      aide="L'ancien prix, barré, à côté du prix payé — pour les déclinaisons qui en ont un." />
                  </div>
                  <div className="grille-champs">
                    <div className="champ">
                      <label htmlFor="whatsapp">WhatsApp</label>
                      <input id="whatsapp" name="contact.whatsapp" inputMode="tel" defaultValue={String(v("contact.whatsapp") ?? "")} placeholder="21612345678" />
                      <span className="aide">Indicatif compris ; un numéro à 8 chiffres reçoit le 216.</span>
                    </div>
                    <div className="champ">
                      <label htmlFor="telephone">Téléphone de la boutique</label>
                      <input id="telephone" name="contact.telephone" inputMode="tel" defaultValue={String(v("contact.telephone") ?? "")} placeholder="21671234567" />
                      <span className="aide">Affiché sur la vitrine.</span>
                    </div>
                  </div>
                  <div className="champ">
                    <label htmlFor="revendeur">Revendeur officiel <span className="discret">(facultatif)</span></label>
                    <input id="revendeur" name="catalogue.revendeur_officiel" defaultValue={String(v("catalogue.revendeur_officiel") ?? "")} maxLength={80}
                      placeholder="Ex. Revendeur officiel DeWalt" />
                    <span className="aide">En tête de la vitrine et sur les fiches produit, si la marque vous a agréé.</span>
                  </div>
                </fieldset>
                <Pied modifie={modifie} />
              </form>
            </Section>

            {/* ---------------- Informations légales ---------------- */}
            <Section id="legal" icone="fichier" titre="Informations légales"
              description="Elles composent les mentions légales, les conditions de vente et la politique de confidentialité de la boutique, que l'acheteur accepte en commandant.">
              <form action={action} method="post">
                <input type="hidden" name="section" value="legal" />
                <fieldset className="pile rg-corps" disabled={!modifie}>
                  {manquants.length ? (
                    <p className="message rg-manque">
                      À compléter avant d&apos;ouvrir : {manquants.join(", ")}. Tant qu&apos;elles manquent, ces lignes sont absentes des pages légales.
                    </p>
                  ) : (
                    <p className="message message-succes">L&apos;identité légale est complète.</p>
                  )}
                  <div className="grille-champs">
                    <div className="champ">
                      <label htmlFor="raison_sociale">Raison sociale</label>
                      <input id="raison_sociale" name="legal.raison_sociale" defaultValue={String(v("legal.raison_sociale") ?? "")} maxLength={300} placeholder="Ex. Maymar SARL" />
                    </div>
                    <div className="champ">
                      <label htmlFor="forme_juridique">Forme juridique <span className="discret">(facultatif)</span></label>
                      <input id="forme_juridique" name="legal.forme_juridique" defaultValue={String(v("legal.forme_juridique") ?? "")} maxLength={300} placeholder="SARL, SUARL, entreprise individuelle…" />
                    </div>
                  </div>
                  <div className="champ">
                    <label htmlFor="adresse_legale">Adresse du siège</label>
                    <input id="adresse_legale" name="legal.adresse" defaultValue={String(v("legal.adresse") ?? "")} maxLength={300} placeholder="Ex. 12 rue de Marseille, 1000 Tunis" />
                  </div>
                  <div className="grille-champs">
                    <div className="champ">
                      <label htmlFor="rne">Identifiant unique (RNE)</label>
                      <input id="rne" name="legal.identifiant_rne" defaultValue={String(v("legal.identifiant_rne") ?? "")} maxLength={300} />
                    </div>
                    <div className="champ">
                      <label htmlFor="matricule">Matricule fiscal</label>
                      <input id="matricule" name="legal.matricule_fiscal" defaultValue={String(v("legal.matricule_fiscal") ?? "")} maxLength={300} />
                    </div>
                  </div>
                  <div className="champ">
                    <label htmlFor="email_legal">Courriel de la boutique</label>
                    <input id="email_legal" name="legal.email" type="email" defaultValue={String(v("legal.email") ?? "")} maxLength={300} placeholder="contact@maboutique.tn" />
                    <span className="aide">Pour les réclamations, la rétractation et les demandes sur les données personnelles.</span>
                  </div>
                  <div className="grille-champs">
                    <div className="champ">
                      <label htmlFor="retractation">Délai de rétractation <span className="discret">jours ouvrables</span></label>
                      <input id="retractation" name="legal.retractation_jours" type="number" min={10} max={60} defaultValue={Number(v("legal.retractation_jours") ?? 10)} />
                      <span className="aide">Dix au moins (loi n° 2000-83), à compter de la réception.</span>
                    </div>
                    <div className="champ">
                      <label htmlFor="retour_frais">Frais de retour</label>
                      <select id="retour_frais" name="legal.retour_frais" className="entree" defaultValue={String(v("legal.retour_frais") ?? "client")}>
                        <option value="client">À la charge du client (la règle)</option>
                        <option value="boutique">Offerts par la boutique</option>
                      </select>
                      <span className="aide">En cas de rétractation.</span>
                    </div>
                  </div>
                  <div className="champ">
                    <label htmlFor="inpdp">Référence de la déclaration INPDP <span className="discret">(une fois faite)</span></label>
                    <input id="inpdp" name="legal.inpdp_reference" defaultValue={String(v("legal.inpdp_reference") ?? "")} maxLength={300} />
                  </div>
                  <p className="aide rg-fixe">
                    <Icone nom="alerte" taille={14} /> Modèle proposé par SkanEcom : faites relire vos pages légales par votre conseil avant d&apos;ouvrir la boutique.
                  </p>
                </fieldset>
                <Pied modifie={modifie} />
              </form>
            </Section>

            {/* ---------------- Vos données (B8) ---------------- */}
            {modifie ? (
              <Section id="donnees" icone="importer" titre="Vos données"
                description="Tout ce que la boutique a enregistré, dans un tableur : ses données sont à elle, elle les emporte quand elle veut.">
                <ul className="rg-exports" role="list">
                  {Object.entries(EXPORTS).filter(([, x]) => !x.module || (x.module === "sav" && savActif)).map(([cle, x]) => (
                    <li key={cle} className="rg-export">
                      <span className="rg-export-texte">
                        <b>{x.titre}</b>
                        <span className="aide">{x.aide}</span>
                      </span>
                      <a className="btn btn-second btn-petit" href={`/gestion/${slug}/export/${cle}`} download>
                        <Icone nom="fichier" taille={14} /> Télécharger (CSV)
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="aide rg-fixe mt-4">
                  <Icone nom="bouclier" taille={14} /> Ces fichiers contiennent les coordonnées de vos clients : gardez-les pour vous. Chaque export est noté au journal.
                </p>
              </Section>
            ) : null}
          </div>

          <aside className="pile rg-aside">
            <section className="carte" aria-labelledby="t-journal">
              <h2 id="t-journal" className="carte-titre-icone"><Icone nom="journal" /> Journal des réglages</h2>
              {e.journal.length === 0 ? (
                <p className="discret mt-3 text-petit">Aucun changement : la boutique suit les réglages de départ de SkanEcom.</p>
              ) : (
                <ol className="bo-journal mt-3">
                  {e.journal.map((j, i) => (
                    <li key={`${j.le}-${i}`}>
                      <span className="bo-journal-point" aria-hidden="true" />
                      <span className="bo-journal-texte rg-lignes">
                        {lignesJournal(j, zonesParId, gouvParCode).map((l, k) => <span key={k}>{l}</span>)}
                      </span>
                      <span className="bo-journal-meta">{j.auteur ?? "SkanEcom"} · {quand(j.le, maintenant)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <nav className="carte rg-sommaire" id="rg-sommaire" aria-label="Sections des réglages">
              <SuiviSommaire sommaire="rg-sommaire" />
              <ol>
                {sections.map(([id, titre, icone]) => (
                  <li key={id}>
                    <a href={`#t-${id}`}><Icone nom={icone as NomIcone} taille={15} /> {titre}</a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>
        </div>
      </div>
    </>
  );
}
