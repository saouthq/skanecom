"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Enveloppe, Telephone } from "./Icones";
import { supabaseNavigateur } from "@/lib/supabase-navigateur";
import { chiffresTelephone, telephoneLisible } from "@/lib/commande";
import { canauxDe, emailValide, type Canal, type Verification } from "@/lib/connexion";
import { t } from "@/lib/i18n";

/* ============================================================================
   LA CONNEXION DE L'ACHETEUR — un code à six chiffres, reçu par SMS ou par
   e-mail selon le réglage de la boutique (compte.verification) : le numéro
   ou l'adresse, puis le code — tapé, il vaut confirmation, sans autre clic.
   Avec « les deux », l'acheteur choisit d'un geste ; le SMS vient d'abord.

   <Identification> : les champs seuls, là où la connexion est une étape
   d'un formulaire (le tunnel) ; <Connexion> : la même chose dans son
   encadré, là où il en faut une sans quitter la page (Mes commandes, la
   demande de devis, le lien d'un devis). Un seul compte pour tous : la
   session qui s'ouvre, les pages l'apprennent par
   supabaseNavigateur().auth.onAuthStateChange.
   ========================================================================== */

const ATTENTE_RENVOI = 30;

type Envoye = { canal: Canal; valeur: string };

export function Identification({
  verification,
  bouton = "primaire",
  aide = false,
  erreurExterne,
  refSaisie,
  surConnexion,
}: {
  verification: Verification;
  /** Le bouton « Recevoir le code » : plein, ou en second (dans le tunnel). */
  bouton?: "primaire" | "second";
  /** Une ligne sous le champ, qui dit à quoi sert le numéro ou l'adresse. */
  aide?: boolean;
  /** Une erreur du formulaire autour (le tunnel envoyé sans connexion). */
  erreurExterne?: string;
  /** Le champ de saisie, pour que le formulaire autour y mette le focus. */
  refSaisie?: (el: HTMLInputElement | null) => void;
  surConnexion?: () => void;
}) {
  const id = useId();
  const canaux = canauxDe(verification);
  const [canal, setCanal] = useState<Canal>(canaux[0]);
  const [etape, setEtape] = useState<"saisie" | "code">("saisie");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [envoye, setEnvoye] = useState<Envoye | null>(null);
  const [code, setCode] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [verificationEnCours, setVerificationEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [attente, setAttente] = useState(0);
  const refChamp = useRef<HTMLInputElement | null>(null);
  const refCode = useRef<HTMLInputElement>(null);
  const retourSaisie = useRef(false);

  // Le réglage a changé sous nos pieds (rare) : le canal suit.
  const canalActif: Canal = canaux.includes(canal) ? canal : canaux[0];
  const parSms = canalActif === "sms";

  useEffect(() => {
    if (attente <= 0) return;
    const minuterie = window.setTimeout(() => setAttente((a) => a - 1), 1000);
    return () => window.clearTimeout(minuterie);
  }, [attente]);

  // « Modifier le numéro » : le champ reprend le focus en revenant.
  useEffect(() => {
    if (etape === "saisie" && retourSaisie.current) {
      retourSaisie.current = false;
      refChamp.current?.focus();
    }
  }, [etape]);

  async function envoyerCode() {
    let cible: Envoye;
    if (parSms) {
      const huit = chiffresTelephone(telephone);
      if (!huit) {
        setErreur(t.commande.telephoneInvalide);
        refChamp.current?.focus();
        return;
      }
      cible = { canal: "sms", valeur: `+216${huit}` };
    } else {
      if (!emailValide(email)) {
        setErreur(t.connexion.emailInvalide);
        refChamp.current?.focus();
        return;
      }
      cible = { canal: "email", valeur: email.trim().toLowerCase() };
    }
    setEnvoi(true);
    setErreur(null);
    // Par e-mail, l'adresse de la boutique en lien de retour : l'e-mail part
    // à son nom et à ses couleurs (le crochet des e-mails, lib/courriels).
    const { error } = await supabaseNavigateur().auth.signInWithOtp(
      cible.canal === "sms"
        ? { phone: cible.valeur }
        : { email: cible.valeur, options: { emailRedirectTo: `${window.location.origin}/compte` } },
    );
    setEnvoi(false);
    if (error) {
      const tropTot = error.status === 429 || /rate|frequen|seconds/i.test(error.message);
      setErreur(tropTot ? t.commande.smsTropTot : cible.canal === "sms" ? t.commande.smsEchec : t.connexion.emailEchec);
      return;
    }
    setEnvoye(cible);
    setCode("");
    setEtape("code"); // le champ du code prend le focus en apparaissant
    setAttente(ATTENTE_RENVOI);
  }

  async function validerCode(saisie = code) {
    if (verificationEnCours || !envoye) return;
    if (!/^\d{6}$/.test(saisie)) {
      setErreur(t.commande.codeAttendu);
      return;
    }
    setVerificationEnCours(true);
    setErreur(null);
    const auth = supabaseNavigateur().auth;
    const { data, error } =
      envoye.canal === "sms"
        ? await auth.verifyOtp({ phone: envoye.valeur, token: saisie, type: "sms" })
        : await auth.verifyOtp({ email: envoye.valeur, token: saisie, type: "email" });
    setVerificationEnCours(false);
    if (error || !data.session) {
      setErreur(envoye.canal === "sms" ? t.commande.codeIncorrect : t.connexion.codeIncorrectEmail);
      refCode.current?.focus();
      return;
    }
    setEtape("saisie");
    setCode("");
    surConnexion?.();
  }

  function modifier() {
    retourSaisie.current = true;
    setErreur(null);
    setEtape("saisie");
  }

  const erreurMontree = erreur ?? erreurExterne ?? null;
  const classeBouton = bouton === "second" ? "btn btn-second" : "btn btn-primaire";

  if (etape === "code" && envoye) {
    const sms = envoye.canal === "sms";
    return (
      <div className="champ">
        <p className="legende" aria-live="polite">
          {sms ? t.commande.codeEnvoye(telephoneLisible(envoye.valeur)) : t.connexion.codeEnvoyeEmail(envoye.valeur)}{" "}
          <button type="button" className="btn-lien" onClick={modifier}>
            {sms ? t.commande.modifierNumero : t.connexion.modifierEmail}
          </button>
        </p>
        <label htmlFor={`${id}-code`}>{sms ? t.commande.code : t.connexion.codeEmail}</label>
        <div className="tunnel-rangee">
          <input
            id={`${id}-code`}
            ref={refCode}
            className="tunnel-code"
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            aria-invalid={erreurMontree ? true : undefined}
            aria-describedby={`${id}-erreur`}
            onChange={(e) => {
              const chiffres = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(chiffres);
              if (chiffres.length === 6) void validerCode(chiffres);
            }}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void validerCode();
              }
            }}
          />
          <button type="button" className="btn btn-primaire" onClick={() => void validerCode()} disabled={verificationEnCours}>
            {verificationEnCours ? t.commande.verification : t.commande.valider}
          </button>
        </div>
        <p id={`${id}-erreur`} className="champ-erreur" role={erreur ? "alert" : undefined}>{erreurMontree}</p>
        <button type="button" className="btn-lien legende tunnel-renvoi" onClick={() => void envoyerCode()} disabled={attente > 0 || envoi}>
          {attente > 0 ? t.commande.renvoyerDans(attente) : t.commande.renvoyer}
        </button>
      </div>
    );
  }

  const surEntree = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void envoyerCode();
    }
  };
  const lierChamp = (el: HTMLInputElement | null) => {
    refChamp.current = el;
    refSaisie?.(el);
  };
  const decrit = `${aide ? `${id}-aide ` : ""}${id}-erreur`;

  return (
    <div className="identification">
      {canaux.length > 1 ? (
        <fieldset className="identification-canaux">
          <legend>{t.connexion.canaux}</legend>
          <div className="identification-choix">
            {canaux.map((c) => (
              <label key={c} className="identification-canal">
                <input
                  type="radio"
                  name={`${id}-canal`}
                  value={c}
                  checked={canalActif === c}
                  onChange={() => {
                    setCanal(c);
                    setErreur(null);
                  }}
                />
                <span>
                  {c === "sms" ? <Telephone taille={16} /> : <Enveloppe taille={16} />}
                  {c === "sms" ? t.connexion.parSms : t.connexion.parEmail}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="champ">
        <label htmlFor={`${id}-saisie`}>{parSms ? t.commande.telephone : t.connexion.email}</label>
        <div className="tunnel-rangee">
          {parSms ? (
            <div className="tunnel-tel" data-invalide={erreurMontree ? "" : undefined}>
              <span aria-hidden="true">{t.commande.indicatif}</span>
              <input
                id={`${id}-saisie`}
                ref={lierChamp}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="20 123 456"
                value={telephone}
                aria-invalid={erreurMontree ? true : undefined}
                aria-describedby={decrit}
                onChange={(e) => setTelephone(e.target.value.slice(0, 20))}
                onKeyDown={surEntree}
              />
            </div>
          ) : (
            <input
              id={`${id}-saisie`}
              ref={lierChamp}
              className="identification-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t.connexion.emailExemple}
              value={email}
              aria-invalid={erreurMontree ? true : undefined}
              aria-describedby={decrit}
              onChange={(e) => setEmail(e.target.value.slice(0, 254))}
              onKeyDown={surEntree}
            />
          )}
          <button type="button" className={classeBouton} onClick={() => void envoyerCode()} disabled={envoi}>
            {envoi ? t.commande.envoiCode : t.commande.recevoirCode}
          </button>
        </div>
        {aide ? (
          <p id={`${id}-aide`} className="legende">{parSms ? t.commande.telephoneAideCompte : t.connexion.aideEmail}</p>
        ) : null}
        <p id={`${id}-erreur`} className="champ-erreur" role={erreur ? "alert" : undefined}>{erreurMontree}</p>
      </div>
    </div>
  );
}

export function Connexion({ titre, texte, verification }: { titre: string; texte: string; verification: Verification }) {
  const id = useId();
  return (
    <section className="compte-connexion" aria-labelledby={`${id}-titre`}>
      <h2 id={`${id}-titre`}>{titre}</h2>
      <p className="legende">{texte}</p>
      <Identification verification={verification} />
    </section>
  );
}
