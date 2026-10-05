import Link from "next/link";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { formateMontant } from "@/lib/prix";
import { quand } from "@/lib/gestion/libelles";
import { PEUT_MODIFIER } from "@/lib/gestion/catalogue";
import { SECTIONS, kilos, kilosChamp, libelleTranche, lignesJournal, montantChamp, type EtatReglages, type Reglage } from "@/lib/gestion/reglages";
import { GROUPES, groupeDe, type Groupe } from "@/lib/gestion/reglages-ecrans";
import { CHAMPS_LEGAUX } from "@/lib/legal";
import { EXPORTS } from "@/lib/gestion/export";

/* ============================================================================
   LES RÉGLAGES DE LA BOUTIQUE — « quand t'as un doute, fais les deux et
   mets-le en réglage ». Chaque alternative est posée côte à côte, avec ce
   qu'elle change pour la boutique ; une section s'enregistre d'un coup.

   L'accueil des réglages : une tuile par thème, ce qui est réglé aujourd'hui
   en une ligne, et ce qui manque avant d'ouvrir. Chaque thème a sa page, la
   liste des thèmes à gauche sur ordinateur (lib/gestion/reglages-ecrans.ts).

   Toute l'équipe lit ; propriétaire et administrateur changent. Chaque
   changement passe au journal.
   ========================================================================== */

type Retour = { ok?: string; erreur?: string } | null;

/** Le thème d'une clé de réglage (« vitrine.lettre » → « vitrine »), pour
 *  trier le journal page par page. */
function groupeDeCle(cle: string): Groupe | null {
  for (const [section, champs] of Object.entries(SECTIONS)) {
    if (champs.some((c) => c.cle === cle)) return groupeDe(section);
  }
  return null;
}
export type MessagesReglages = { ok?: string; erreur?: string; dans?: string };

/** Le message de l'enregistrement d'une carte, sous son titre. */
function MessageRetour({ retour }: { retour?: Retour }) {
  if (retour?.ok) return <p className="message message-succes rg-retour" role="status">{retour.ok}</p>;
  if (retour?.erreur) return <p className="message message-erreur rg-retour" role="alert">{retour.erreur}</p>;
  return null;
}

function Section({ id, titre, description, etat, retour, children }: {
  id: string; titre: string; description: React.ReactNode;
  /** Une pastille après le titre (« Appliquées », « Non appliqué »). */
  etat?: React.ReactNode;
  /** Le message de l'enregistrement de cette section, sous son titre. */
  retour?: Retour;
  children: React.ReactNode;
}) {
  return (
    <section className="carte rg-section" aria-labelledby={`t-${id}`}>
      <div className="carte-tete">
        <div>
          <h2 id={`t-${id}`} className="rg-section-titre">{titre}{etat}</h2>
          <p>{description}</p>
        </div>
      </div>
      <MessageRetour retour={retour} />
      {children}
    </section>
  );
}

/** Deux (ou plus) possibilités côte à côte, en cartes. */
function Alternative({ nom, valeur, options, legende }: {
  nom: string; valeur: string; legende: string;
  options: { valeur: string; titre: string; aide: string; conseil?: string }[];
}) {
  // Deux options côte à côte ; au-delà, l'une sous l'autre (lisibles sur téléphone comme dans une demi-colonne).
  return (
    <fieldset className={options.length > 2 ? "choix rg-alternative" : "choix choix-2 rg-alternative"}>
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

/** Un réglage qui s'allume ou se coupe : son nom, ce qu'il fait, l'interrupteur
 *  à droite. `champ.<cle>` dit au serveur que la case était là (décochée = non). */
function Interrupteur({ cle, valeur, titre, aide, children }: { cle: string; valeur: boolean; titre: string; aide: string; children?: React.ReactNode }) {
  return (
    <li className="rg-inter">
      <label className="rg-inter-rang">
        <input type="hidden" name={`champ.${cle}`} value="1" />
        <span className="rg-inter-texte"><b>{titre}</b><span className="aide">{aide}</span></span>
        <span className="rg-bascule">
          <input type="checkbox" name={cle} value="1" defaultChecked={valeur} />
          <span className="rg-piste" aria-hidden="true" />
        </span>
      </label>
      {children}
    </li>
  );
}

/** Le pied d'une carte : son bouton, et ce que l'enregistrement a donné juste
 *  à côté — là où l'on vient de cliquer, pas en haut de la carte. */
function Pied({ modifie, retour, texte = "Enregistrer" }: { modifie: boolean; retour?: Retour; texte?: string }) {
  if (!modifie) return retour?.erreur ? <MessageRetour retour={retour} /> : null;
  return (
    <div className="carte-pied" data-retour={retour?.ok ? "ok" : retour?.erreur ? "erreur" : undefined}>
      {retour?.ok ? <span className="rg-pied-retour rg-pied-ok" role="status"><Icone nom="succes" taille={15} /> {retour.ok}</span>
        : retour?.erreur ? <span className="rg-pied-retour rg-pied-erreur" role="alert"><Icone nom="alerte" taille={15} /> {retour.erreur}</span>
        : <span className="aide">La vitrine en tient compte aussitôt.</span>}
      <button className="btn btn-primaire">{texte}</button>
    </div>
  );
}

/** Le journal d'une page (ses seuls changements), ou tout entier. */
function Journal({ lignes, titre, lienTout, vide, max, zones, gouvernorats, maintenant }: {
  lignes: EtatReglages["journal"]; titre: string; lienTout?: string; vide: string; max?: number;
  zones: Map<string, string>; gouvernorats: Map<string, string>; maintenant: Date;
}) {
  const vues = max ? lignes.slice(0, max) : lignes;
  return (
    <section className="carte rg-journal" aria-labelledby="t-journal">
      <div className="rg-journal-tete">
        <h2 id="t-journal" className="carte-titre-icone"><Icone nom="journal" /> {titre}</h2>
        {lienTout && max && lignes.length > max ? <Link href={lienTout} className="lien-discret">Tout le journal <Icone nom="droite" taille={14} /></Link> : null}
      </div>
      {vues.length === 0 ? (
        <p className="discret mt-3 text-petit">{vide}</p>
      ) : (
        <ol className="bo-journal mt-3">
          {vues.map((j, i) => (
            <li key={`${j.le}-${i}`}>
              <span className="bo-journal-point" aria-hidden="true" />
              <span className="bo-journal-texte rg-lignes">
                {lignesJournal(j, zones, gouvernorats).map((l, k) => <span key={k}>{l}</span>)}
              </span>
              <span className="bo-journal-meta">{j.auteur ?? "SkanEcom"} · {quand(j.le, maintenant)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** L'écran : l'accueil des réglages (`groupe` nul) ou la page d'un thème. */
export async function EcranReglages({ slug, groupe, messages }: { slug: string; groupe: Groupe | null; messages: MessagesReglages }) {
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_reglages", { p_boutique_id: boutique.boutique_id });
  if (error) throw new Error(`Réglages illisibles : ${error.message}`);
  const e = data as EtatReglages;

  const modifie = PEUT_MODIFIER.includes(boutique.role);
  const base = `/gestion/${slug}/reglages`;
  const action = `${base}/enregistrer`;
  const r = new Map<string, Reglage>(e.reglages.map((x) => [x.cle, x]));
  const v = (cle: string) => r.get(cle)?.valeur;
  const texteDe = (cle: string) => String(v(cle) ?? "").trim();
  const parZone = v("livraison.mode_frais") === "zone";
  const zonesParId = new Map(e.zones.map((z) => [z.id, z.nom]));
  const gouvParCode = new Map(e.gouvernorats.map((g) => [g.code, g.nom]));
  const sansZone = e.gouvernorats.filter((g) => !g.zone_id).length;
  const konnect = r.get("paiement.konnect_actif");
  const retraitActif = Boolean(r.get("retrait.adresse")?.module_actif);
  const savActif = Boolean(r.get("sav.garantie_mois")?.module_actif);
  const avisActif = Boolean(r.get("avis.moderation")?.module_actif);
  const retraitIncomplet = retraitActif && (!texteDe("retrait.adresse") || !texteDe("retrait.ville"));
  const maintenant = new Date();
  const prefixe = texteDe("commande.prefixe_numero");
  const manquants = CHAMPS_LEGAUX.filter((c) => !texteDe(c.cle)).map((c) => c.libelle);
  const auPoids = Boolean(v("livraison.supplement_poids"));
  const dernier = e.tranches.at(-1);
  const exports = Object.entries(EXPORTS).filter(([, x]) => (!x.module || (x.module === "sav" && savActif)) && (!x.reglage || Boolean(v(x.reglage))));
  // Les déclinaisons en vente sans poids : elles pèsent 0 kg dans le supplément.
  const { count: sansPoids } = await sb.from("variantes").select("id", { count: "exact", head: true })
    .eq("boutique_id", boutique.boutique_id).eq("actif", true).is("poids_grammes", null);

  // Les thèmes de cette boutique : le service client n'existe qu'avec l'un de ses modules.
  const groupes = GROUPES.filter((g) => (g.cle !== "service" || savActif || avisActif) && (g.cle !== "donnees" || modifie));
  const lien = (g: Groupe, ancre?: string) => `${base}/${g}${ancre ? `#t-${ancre}` : ""}`;

  // Ce qui manque avant d'ouvrir : en tête de l'accueil, et sur sa tuile.
  const fonctions = [
    "catalogue.afficher_prix_barres", "catalogue.prevenir_retour", "catalogue.precommandes", "catalogue.favoris", "vitrine.partage",
    "vitrine.lettre", "vitrine.statistiques", "catalogue.achetes_ensemble", "catalogue.ajout_carte",
  ];
  const allumees = fonctions.filter((c) => Boolean(v(c))).length;
  const reseaux = ["contact.instagram", "contact.facebook", "contact.tiktok"].filter((c) => texteDe(c)).length;
  const sansContact = !texteDe("contact.whatsapp") && !texteDe("contact.telephone");
  const attentions: { groupe: Groupe; ancre?: string; texte: string }[] = [
    ...(manquants.length ? [{ groupe: "legal" as Groupe, texte: `Informations légales : ${manquants.join(", ")}` }] : []),
    ...(sansContact ? [{ groupe: "contact" as Groupe, texte: "Aucun numéro pour vous joindre : ni WhatsApp, ni téléphone" }] : []),
    ...(retraitIncomplet ? [{ groupe: "livraison" as Groupe, ancre: "retrait", texte: "Retrait en magasin : l'adresse ou la ville du magasin manque" }] : []),
    ...(parZone && sansZone ? [{ groupe: "livraison" as Groupe, ancre: "gouvernorats", texte: `${sansZone} gouvernorat${sansZone > 1 ? "s" : ""} sans zone, au tarif fixe` }] : []),
    ...(auPoids && sansPoids ? [{ groupe: "livraison" as Groupe, ancre: "poids", texte: `${sansPoids} déclinaison${sansPoids > 1 ? "s" : ""} sans poids : 0 kg dans le supplément` }] : []),
  ];

  const resumes: Record<Groupe, string> = {
    commandes: v("vitrine.site_vitrine") ? "Site vitrine : sans commande en ligne"
      : [v("compte.obligatoire") ? "Compte obligatoire" : "Commande en invité",
        v("commande.mode_confirmation") === "automatique" ? "confirmées d'office" : "confirmées par téléphone",
        v("commande.achat_express") ? "achat express" : null].filter(Boolean).join(" · "),
    livraison: [
      parZone ? `${e.zones.filter((z) => z.actif).length} zone${e.zones.length > 1 ? "s" : ""} de tarif` : `${formateMontant(Number(v("livraison.frais_fixes_millimes") ?? 0))} TND partout`,
      Number(v("livraison.seuil_gratuite_millimes") ?? 0) ? `offerte dès ${formateMontant(Number(v("livraison.seuil_gratuite_millimes")))} TND` : null,
      texteDe("livraison.transporteur") || null,
      auPoids ? "supplément au poids" : null,
      retraitActif ? "retrait en magasin" : null,
    ].filter(Boolean).join(" · "),
    paiement: [v("paiement.cod_actif") ? "À la livraison" : null, konnect?.module_actif && konnect.valeur ? "en ligne (Konnect)" : null].filter(Boolean).join(" · ") || "Aucun moyen actif",
    vitrine: `${compteAllumees(allumees, fonctions.length)}${texteDe("vitrine.annonce") ? " · une annonce en tête" : ""}`,
    contact: sansContact ? "Aucun numéro" : [texteDe("contact.whatsapp") ? "WhatsApp" : null, texteDe("contact.telephone") ? "téléphone" : null,
      reseaux ? `${reseaux} réseau${reseaux > 1 ? "x" : ""}` : null].filter(Boolean).join(" · "),
    service: [savActif ? (Number(v("sav.garantie_mois") ?? 0) ? `Garantie ${v("sav.garantie_mois")} mois` : "Garantie légale") : null,
      avisActif ? (v("avis.moderation") === "automatique" ? "avis publiés aussitôt" : "avis relus avant publication") : null].filter(Boolean).join(" · "),
    publicite: [texteDe("pub.pixel_meta") ? "Pixel Meta" : null, texteDe("pub.pixel_tiktok") ? "pixel TikTok" : null].filter(Boolean).join(" · ") || "Aucun pixel",
    legal: manquants.length ? `${manquants.length} information${manquants.length > 1 ? "s" : ""} à compléter` : "Complètes",
    donnees: `${exports.length} fichiers à télécharger`,
    journal: e.journal[0] ? `Dernier changement ${quand(e.journal[0].le, maintenant)}${e.journal[0].auteur ? `, par ${e.journal[0].auteur}` : ""}` : "Aucun changement",
  };
  const alerte = (g: Groupe) => attentions.some((a) => a.groupe === g);

  // Le journal d'une page : les changements de ses réglages (zones, tranches et
  // gouvernorats : la livraison).
  const journalDe = (g: Groupe | null) => e.journal.filter((j) => {
    if (!g || g === "journal") return true;
    if (j.action === "reglages.modifier") return Object.keys(j.apres ?? {}).some((cle) => groupeDeCle(cle) === g);
    return g === "livraison" && j.action.startsWith("reglages.");
  });
  const lecture = !modifie ? (
    <p className="message">Lecture seule : le propriétaire ou l&apos;administrateur de la boutique change les réglages.</p>
  ) : null;

  /* ---------------- L'accueil des réglages ---------------- */
  if (!groupe) {
    return (
      <>
        <EnTetePage titre="Réglages" description="Ce qui s'applique à la boutique et à ses commandes, thème par thème. Chaque changement est gardé au journal, avec son auteur." />
        <div className="pile">
          {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
          {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
          {lecture}
          {attentions.length ? (
            <section className="rg-attention" aria-labelledby="t-attention">
              <h2 id="t-attention"><Icone nom="alerte" /> À régler avant d&apos;ouvrir</h2>
              <ul role="list">
                {attentions.map((a) => (
                  <li key={a.texte}><Link href={lien(a.groupe, a.ancre)}>{a.texte}</Link></li>
                ))}
              </ul>
            </section>
          ) : null}
          <ul className="rg-tuiles" role="list">
            {groupes.filter((g) => g.cle !== "journal").map((g) => (
              <li key={g.cle}>
                <Link href={lien(g.cle)} className="rg-tuile" data-alerte={alerte(g.cle) ? "" : undefined}>
                  <span className="rg-tuile-icone" aria-hidden="true"><Icone nom={g.icone} taille={18} /></span>
                  <span className="rg-tuile-texte">
                    <b>{g.titre}</b>
                    <span className="rg-tuile-desc">{g.description}</span>
                    <span className="rg-tuile-etat">{alerte(g.cle) ? <Icone nom="alerte" taille={13} /> : null}{resumes[g.cle]}</span>
                  </span>
                  <Icone nom="droite" taille={16} className="rg-tuile-fleche" />
                </Link>
              </li>
            ))}
          </ul>
          <Journal lignes={journalDe(null)} titre="Derniers changements" lienTout={lien("journal")} max={5}
            vide="Aucun changement : la boutique suit les réglages de départ de SkanEcom." zones={zonesParId} gouvernorats={gouvParCode} maintenant={maintenant} />
        </div>
      </>
    );
  }

  /* ---------------- La page d'un thème ---------------- */
  const g = groupes.find((x) => x.cle === groupe) ?? GROUPES.find((x) => x.cle === groupe)!;
  // Un message d'une section paraît dans sa section ; un message d'ailleurs, en tête.
  const dansIci = Boolean(messages.dans && groupeDe(messages.dans) === groupe && messages.dans !== "journal");
  const retourDe = (id: string): Retour => (messages.dans === id ? messages : null);

  return (
    <>
      <EnTetePage
        avant={<Link href={base}><Icone nom="retour" taille={14} /> Réglages</Link>}
        titre={g.titre}
        description={g.description}
      />
      <div className="rg-cadre">
        <nav className="rg-nav" aria-label="Thèmes des réglages">
          <ol role="list">
            {groupes.map((x) => (
              <li key={x.cle}>
                <Link href={lien(x.cle)} aria-current={x.cle === groupe ? "page" : undefined}>
                  <Icone nom={x.icone} taille={15} /> {x.titre}
                  {alerte(x.cle) ? <span className="rg-nav-point" title="À compléter" aria-label="à compléter" /> : null}
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <div className="pile rg-contenu">
          {messages.ok && !dansIci ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
          {messages.erreur && !dansIci ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
          {lecture}

          {/* ---------------- Commandes ---------------- */}
          {groupe === "commandes" ? (
            <Section id="commandes" titre="Commander sur la boutique" description="Qui peut commander, et ce qui se passe une fois la commande passée.">
              <form action={action} method="post">
                <input type="hidden" name="section" value="commandes" />
                <fieldset className="pile rg-corps" disabled={!modifie}>
                  <Alternative
                    nom="vitrine.site_vitrine" legende="Le site" valeur={v("vitrine.site_vitrine") ? "1" : "0"}
                    options={[
                      { valeur: "0", titre: "Une boutique en ligne", conseil: "Conseillé", aide: "On commande sur le site : le panier, la commande, le paiement à la livraison." },
                      { valeur: "1", titre: "Un site vitrine", aide: "Le catalogue, ses prix et son stock, sans panier ni commande : chaque fiche propose WhatsApp, l'appel ou l'e-mail. Les réglages ci-dessous attendent votre retour à la boutique." },
                    ]}
                  />
                  <Alternative
                    nom="compte.obligatoire" legende="Pour commander" valeur={v("compte.obligatoire") ? "1" : "0"}
                    options={[
                      { valeur: "1", titre: "Compte obligatoire", conseil: "Conseillé", aide: "L'acheteur se connecte par un code, avant de commander. Moins de refus à la livraison." },
                      { valeur: "0", titre: "Commande en invité", aide: "Plus rapide pour l'acheteur, mais plus de commandes fantaisistes à appeler." },
                    ]}
                  />
                  <Alternative
                    nom="compte.verification" legende="Le code de connexion" valeur={String(v("compte.verification") ?? "les_deux")}
                    options={[
                      { valeur: "les_deux", titre: "SMS ou e-mail, au choix", conseil: "Conseillé", aide: "Le SMS est proposé d'abord ; qui préfère l'e-mail le choisit. Moins de SMS à payer." },
                      { valeur: "sms", titre: "Par SMS seulement", aide: "Chaque compte a un numéro vérifié. Chaque code envoyé est un SMS payé." },
                      { valeur: "email", titre: "Par e-mail seulement", aide: "Presque gratuit. Le numéro, saisi à la commande, se vérifie à l'appel de confirmation." },
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
                      { valeur: "1", titre: "Achat express en plus", aide: "« Commander maintenant » à côté de « Ajouter au panier » : cet article seul, droit à la commande. Plus rapide sur téléphone." },
                    ]}
                  />
                  <Alternative
                    nom="commande.relance_paniers" legende="Un panier laissé sans commande" valeur={v("commande.relance_paniers") ? "1" : "0"}
                    options={[
                      { valeur: "0", titre: "Rien n'est gardé", aide: "Un panier non commandé reste dans le navigateur de l'acheteur, et nulle part ailleurs. Couper efface les paniers gardés." },
                      { valeur: "1", titre: "Une relance possible", aide: "Le panier d'un acheteur connecté s'affiche une heure plus tard (Paniers) : l'équipe le relance une fois, message prêt. Il faut un compte pour commander ; le tunnel et la confidentialité le disent." },
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
                <Pied modifie={modifie} retour={retourDe("commandes")} />
              </form>
            </Section>
          ) : null}

          {/* ---------------- Livraison ---------------- */}
          {groupe === "livraison" ? (
            <>
              <nav className="rg-ancres" aria-label="Sur cette page">
                <a href="#t-livraison">Tarif</a>
                <a href="#t-zones">Zones</a>
                <a href="#t-gouvernorats">Gouvernorats</a>
                <a href="#t-poids">Poids</a>
                {retraitActif ? <a href="#t-retrait">Retrait en magasin</a> : null}
              </nav>
              <Section id="livraison" titre="Le tarif de livraison" description="Ce que paie l'acheteur pour être livré, et par qui.">
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
                      <input id="transporteur" name="livraison.transporteur" defaultValue={texteDe("livraison.transporteur")} placeholder="Ex. Aramex, First Delivery…" maxLength={60} />
                      <span className="aide">Affiché à l&apos;acheteur et proposé à l&apos;expédition.</span>
                    </div>
                    <ul className="rg-inters" role="list">
                      <Interrupteur cle="livraison.supplement_poids" valeur={auPoids} titre="Supplément selon le poids du colis"
                        aide="Le supplément de sa tranche (plus bas) s'ajoute au tarif. La livraison offerte reste offerte, supplément compris." />
                    </ul>
                  </fieldset>
                  <Pied modifie={modifie} retour={retourDe("livraison")} />
                </form>
              </Section>

              {/* ---------------- Zones ---------------- */}
              <Section id="zones" retour={retourDe("zones")} titre="Zones de livraison"
                etat={parZone ? <span className="ui-etat ui-etat-point ui-etat-vert">Appliquées</span> : <span className="ui-etat">Non appliquées</span>}
                description={parZone
                  ? "Chaque zone a son tarif et son délai, annoncés à l'acheteur dès qu'il choisit son gouvernorat."
                  : "Préparées ici, elles ne s'appliquent qu'avec « Tarif par zone » (ci-dessus)."}>
                <details className="rg-pli rg-eteignable" data-eteinte={parZone ? undefined : ""} open={parZone || messages.dans === "zones" ? true : undefined}>
                  <summary className="btn btn-second btn-petit">{e.zones.length ? `Les ${e.zones.length} zones préparées` : "Préparer des zones"}</summary>
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
                </details>
              </Section>

              {/* ---------------- Gouvernorats ---------------- */}
              <Section id="gouvernorats" retour={retourDe("gouvernorats")} titre="Gouvernorats"
                etat={sansZone ? <span className="ui-etat ui-etat-ambre">{sansZone} au tarif fixe</span> : null}
                description="La zone de chacun des 24 gouvernorats. Sans zone, c'est le tarif de livraison ci-dessus : jamais la gratuité par oubli.">
                <details className="rg-pli" open={parZone || messages.dans === "gouvernorats" ? true : undefined}>
                  <summary className="btn btn-second btn-petit">Les 24 gouvernorats et leur zone</summary>
                  <form action={action} method="post">
                    <input type="hidden" name="section" value="gouvernorats" />
                    <fieldset className="rg-gouvernorats" disabled={!modifie || e.zones.length === 0}>
                      <legend className="sr-only">Zone de chaque gouvernorat</legend>
                      {e.gouvernorats.map((gv) => (
                        <div key={gv.code} className="rg-gouv">
                          <label htmlFor={`g-${gv.code}`}>{gv.nom}</label>
                          <select id={`g-${gv.code}`} name={`g.${gv.code}`} className="entree" defaultValue={gv.zone_id ?? ""}>
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
                </details>
              </Section>

              {/* ---------------- Supplément au poids ---------------- */}
              <Section id="poids" retour={retourDe("poids")} titre="Supplément au poids"
                etat={auPoids ? <span className="ui-etat ui-etat-point ui-etat-vert">Appliqué</span> : <span className="ui-etat">Non appliqué</span>}
                description={auPoids
                  ? "Le colis pèse la somme de ses articles ; le supplément de sa tranche s'ajoute au tarif de livraison, annoncé à l'acheteur avant qu'il commande."
                  : "Préparées ici, les tranches ne s'appliquent qu'avec « Supplément selon le poids du colis » (ci-dessus)."}>
                {sansPoids ? (
                  <p className={`message ${auPoids ? "rg-manque" : ""} rg-poids-manque`} role="note">
                    {sansPoids} déclinaison{sansPoids > 1 ? "s actives" : " active"} sans poids : {sansPoids > 1 ? "elles comptent" : "elle compte"} pour 0 kg.{" "}
                    <a href={`/gestion/${slug}/produits`}>Renseigner au catalogue</a>
                  </p>
                ) : null}
                <fieldset className="rg-tranches rg-eteignable" data-eteinte={auPoids ? undefined : ""} disabled={!modifie}>
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
              </Section>

              {/* ---------------- Retrait en magasin (module) ---------------- */}
              {retraitActif ? (
                <Section id="retrait" titre="Retrait en magasin"
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
                          <input id="retrait_adresse" name="retrait.adresse" defaultValue={texteDe("retrait.adresse")} maxLength={200} placeholder="Ex. Route de Tunis, km 3" />
                        </div>
                        <div className="champ">
                          <label htmlFor="retrait_ville">Ville</label>
                          <input id="retrait_ville" name="retrait.ville" defaultValue={texteDe("retrait.ville")} maxLength={80} placeholder="Ex. Sfax" />
                        </div>
                      </div>
                      <div className="champ">
                        <label htmlFor="retrait_horaires">Horaires d&apos;ouverture</label>
                        <input id="retrait_horaires" name="retrait.horaires" defaultValue={texteDe("retrait.horaires")} maxLength={200} placeholder="Du lundi au samedi, de 8 h à 18 h" />
                        <span className="aide">Affichés à la commande et sur sa page de suivi.</span>
                      </div>
                      <div className="champ rg-court">
                        <label htmlFor="retrait_delai">Prête en</label>
                        <span className="rg-unite">
                          <input id="retrait_delai" name="retrait.delai_heures" type="number" min={1} max={720} inputMode="numeric" defaultValue={Number(v("retrait.delai_heures") ?? 24)} />
                          <span>heures</span>
                        </span>
                        <span className="aide">Le temps de préparer une commande confirmée. L&apos;acheteur lit « prête sous 2 heures ».</span>
                      </div>
                    </fieldset>
                    <Pied modifie={modifie} retour={retourDe("retrait")} />
                  </form>
                </Section>
              ) : null}
            </>
          ) : null}

          {/* ---------------- Paiement ---------------- */}
          {groupe === "paiement" ? (
            <Section id="paiement" titre="Les moyens de paiement" description="Toujours au moins un moyen de paiement actif.">
              <form action={action} method="post">
                <input type="hidden" name="section" value="paiement" />
                <fieldset className="rg-corps" disabled={!modifie}>
                  <legend className="sr-only">Moyens de paiement</legend>
                  <ul className="rg-inters" role="list">
                    <Interrupteur cle="paiement.cod_actif" valeur={Boolean(v("paiement.cod_actif"))} titre="Paiement à la livraison"
                      aide="L'acheteur paie le livreur en espèces." />
                    {konnect?.module_actif ? (
                      <Interrupteur cle="paiement.konnect_actif" valeur={Boolean(konnect.valeur)} titre="Paiement en ligne (Konnect)"
                        aide="Carte bancaire ou e-dinar, sur le compte marchand de la boutique." />
                    ) : (
                      <li className="rg-inter rg-indispo">
                        <span className="rg-inter-rang">
                          <span className="rg-inter-texte">
                            <b>Paiement en ligne (Konnect) <span className="ui-etat">Bientôt</span></b>
                            <span className="aide">Prévu, mais à activer par SkanEcom une fois le compte marchand de la boutique ouvert.</span>
                          </span>
                          <span className="rg-bascule">
                            <input type="checkbox" disabled aria-label="Paiement en ligne (Konnect), non disponible" />
                            <span className="rg-piste" aria-hidden="true" />
                          </span>
                        </span>
                      </li>
                    )}
                  </ul>
                </fieldset>
                <Pied modifie={modifie} retour={retourDe("paiement")} />
              </form>
            </Section>
          ) : null}

          {/* ---------------- Fonctions de la vitrine ---------------- */}
          {groupe === "vitrine" ? (
            <Section id="vitrine" titre="Ce que la vitrine propose"
              description={`${compteAllumees(allumees, fonctions.length)}. Chacune s'allume ou se coupe ici, la vitrine suit aussitôt.`}>
              <form action={action} method="post">
                <input type="hidden" name="section" value="vitrine" />
                <fieldset className="pile rg-corps" disabled={!modifie}>
                  <h3 className="rg-sous-titre">Sur les fiches et les cartes</h3>
                  <ul className="rg-inters" role="list">
                    <Interrupteur cle="catalogue.afficher_prix_barres" valeur={Boolean(v("catalogue.afficher_prix_barres"))} titre="Afficher les prix barrés"
                      aide="L'ancien prix, barré, à côté du prix payé — pour les déclinaisons qui en ont un." />
                    <Interrupteur cle="catalogue.ajout_carte" valeur={Boolean(v("catalogue.ajout_carte"))} titre="Ajouter au panier depuis la carte"
                      aide="Un « + » sur la photo de chaque carte met la pièce au panier sans ouvrir sa fiche ; s'il y a un choix (taille, couleur, format : huit au plus), il se fait sur la photo." />
                    <Interrupteur cle="catalogue.achetes_ensemble" valeur={Boolean(v("catalogue.achetes_ensemble"))} titre="Souvent achetés ensemble"
                      aide="Sous la fiche et dans le tiroir du panier, les pièces que vos clients prennent avec celle-ci, d'après les commandes des six derniers mois." />
                    <Interrupteur cle="catalogue.favoris" valeur={Boolean(v("catalogue.favoris"))} titre="Les favoris"
                      aide="Un cœur sur les cartes et les fiches, et « Mes favoris » ; un client connecté les retrouve partout. Le catalogue dit combien aiment chaque pièce, jamais qui." />
                    <Interrupteur cle="vitrine.partage" valeur={Boolean(v("vitrine.partage"))} titre="Partager une fiche"
                      aide="Un bouton « Partager » : au téléphone, la feuille de partage (WhatsApp, Messenger…) ; sur ordinateur, WhatsApp, Facebook ou le lien à copier." />
                  </ul>
                  <h3 className="rg-sous-titre">Quand une pièce est épuisée</h3>
                  <ul className="rg-inters" role="list">
                    <Interrupteur cle="catalogue.prevenir_retour" valeur={Boolean(v("catalogue.prevenir_retour"))} titre="Prévenir du retour d'une pièce épuisée"
                      aide="La fiche propose « Prévenez-moi de son retour » ; quand le stock revient, l'écran Réassort dit qui prévenir, message prêt." />
                    <Interrupteur cle="catalogue.precommandes" valeur={Boolean(v("catalogue.precommandes"))} titre="Précommandes sur arrivage"
                      aide="Une pièce épuisée qu'un arrivage annoncé apporte (Catalogue → Arrivages) se commande déjà, avec sa date prévue. Rien n'est encaissé avant : la commande part à la réception." />
                  </ul>
                  <h3 className="rg-sous-titre">Faire revenir les visiteurs</h3>
                  <ul className="rg-inters" role="list">
                    <Interrupteur cle="vitrine.lettre" valeur={Boolean(v("vitrine.lettre"))} titre="Lettre d'information"
                      aide="Au pied de chaque page, l'inscription : la personne coche son accord, puis le confirme par le lien reçu par e-mail. Il faut un expéditeur d'e-mails branché.">
                      <div className="champ rg-inter-suite">
                        <label htmlFor="lettre-accroche">Accroche de la lettre <span className="discret">(facultatif)</span></label>
                        <input id="lettre-accroche" name="vitrine.lettre_accroche" defaultValue={texteDe("vitrine.lettre_accroche")} maxLength={140}
                          placeholder="Les nouveautés et les arrivages, dans votre boîte." />
                      </div>
                    </Interrupteur>
                    <Interrupteur cle="vitrine.statistiques" valeur={Boolean(v("vitrine.statistiques"))} titre="Mesure d'audience"
                      aide="Les visites dans l'écran Visites : combien, d'où, sur quel appareil, et combien commandent. Sans cookie ni donnée personnelle : rien à faire accepter." />
                  </ul>
                  <h3 className="rg-sous-titre">En tête du site</h3>
                  <div className="champ">
                    <label htmlFor="annonce">Annonce <span className="discret">(facultatif)</span></label>
                    <input id="annonce" name="vitrine.annonce" defaultValue={texteDe("vitrine.annonce")} maxLength={140} placeholder="Ex. La collection d'été est arrivée" />
                    <span className="aide">Une phrase courte, avant les faits de service (paiement à la livraison, délais…). Vide : les faits seuls.</span>
                  </div>
                  <div className="champ">
                    <label htmlFor="revendeur">Revendeur officiel <span className="discret">(facultatif)</span></label>
                    <input id="revendeur" name="catalogue.revendeur_officiel" defaultValue={texteDe("catalogue.revendeur_officiel")} maxLength={80} placeholder="Ex. Revendeur officiel DeWalt" />
                    <span className="aide">En tête de la vitrine et sur les fiches produit, si la marque vous a agréé.</span>
                  </div>
                </fieldset>
                <Pied modifie={modifie} retour={retourDe("vitrine")} />
              </form>
            </Section>
          ) : null}

          {/* ---------------- Contact et réseaux ---------------- */}
          {groupe === "contact" ? (
            <Section id="contact" titre="Vous joindre" description="Sur la page Contact, au pied de page, et sur chaque fiche d'un site vitrine.">
              <form action={action} method="post">
                <input type="hidden" name="section" value="contact" />
                <fieldset className="pile rg-corps" disabled={!modifie}>
                  <div className="grille-champs">
                    <div className="champ">
                      <label htmlFor="whatsapp">WhatsApp</label>
                      <input id="whatsapp" name="contact.whatsapp" inputMode="tel" defaultValue={texteDe("contact.whatsapp")} placeholder="21612345678" />
                      <span className="aide">Indicatif compris ; un numéro à 8 chiffres reçoit le 216.</span>
                    </div>
                    <div className="champ">
                      <label htmlFor="telephone">Téléphone de la boutique</label>
                      <input id="telephone" name="contact.telephone" inputMode="tel" defaultValue={texteDe("contact.telephone")} placeholder="21671234567" />
                      <span className="aide">Affiché sur la vitrine.</span>
                    </div>
                  </div>
                  <ul className="rg-inters" role="list">
                    <Interrupteur cle="vitrine.whatsapp_flottant" valeur={Boolean(v("vitrine.whatsapp_flottant"))} titre="Bouton WhatsApp sur toutes les pages"
                      aide="Un rond vert en bas de l'écran ouvre la conversation avec votre numéro WhatsApp (jamais pendant la commande)." />
                  </ul>
                  <div className="champ">
                    <label htmlFor="horaires">Horaires du service client <span className="discret">(facultatif)</span></label>
                    <input id="horaires" name="contact.horaires" defaultValue={texteDe("contact.horaires")} maxLength={160} placeholder="Ex. Du lundi au samedi, de 9 h à 19 h" />
                    <span className="aide">Sur la page Contact, sous le téléphone.</span>
                  </div>
                  <h3 className="rg-sous-titre">Réseaux sociaux</h3>
                  <div className="grille-champs">
                    <div className="champ">
                      <label htmlFor="instagram">Instagram <span className="discret">(facultatif)</span></label>
                      <input id="instagram" name="contact.instagram" defaultValue={texteDe("contact.instagram")} maxLength={200} placeholder="@votre.boutique" />
                    </div>
                    <div className="champ">
                      <label htmlFor="facebook">Facebook <span className="discret">(facultatif)</span></label>
                      <input id="facebook" name="contact.facebook" defaultValue={texteDe("contact.facebook")} maxLength={200} placeholder="votre.boutique" />
                    </div>
                    <div className="champ">
                      <label htmlFor="tiktok">TikTok <span className="discret">(facultatif)</span></label>
                      <input id="tiktok" name="contact.tiktok" defaultValue={texteDe("contact.tiktok")} maxLength={200} placeholder="@votre.boutique" />
                    </div>
                  </div>
                  <span className="aide rg-aide-reseaux">Le compte (« @votre.boutique ») ou l&apos;adresse du profil : au pied de page et sur la page Contact.</span>
                </fieldset>
                <Pied modifie={modifie} retour={retourDe("contact")} />
              </form>
            </Section>
          ) : null}

          {/* ---------------- Service client (modules SAV, avis) ---------------- */}
          {groupe === "service" ? (
            <>
              {!savActif && !avisActif ? (
                <p className="message">Ni le service après-vente ni les avis clients ne sont ouverts pour la boutique : demandez-les à SkanEcom.</p>
              ) : null}
              {savActif ? (
                <Section id="sav" titre="Service après-vente"
                  description="Vos clients signalent un problème sur un article livré depuis « Mes commandes » ; vous traitez la demande dans SAV.">
                  <form action={action} method="post">
                    <input type="hidden" name="section" value="sav" />
                    <fieldset className="pile rg-corps" disabled={!modifie}>
                      <div className="champ rg-court">
                        <label htmlFor="garantie">Garantie annoncée</label>
                        <span className="rg-unite">
                          <input id="garantie" name="sav.garantie_mois" type="number" min={0} max={120} inputMode="numeric" defaultValue={Number(v("sav.garantie_mois") ?? 0)} />
                          <span>mois</span>
                        </span>
                        <span className="aide">Sur la vitrine (« Garantie 12 mois ») et sur chaque demande : encore couverte ou non. 0 = la garantie légale et celle du fabricant, sans durée annoncée.</span>
                      </div>
                      <p className="aide rg-fixe">
                        <Icone nom="outil" taille={14} /> <span><a href={`/gestion/${slug}/sav`}>Les demandes des clients</a> : à rappeler, en cours, closes.</span>
                      </p>
                    </fieldset>
                    <Pied modifie={modifie} retour={retourDe("sav")} />
                  </form>
                </Section>
              ) : null}
              {avisActif ? (
                <Section id="avis" titre="Avis clients"
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
                      <ul className="rg-inters" role="list">
                        <Interrupteur cle="avis.photos" valeur={Boolean(v("avis.photos"))} titre="Photos dans les avis"
                          aide="Avec son avis, le client joint jusqu'à trois photos de l'article reçu ; elles paraissent avec lui, et vous pouvez en retirer une." />
                      </ul>
                      <p className="aide rg-fixe">
                        <Icone nom="etoile" taille={14} /> <span><a href={`/gestion/${slug}/avis`}>Les avis des clients</a> : à relire, publiés, écartés.</span>
                      </p>
                    </fieldset>
                    <Pied modifie={modifie} retour={retourDe("avis")} />
                  </form>
                </Section>
              ) : null}
            </>
          ) : null}

          {/* ---------------- Publicité ---------------- */}
          {groupe === "publicite" ? (
            <Section id="publicite" titre="Vos pixels"
              description="Pour savoir ce que rapportent vos publicités Facebook, Instagram et TikTok : la vitrine envoie à votre pixel les pages vues, les fiches regardées, les ajouts au panier et les commandes.">
              <form action={action} method="post">
                <input type="hidden" name="section" value="publicite" />
                <fieldset className="pile rg-corps" disabled={!modifie}>
                  <div className="grille-champs">
                    <div className="champ">
                      <label htmlFor="pixel-meta">Pixel Meta <span className="discret">(facultatif)</span></label>
                      <input id="pixel-meta" name="pub.pixel_meta" inputMode="numeric" autoComplete="off" spellCheck={false}
                        defaultValue={texteDe("pub.pixel_meta")} maxLength={40} placeholder="Ex. 1234567890123456" aria-describedby="pixel-meta-aide" />
                      <span className="aide" id="pixel-meta-aide">Gestionnaire d&apos;événements de Meta → Sources de données : le numéro sous le nom du pixel. Pour Facebook et Instagram.</span>
                    </div>
                    <div className="champ">
                      <label htmlFor="pixel-tiktok">Pixel TikTok <span className="discret">(facultatif)</span></label>
                      <input id="pixel-tiktok" name="pub.pixel_tiktok" autoComplete="off" spellCheck={false} autoCapitalize="characters"
                        defaultValue={texteDe("pub.pixel_tiktok")} maxLength={40} placeholder="Ex. C4ABCDEFGHIJ12345678" aria-describedby="pixel-tiktok-aide" />
                      <span className="aide" id="pixel-tiktok-aide">TikTok Ads Manager → Gestionnaire d&apos;événements : l&apos;identifiant du pixel (« ID »).</span>
                    </div>
                  </div>
                  <p className="aide rg-pixels-accord">
                    Rien n&apos;est envoyé sans l&apos;accord du visiteur : un bandeau le lui demande, « Refuser » aussi visible qu&apos;« Accepter », et il change d&apos;avis depuis le pied de page. La politique de confidentialité le dit. Vide : aucun pixel, aucun bandeau.
                  </p>
                </fieldset>
                <Pied modifie={modifie} retour={retourDe("publicite")} />
              </form>
            </Section>
          ) : null}

          {/* ---------------- Informations légales ---------------- */}
          {groupe === "legal" ? (
            <Section id="legal" titre="L'identité de la boutique"
              description="Elle compose les mentions légales, les conditions de vente et la politique de confidentialité, que l'acheteur accepte en commandant.">
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
                      <input id="raison_sociale" name="legal.raison_sociale" defaultValue={texteDe("legal.raison_sociale")} maxLength={300} placeholder="Ex. Maymar SARL" />
                    </div>
                    <div className="champ">
                      <label htmlFor="forme_juridique">Forme juridique <span className="discret">(facultatif)</span></label>
                      <input id="forme_juridique" name="legal.forme_juridique" defaultValue={texteDe("legal.forme_juridique")} maxLength={300} placeholder="SARL, SUARL, entreprise individuelle…" />
                    </div>
                  </div>
                  <div className="champ">
                    <label htmlFor="adresse_legale">Adresse du siège</label>
                    <input id="adresse_legale" name="legal.adresse" defaultValue={texteDe("legal.adresse")} maxLength={300} placeholder="Ex. 12 rue de Marseille, 1000 Tunis" />
                  </div>
                  <div className="grille-champs">
                    <div className="champ">
                      <label htmlFor="rne">Identifiant unique (RNE)</label>
                      <input id="rne" name="legal.identifiant_rne" defaultValue={texteDe("legal.identifiant_rne")} maxLength={300} />
                    </div>
                    <div className="champ">
                      <label htmlFor="matricule">Matricule fiscal</label>
                      <input id="matricule" name="legal.matricule_fiscal" defaultValue={texteDe("legal.matricule_fiscal")} maxLength={300} />
                    </div>
                  </div>
                  <div className="champ">
                    <label htmlFor="email_legal">Courriel de la boutique</label>
                    <input id="email_legal" name="legal.email" type="email" defaultValue={texteDe("legal.email")} maxLength={300} placeholder="contact@maboutique.tn" />
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
                    <input id="inpdp" name="legal.inpdp_reference" defaultValue={texteDe("legal.inpdp_reference")} maxLength={300} />
                  </div>
                  <p className="aide rg-fixe">
                    <Icone nom="alerte" taille={14} /> Modèle proposé par SkanEcom : faites relire vos pages légales par votre conseil avant d&apos;ouvrir la boutique.
                  </p>
                </fieldset>
                <Pied modifie={modifie} retour={retourDe("legal")} />
              </form>
            </Section>
          ) : null}

          {/* ---------------- Vos données (B8) ---------------- */}
          {groupe === "donnees" && modifie ? (
            <Section id="donnees" retour={retourDe("donnees")} titre="Télécharger vos données"
              description="Tout ce que la boutique a enregistré, dans un tableur : ses données sont à elle, elle les emporte quand elle veut.">
              <ul className="rg-exports" role="list">
                {exports.map(([cle, x]) => (
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
          {groupe === "donnees" && !modifie ? (
            <p className="message">Le propriétaire ou l&apos;administrateur de la boutique télécharge ses données.</p>
          ) : null}

          {/* Le journal : celui de la page, ou tout entier. */}
          {groupe === "journal" ? (
            <Journal lignes={journalDe(null)} titre="Tous les changements"
              vide="Aucun changement : la boutique suit les réglages de départ de SkanEcom." zones={zonesParId} gouvernorats={gouvParCode} maintenant={maintenant} />
          ) : (
            <Journal lignes={journalDe(groupe)} titre="Derniers changements ici" lienTout={lien("journal")} max={6}
              vide="Rien n'a changé ici : les réglages de départ de SkanEcom." zones={zonesParId} gouvernorats={gouvParCode} maintenant={maintenant} />
          )}
        </div>
      </div>
    </>
  );
}

/** « Aucune fonction allumée sur 9 », « 1 fonction allumée sur 9 », « 3 fonctions… ». */
function compteAllumees(n: number, total: number): string {
  if (n === 0) return `Aucune fonction allumée sur ${total}`;
  return `${n} fonction${n > 1 ? "s" : ""} allumée${n > 1 ? "s" : ""} sur ${total}`;
}
