"use client";

import { problemesReglages, type CleReglageEditeur, type ReglagesVitrine } from "@/lib/apparence";

/* ============================================================================
   L'EN-TÊTE ET LE PIED DE PAGE, DANS L'ÉDITEUR DE LA VITRINE — l'annonce en
   tête de toutes les pages, les réseaux et le bouton WhatsApp du pied de
   page, les horaires du service client (page Contact). Chaque geste remonte
   à l'éditeur (`regler`), qui l'inscrit dans le brouillon : l'aperçu suit,
   « Publier » met le tout en ligne. Une valeur que la base refuserait est
   dite sous son champ et ne part pas.
   ========================================================================== */

const LIMITE_ANNONCE = 140;

export function PanneauCadre({
  reglages, ecrit, whatsapp, lienReglages, regler,
}: {
  /** Les réglages tels que l'éditeur les montre (publiés, ou changés). */
  reglages: ReglagesVitrine;
  ecrit: boolean;
  /** La boutique a-t-elle un numéro WhatsApp (écran Réglages) ? */
  whatsapp: boolean;
  /** L'écran Réglages, où se règle le numéro WhatsApp. */
  lienReglages: string;
  regler: <K extends CleReglageEditeur>(cle: K, valeur: ReglagesVitrine[K]) => void;
}) {
  const problemes = problemesReglages(reglages);
  const annonce = reglages["vitrine.annonce"];

  const champ = (cle: Exclude<CleReglageEditeur, "vitrine.whatsapp_flottant">, libelle: string, aide: string, placeholder: string, max = 200) => {
    const erreur = problemes[cle];
    const id = `pc-${cle.replace(".", "-")}`;
    return (
      <div className="champ">
        <label htmlFor={id}>{libelle}</label>
        <input id={id} type="text" value={reglages[cle]} maxLength={max} placeholder={placeholder} spellCheck={false}
          aria-invalid={erreur ? true : undefined} aria-describedby={`${id}-aide`}
          onChange={(e) => regler(cle, e.currentTarget.value)} />
        <p id={`${id}-aide`} className={erreur ? "aide pc-erreur" : "aide"} role={erreur ? "alert" : undefined}>{erreur ?? aide}</p>
      </div>
    );
  };

  return (
    <div className="pc-cadre">
      <section className="carte ap-groupe" aria-labelledby="pc-t-entete" data-zone-editeur="entete">
        <h2 id="pc-t-entete">En-tête</h2>
        <fieldset className="ac-champs" disabled={!ecrit}>
          <legend className="sr-only">L&apos;en-tête de la vitrine</legend>
          <div className="champ">
            <label htmlFor="pc-annonce">Annonce en tête du site</label>
            <input id="pc-annonce" type="text" value={annonce} maxLength={LIMITE_ANNONCE + 20} placeholder="La collection d'été est arrivée"
              aria-invalid={problemes["vitrine.annonce"] ? true : undefined} aria-describedby="pc-annonce-aide"
              onChange={(e) => regler("vitrine.annonce", e.currentTarget.value)} />
            <p id="pc-annonce-aide" className={problemes["vitrine.annonce"] ? "aide pc-erreur" : "aide"}>
              <span>{problemes["vitrine.annonce"] ?? "Une phrase courte, sur toutes les pages. Vide : vos faits de service (livraison, paiement à la livraison)."}</span>
              <span className="pc-compte" aria-live="polite">{annonce.trim().length}/{LIMITE_ANNONCE}</span>
            </p>
          </div>
        </fieldset>
        <p className="aide pc-note">Le logo et le menu des rayons suivent la marque et le catalogue.</p>
      </section>

      <section className="carte ap-groupe" aria-labelledby="pc-t-pied" data-zone-editeur="pied">
        <h2 id="pc-t-pied">Pied de page</h2>
        <fieldset className="ac-champs" disabled={!ecrit}>
          <legend className="sr-only">Le pied de page de la vitrine</legend>
          {champ("contact.instagram", "Instagram", "Le compte (« @maison.selma ») ou l'adresse du profil.", "@votre.boutique")}
          {champ("contact.facebook", "Facebook", "Le nom de la page (facebook.com/…) ou son adresse.", "votre.boutique")}
          {champ("contact.tiktok", "TikTok", "Le compte (« @maison.selma ») ou l'adresse du profil.", "@votre.boutique")}
          <label className="pc-bascule">
            <input type="checkbox" checked={reglages["vitrine.whatsapp_flottant"]} disabled={!whatsapp}
              onChange={(e) => regler("vitrine.whatsapp_flottant", e.currentTarget.checked)} aria-describedby="pc-whatsapp-aide" />
            <span>
              <b>Bouton WhatsApp sur toutes les pages</b>
              <span id="pc-whatsapp-aide" className="aide">
                {whatsapp ? "Un bouton rond, en bas de l'écran, ouvre la conversation." : <>Ajoutez d&apos;abord le numéro WhatsApp de la boutique, dans les <a href={lienReglages}>Réglages</a>.</>}
              </span>
            </span>
          </label>
          {champ("contact.horaires", "Horaires du service client", "Sur la page Contact (« Du lundi au samedi, de 9 h à 19 h »).", "Du lundi au samedi, de 9 h à 19 h", 180)}
        </fieldset>
      </section>
    </div>
  );
}
