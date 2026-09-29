"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { Coche } from "./Icones";
import { Prix } from "./Prix";
import { supabaseNavigateur } from "@/lib/supabase-navigateur";
import { chiffresTelephone, lieu, telephoneLisible, type Magasin } from "@/lib/commande";
import { urlFichier } from "@/lib/photos";
import { t } from "@/lib/i18n";

/* ============================================================================
   MES COMMANDES — le compte de l'acheteur dans cette boutique : son numéro,
   confirmé par un code SMS (le même compte que celui du tunnel), et ses
   commandes, la plus récente d'abord, avec ce qu'il doit savoir de chacune
   (où elle en est, où elle va, le suivi du transporteur).

   Tout se lit dans le navigateur, avec la session de l'acheteur :
   public.mes_commandes ne rend que ses commandes, et rien de ce que
   l'équipe en écrit. La page servie est la même pour tous (aucune donnée
   personnelle dans le cache).
   ========================================================================== */

type LigneMienne = { produit_nom: string; variante_libelle: string | null; quantite: number; image: string | null };

type CommandeMienne = {
  numero: string;
  statut: string;
  cree_le: string;
  mode_livraison: "domicile" | "retrait";
  ville: string | null;
  gouvernorat: string | null;
  magasin: Magasin | null;
  total_millimes: number;
  transporteur: string | null;
  numero_suivi: string | null;
  lignes: LigneMienne[];
};

const ATTENTE_RENVOI = 30;
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Tunis" });

export function Compte({ boutiqueId }: { boutiqueId: string }) {
  // undefined : la session n'est pas encore lue.
  const [session, setSession] = useState<{ telephone: string } | null | undefined>(undefined);
  const [commandes, setCommandes] = useState<CommandeMienne[] | null>(null);
  const [erreurListe, setErreurListe] = useState(false);

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
    const { data } = supabaseNavigateur().auth.onAuthStateChange((_evenement, s) => {
      const u = s?.user;
      setSession(u ? { telephone: u.phone ? `+${u.phone.replace(/^\+/, "")}` : (u.email ?? "") } : null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Les commandes, dès que la session est là.
  useEffect(() => {
    if (!session) return;
    let actif = true;
    supabaseNavigateur()
      .rpc("mes_commandes", { p_boutique_id: boutiqueId })
      .then(({ data, error }) => {
        if (!actif) return;
        if (error) setErreurListe(true);
        else {
          setErreurListe(false);
          setCommandes((data as CommandeMienne[] | null) ?? []);
        }
      });
    return () => {
      actif = false;
    };
  }, [session, boutiqueId]);

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
      return;
    }
    setEtape("numero");
    setCode("");
  }

  async function deconnecter() {
    await supabaseNavigateur().auth.signOut();
    setCommandes(null);
    setTelephone("");
  }

  if (session === undefined) {
    return <div className="compte-attente" aria-busy="true">{t.commun.chargement}</div>;
  }

  if (!session) {
    return (
      <section className="compte-connexion" aria-labelledby="compte-connexion-titre">
        <h2 id="compte-connexion-titre">{t.compte.connexionTitre}</h2>
        <p className="legende">{t.compte.connexionTexte}</p>
        {etape === "numero" ? (
          <div className="champ">
            <label htmlFor="compte-telephone">{t.commande.telephone}</label>
            <div className="tunnel-rangee">
              <div className="tunnel-tel" data-invalide={erreur ? "" : undefined}>
                <span aria-hidden="true">{t.commande.indicatif}</span>
                <input
                  id="compte-telephone"
                  ref={refTelephone}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="20 123 456"
                  value={telephone}
                  aria-invalid={erreur ? true : undefined}
                  aria-describedby="compte-erreur"
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
            <label htmlFor="compte-code">{t.commande.code}</label>
            <div className="tunnel-rangee">
              <input
                id="compte-code"
                ref={refCode}
                className="tunnel-code"
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                aria-invalid={erreur ? true : undefined}
                aria-describedby="compte-erreur"
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
        <p id="compte-erreur" className="champ-erreur" role={erreur ? "alert" : undefined}>{erreur}</p>
      </section>
    );
  }

  return (
    <div className="compte">
      <div className="compte-identite">
        <p><Coche taille={18} /> <span>{t.compte.connecte(telephoneLisible(session.telephone))}</span></p>
        <button type="button" className="btn-lien legende" onClick={() => void deconnecter()}>{t.compte.deconnexion}</button>
      </div>

      {erreurListe ? (
        <p className="tunnel-alerte" role="alert">{t.compte.erreur}</p>
      ) : commandes === null ? (
        <div className="compte-attente" aria-busy="true">{t.compte.chargement}</div>
      ) : commandes.length === 0 ? (
        <div className="listing-vide compte-vide">
          <h2>{t.compte.aucune}</h2>
          <p>{t.compte.aucuneTexte}</p>
          <a className="btn btn-primaire" href="/catalogue">{t.compte.commander}</a>
        </div>
      ) : (
        <ul className="compte-liste" role="list">
          {commandes.map((c) => <Carte key={c.numero} c={c} />)}
        </ul>
      )}
    </div>
  );
}

function Carte({ c }: { c: CommandeMienne }) {
  const retrait = c.mode_livraison === "retrait";
  const statut = (retrait ? t.commande.statutRetrait[c.statut] : undefined) ?? t.commande.statut[c.statut] ?? c.statut;
  const etat = (retrait ? t.compte.etatRetrait[c.statut] : undefined) ?? t.compte.etat[c.statut] ?? "";
  const articles = c.lignes.reduce((n, l) => n + l.quantite, 0);
  const vignettes = c.lignes.slice(0, 3);
  const suivi = !retrait && (c.transporteur || c.numero_suivi) ? t.compte.suivi(c.transporteur, c.numero_suivi) : null;
  const destination = retrait
    ? t.compte.retraitA(c.magasin ? `${c.magasin.adresse}, ${c.magasin.ville}` : t.commande.modeRetrait.toLowerCase())
    : c.ville
      ? t.compte.livraisonA(lieu(c.ville, c.gouvernorat))
      : null;
  const cloturee = ["livree", "refusee", "annulee"].includes(c.statut);

  return (
    <li className="compte-carte" data-statut={c.statut} data-cloturee={cloturee ? "" : undefined}>
      <div className="compte-carte-tete">
        <div>
          <p className="compte-numero">{c.numero}</p>
          <p className="legende">{t.compte.passeeLe(JOUR.format(new Date(c.cree_le)))}</p>
        </div>
        <span className="compte-statut">{statut}</span>
      </div>
      <p className="compte-etat">{etat}</p>
      <div className="compte-contenu">
        <span className="compte-vignettes" aria-hidden="true">
          {vignettes.map((l, i) => (
            <span key={`${l.produit_nom}-${i}`} className="tunnel-vignette">
              {l.image ? <Image src={urlFichier(l.image)} alt="" fill sizes="48px" /> : <span className="attente-photo"><span className="filigrane" /></span>}
            </span>
          ))}
          {c.lignes.length > 3 ? <span className="compte-plus">+{c.lignes.length - 3}</span> : null}
        </span>
        <span className="compte-resume">
          <span>{c.lignes.map((l) => l.produit_nom).join(", ")}</span>
          <span className="legende">{t.compte.articles(articles)} · <Prix millimes={c.total_millimes} /></span>
        </span>
      </div>
      {destination || suivi ? (
        <p className="compte-destination legende">
          {destination}
          {destination && suivi ? " · " : ""}
          {suivi}
        </p>
      ) : null}
    </li>
  );
}
