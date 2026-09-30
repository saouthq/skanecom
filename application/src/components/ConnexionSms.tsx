"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { supabaseNavigateur } from "@/lib/supabase-navigateur";
import { chiffresTelephone, telephoneLisible } from "@/lib/commande";
import { t } from "@/lib/i18n";

/* La connexion par code SMS, là où il en faut une sans quitter la page (la
   demande de devis) : le numéro, puis les six chiffres reçus — tapés, ils
   valent confirmation, sans autre clic. Le même compte que celui du tunnel
   et de « Mes commandes ». La session qui s'ouvre, les pages l'apprennent
   par supabaseNavigateur().auth.onAuthStateChange. */
const ATTENTE_RENVOI = 30;

export function ConnexionSms({ titre, texte }: { titre: string; texte: string }) {
  const [etape, setEtape] = useState<"numero" | "code">("numero");
  const [telephone, setTelephone] = useState("");
  const [numeroCode, setNumeroCode] = useState("");
  const [code, setCode] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [verification, setVerification] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [attente, setAttente] = useState(0);
  const refTelephone = useRef<HTMLInputElement>(null);
  const refCode = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (attente <= 0) return;
    const minuterie = window.setTimeout(() => setAttente((a) => a - 1), 1000);
    return () => window.clearTimeout(minuterie);
  }, [attente]);

  async function envoyerCode() {
    const huit = chiffresTelephone(telephone);
    if (!huit) {
      setErreur(t.commande.telephoneInvalide);
      refTelephone.current?.focus();
      return;
    }
    setEnvoi(true);
    setErreur(null);
    const { error } = await supabaseNavigateur().auth.signInWithOtp({ phone: `+216${huit}` });
    setEnvoi(false);
    if (error) {
      setErreur(error.status === 429 || /rate|frequen|seconds/i.test(error.message) ? t.commande.smsTropTot : t.commande.smsEchec);
      return;
    }
    setNumeroCode(`+216${huit}`);
    setCode("");
    setEtape("code");
    setAttente(ATTENTE_RENVOI);
  }

  async function validerCode(saisie = code) {
    if (verification) return;
    if (!/^\d{6}$/.test(saisie)) {
      setErreur(t.commande.codeAttendu);
      return;
    }
    setVerification(true);
    setErreur(null);
    const { data, error } = await supabaseNavigateur().auth.verifyOtp({ phone: numeroCode, token: saisie, type: "sms" });
    setVerification(false);
    if (error || !data.session) {
      setErreur(t.commande.codeIncorrect);
      refCode.current?.focus();
    }
  }

  return (
    <section className="compte-connexion connexion-sms" aria-labelledby="connexion-sms-titre">
      <h2 id="connexion-sms-titre">{titre}</h2>
      <p className="legende">{texte}</p>
      {etape === "numero" ? (
        <div className="champ">
          <label htmlFor="connexion-telephone">{t.commande.telephone}</label>
          <div className="tunnel-rangee">
            <div className="tunnel-tel" data-invalide={erreur ? "" : undefined}>
              <span aria-hidden="true">{t.commande.indicatif}</span>
              <input
                id="connexion-telephone"
                ref={refTelephone}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="20 123 456"
                value={telephone}
                aria-invalid={erreur ? true : undefined}
                aria-describedby="connexion-erreur"
                onChange={(e) => setTelephone(e.target.value.slice(0, 20))}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void envoyerCode();
                  }
                }}
              />
            </div>
            <button type="button" className="btn btn-primaire" onClick={() => void envoyerCode()} disabled={envoi}>
              {envoi ? t.commande.envoiCode : t.commande.recevoirCode}
            </button>
          </div>
        </div>
      ) : (
        <div className="champ">
          <p className="legende" aria-live="polite">
            {t.commande.codeEnvoye(telephoneLisible(numeroCode))}{" "}
            <button type="button" className="btn-lien" onClick={() => setEtape("numero")}>{t.commande.modifierNumero}</button>
          </p>
          <label htmlFor="connexion-code">{t.commande.code}</label>
          <div className="tunnel-rangee">
            <input
              id="connexion-code"
              ref={refCode}
              className="tunnel-code"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              aria-invalid={erreur ? true : undefined}
              aria-describedby="connexion-erreur"
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
            <button type="button" className="btn btn-primaire" onClick={() => void validerCode()} disabled={verification}>
              {verification ? t.commande.verification : t.commande.valider}
            </button>
          </div>
          <button type="button" className="btn-lien legende tunnel-renvoi" onClick={() => void envoyerCode()} disabled={attente > 0 || envoi}>
            {attente > 0 ? t.commande.renvoyerDans(attente) : t.commande.renvoyer}
          </button>
        </div>
      )}
      <p id="connexion-erreur" className="champ-erreur" role={erreur ? "alert" : undefined}>{erreur}</p>
    </section>
  );
}
