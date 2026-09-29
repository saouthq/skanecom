"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Billets, Coche } from "./Icones";
import { Prix } from "./Prix";
import { ouvrePanier, ramenePanier, retireDuPanier, usePanierLu } from "@/lib/panier";
import type { LignePanier } from "@/lib/panier-contrat";
import { supabaseNavigateur } from "@/lib/supabase-navigateur";
import {
  chiffresTelephone,
  cleDeCommande,
  telephoneLisible,
  type Devis,
  type LigneDevis,
  type Raison,
  type ReponseDevis,
  type ReponsePasser,
} from "@/lib/commande";
import { urlFichier } from "@/lib/photos";
import { formatePrix } from "@/lib/prix";
import { t } from "@/lib/i18n";
import type { CodeTheme } from "@/lib/theme";

/* ============================================================================
   LE TUNNEL DE COMMANDE — une page, trois temps : vos coordonnées, la
   livraison, le paiement. À côté, le récapitulatif (replié sur téléphone).

   Ce que la page promet, et comment elle le tient :
   · le récapitulatif est celui de la BASE (public.devis_commande), relu à
     chaque changement du panier ou du gouvernorat : prix, stock et frais
     réels, jamais les copies d'affichage du panier ;
   · le total envoyé est celui affiché : si la base en calcule un autre, la
     commande est refusée et le récapitulatif se met à jour (on ne fait pas
     payer un montant que l'acheteur n'a pas lu) ;
   · compte obligatoire (réglage de la boutique) : le numéro se confirme par
     un code SMS, et devient le compte de l'acheteur dans cette boutique.
     Sinon, le numéro est un simple champ (commande en invité) ;
   · une commande envoyée deux fois (double clic, réseau coupé) n'est créée
     qu'une fois : la clé d'idempotence survit au rechargement de la page
     tant que le panier ne change pas.
   ========================================================================== */

type Gouvernorat = { code: string; nom: string };

type Champs = {
  telephone: string;
  nom: string;
  ligne1: string;
  ligne2: string;
  ville: string;
  gouvernorat: string;
  codePostal: string;
  note: string;
};

type Erreurs = Partial<Record<keyof Champs | "code", string>>;

const CHAMPS_VIDES: Champs = { telephone: "", nom: "", ligne1: "", ligne2: "", ville: "", gouvernorat: "", codePostal: "", note: "" };
const ORDRE: (keyof Champs)[] = ["telephone", "nom", "ligne1", "ville", "gouvernorat", "codePostal"];
const ATTENTE_RENVOI = 30;

function valeurNumerique(saisie: string, max: number): string {
  return saisie.replace(/\D/g, "").slice(0, max);
}

export function Tunnel({
  gabarit,
  boutiqueId,
  boutique,
  compteObligatoire,
  rappel,
  cod,
  gouvernorats,
}: {
  gabarit: CodeTheme;
  boutiqueId: string;
  boutique: string;
  compteObligatoire: boolean;
  rappel: boolean;
  cod: boolean;
  gouvernorats: Gouvernorat[];
}) {
  const id = useId();
  const router = useRouter();
  const panierLu = usePanierLu();
  const [champs, setChamps] = useState<Champs>(CHAMPS_VIDES);
  const [tentee, setTentee] = useState(false);
  const [alerte, setAlerte] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [recapOuvert, setRecapOuvert] = useState(false);

  // Le devis de la base.
  const [devis, setDevis] = useState<Devis | null>(null);
  const [devisEnPanne, setDevisEnPanne] = useState(false);
  const [rafraichir, setRafraichir] = useState(0);

  // Le compte de l'acheteur (connexion par code SMS).
  const [session, setSession] = useState<{ telephone: string } | null>(null);
  const [etapeCode, setEtapeCode] = useState<"numero" | "code">("numero");
  const [numeroCode, setNumeroCode] = useState("");
  const [saisieCode, setSaisieCode] = useState("");
  const [envoiCode, setEnvoiCode] = useState(false);
  const [verification, setVerification] = useState(false);
  const [erreurIdentite, setErreurIdentite] = useState<string | null>(null);
  const [attente, setAttente] = useState(0);

  const refs = useRef<Partial<Record<keyof Champs | "code", HTMLElement | null>>>({});
  const refAlerte = useRef<HTMLDivElement>(null);
  // L'alerte ne prend le focus que pour un refus de la base (ou une coupure) :
  // un formulaire incomplet, lui, met le focus sur le premier champ à reprendre.
  const focusAlerte = useRef(false);
  const focusApresConnexion = useRef(false);

  const lignesPanier = useMemo(() => panierLu?.lignes ?? [], [panierLu]);
  const lignes = useMemo(
    () => lignesPanier.map((l) => ({ variante_id: l.varianteId, quantite: l.quantite })),
    [lignesPanier],
  );
  const cleLignes = JSON.stringify(lignes);

  // Le devis suit le panier et le gouvernorat.
  useEffect(() => {
    if (cleLignes === "[]") return;
    const arret = new AbortController();
    fetch("/commande/devis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{"lignes":${cleLignes},"gouvernorat":${JSON.stringify(champs.gouvernorat || null)}}`,
      signal: arret.signal,
    })
      .then((r) => r.json() as Promise<ReponseDevis>)
      .then((rep) => {
        if (rep.ok) {
          setDevis(rep.devis);
          setDevisEnPanne(false);
        } else setDevisEnPanne(true);
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setDevisEnPanne(true);
      });
    return () => arret.abort();
  }, [cleLignes, champs.gouvernorat, rafraichir]);

  // La session : lue au montage, puis suivie (connexion, déconnexion).
  useEffect(() => {
    if (!compteObligatoire) return;
    const { data } = supabaseNavigateur().auth.onAuthStateChange((_evenement, s) => {
      const u = s?.user;
      setSession(u ? { telephone: u.phone ? `+${u.phone.replace(/^\+/, "")}` : (u.email ?? "") } : null);
    });
    return () => data.subscription.unsubscribe();
  }, [compteObligatoire]);

  // Un acheteur qui revient retrouve sa dernière adresse (carnet du compte,
  // lu sous la RLS : seulement les siennes, dans cette boutique).
  useEffect(() => {
    if (!session) return;
    let actif = true;
    supabaseNavigateur()
      .from("adresses")
      .select("nom_destinataire, ligne1, ligne2, ville, gouvernorat_code, code_postal")
      .eq("boutique_id", boutiqueId)
      .order("par_defaut", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const a = data?.[0];
        if (!actif || !a) return;
        setChamps((c) => ({
          ...c,
          nom: c.nom || a.nom_destinataire,
          ligne1: c.ligne1 || a.ligne1,
          ligne2: c.ligne2 || (a.ligne2 ?? ""),
          ville: c.ville || a.ville,
          gouvernorat: c.gouvernorat || a.gouvernorat_code,
          codePostal: c.codePostal || (a.code_postal ?? ""),
        }));
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

  useEffect(() => {
    if (alerte && focusAlerte.current) {
      focusAlerte.current = false;
      refAlerte.current?.focus();
    }
  }, [alerte]);

  // Numéro confirmé : on passe à l'adresse.
  useEffect(() => {
    if (session && focusApresConnexion.current) {
      focusApresConnexion.current = false;
      refs.current.nom?.focus();
    }
  }, [session]);

  const erreurs = useMemo<Erreurs>(() => {
    const e: Erreurs = {};
    if (compteObligatoire) {
      if (!session) e.telephone = t.commande.numeroAConfirmer;
    } else if (!chiffresTelephone(champs.telephone)) e.telephone = t.commande.telephoneInvalide;
    const nom = champs.nom.trim();
    if (nom.length < 2 || nom.length > 80) e.nom = t.commande.nomInvalide;
    if (champs.ligne1.trim().length < 3) e.ligne1 = t.commande.adresseInvalide;
    if (champs.ville.trim().length < 2) e.ville = t.commande.villeInvalide;
    if (!champs.gouvernorat) e.gouvernorat = t.commande.gouvernoratInvalide;
    if (champs.codePostal.trim() && !/^\d{4}$/.test(champs.codePostal.trim())) e.codePostal = t.commande.codePostalInvalide;
    return e;
  }, [champs, compteObligatoire, session]);

  const change = (cle: keyof Champs) => (valeur: string) => setChamps((c) => ({ ...c, [cle]: valeur }));

  async function envoyerCode() {
    const huit = chiffresTelephone(champs.telephone);
    if (!huit) {
      setErreurIdentite(t.commande.telephoneInvalide);
      refs.current.telephone?.focus();
      return;
    }
    setEnvoiCode(true);
    setErreurIdentite(null);
    const { error } = await supabaseNavigateur().auth.signInWithOtp({ phone: `+216${huit}` });
    setEnvoiCode(false);
    if (error) {
      setErreurIdentite(error.status === 429 || /rate|frequen|seconds/i.test(error.message) ? t.commande.smsTropTot : t.commande.smsEchec);
      return;
    }
    setNumeroCode(`+216${huit}`);
    setSaisieCode("");
    setEtapeCode("code"); // le champ du code prend le focus en apparaissant
    setAttente(ATTENTE_RENVOI);
  }

  async function validerCode(code = saisieCode) {
    if (verification) return;
    if (!/^\d{6}$/.test(code)) {
      setErreurIdentite(t.commande.codeAttendu);
      return;
    }
    setVerification(true);
    setErreurIdentite(null);
    const { data, error } = await supabaseNavigateur().auth.verifyOtp({ phone: numeroCode, token: code, type: "sms" });
    setVerification(false);
    if (error || !data.session) {
      setErreurIdentite(t.commande.codeIncorrect);
      refs.current.code?.focus();
      return;
    }
    focusApresConnexion.current = true;
    setEtapeCode("numero");
    setSaisieCode("");
  }

  async function changerNumero() {
    await supabaseNavigateur().auth.signOut();
    setEtapeCode("numero");
    window.setTimeout(() => refs.current.telephone?.focus(), 0);
  }

  function refus(raison: Raison, message: string) {
    focusAlerte.current = true;
    switch (raison) {
      case "total":
        setRafraichir((n) => n + 1);
        setRecapOuvert(true);
        return setAlerte(t.commande.totalChange);
      case "stock":
      case "panier":
        setRafraichir((n) => n + 1);
        setRecapOuvert(true);
        return setAlerte(t.commande.stockChange);
      case "compte":
        setSession(null);
        return setAlerte(t.commande.reconnexion);
      case "en_attente":
        return setAlerte(t.commande.enAttente);
      case "bloque":
        return setAlerte(t.commande.bloque);
      case "contact":
      case "adresse":
        return setAlerte(message);
      default:
        return setAlerte(t.commande.erreur);
    }
  }

  async function confirmer(evenement: FormEvent) {
    evenement.preventDefault();
    if (envoi) return;
    setTentee(true);
    const premiere = ORDRE.find((c) => erreurs[c]);
    if (premiere) {
      setAlerte(t.commande.aCorriger);
      refs.current[premiere]?.focus();
      return;
    }
    if (!devis || !devis.complet || devis.total_millimes === null) {
      setRafraichir((n) => n + 1);
      setRecapOuvert(true);
      focusAlerte.current = true;
      setAlerte(t.commande.stockChange);
      return;
    }

    setEnvoi(true);
    setAlerte(null);
    const telephone = session?.telephone ?? `+216${chiffresTelephone(champs.telephone)}`;
    try {
      const r = await fetch("/commande/passer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cle: cleDeCommande(boutique, cleLignes),
          lignes,
          contact: { nom: champs.nom.trim(), telephone },
          livraison: {
            ligne1: champs.ligne1.trim(),
            ligne2: champs.ligne2.trim() || null,
            ville: champs.ville.trim(),
            gouvernorat: champs.gouvernorat,
            code_postal: champs.codePostal.trim() || null,
          },
          total: devis.total_millimes,
          note: champs.note.trim() || null,
        }),
      });
      const rep = (await r.json()) as ReponsePasser;
      if (rep.ok) {
        // La page de fin vide le panier et oublie la clé : d'ici là, un
        // nouvel envoi du même panier rendrait la même commande.
        router.push("/commande/merci");
        return; // le bouton reste en « envoi » jusqu'à la page suivante
      }
      refus(rep.raison, rep.message);
    } catch {
      focusAlerte.current = true;
      setAlerte(t.commande.horsLigne);
    }
    setEnvoi(false);
  }

  if (panierLu === null) {
    return <div className="tunnel-attente" aria-busy="true">{t.commun.chargement}</div>;
  }
  if (lignesPanier.length === 0) {
    return (
      <div className="listing-vide tunnel-vide">
        <h2>{t.commande.panierVide}</h2>
        <p>{t.commande.panierVideTexte}</p>
        <a className="btn btn-primaire" href="/catalogue">{t.commun.voirLeCatalogue}</a>
      </div>
    );
  }

  const montre = (cle: keyof Champs) => (tentee ? erreurs[cle] : undefined);
  const zone = devis?.zone ? (devis.zone.nom_fr ?? devis.zone.nom_ar) : null;
  const delai =
    devis?.zone?.delai_jours_min != null && devis.zone.delai_jours_max != null
      ? t.commande.delai(devis.zone.delai_jours_min, devis.zone.delai_jours_max)
      : null;

  return (
    <div className="tunnel" data-gabarit-tunnel={gabarit}>
      <Recap
        panier={lignesPanier}
        devis={devis}
        enPanne={devisEnPanne}
        ouvert={recapOuvert}
        onBascule={() => setRecapOuvert((o) => !o)}
        zone={zone}
      />

      <form className="tunnel-formulaire" noValidate onSubmit={confirmer}>
        {alerte ? (
          <div className="tunnel-alerte" role="alert" tabIndex={-1} ref={refAlerte}>
            {alerte}
          </div>
        ) : null}

        {!cod ? <p className="tunnel-alerte">{t.commande.fermee}</p> : null}

        {/* 1 — Vos coordonnées */}
        <fieldset className="tunnel-etape">
          <legend>
            <span className="tunnel-num" aria-hidden="true">1</span>
            {t.commande.etapeCoordonnees}
          </legend>

          {compteObligatoire && session ? (
            <div className="tunnel-identite">
              <p>
                <Coche taille={18} />
                <span>{t.commande.connecte(telephoneLisible(session.telephone))}</span>
              </p>
              <button type="button" className="btn-lien legende" onClick={changerNumero}>
                {t.commande.changerNumero}
              </button>
            </div>
          ) : compteObligatoire && etapeCode === "code" ? (
            <div className="champ">
              <p className="legende" aria-live="polite">
                {t.commande.codeEnvoye(telephoneLisible(numeroCode))}{" "}
                <button type="button" className="btn-lien" onClick={() => setEtapeCode("numero")}>
                  {t.commande.modifierNumero}
                </button>
              </p>
              <label htmlFor={`${id}-code`}>{t.commande.code}</label>
              <div className="tunnel-rangee">
                <input
                  id={`${id}-code`}
                  ref={(el) => {
                    refs.current.code = el;
                  }}
                  className="tunnel-code"
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={saisieCode}
                  aria-invalid={erreurIdentite ? true : undefined}
                  aria-describedby={erreurIdentite ? `${id}-identite` : undefined}
                  onChange={(e) => {
                    const code = valeurNumerique(e.target.value, 6);
                    setSaisieCode(code);
                    if (code.length === 6) void validerCode(code);
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
              {erreurIdentite ? <p id={`${id}-identite`} className="champ-erreur">{erreurIdentite}</p> : null}
              <button type="button" className="btn-lien legende tunnel-renvoi" onClick={envoyerCode} disabled={attente > 0 || envoiCode}>
                {attente > 0 ? t.commande.renvoyerDans(attente) : t.commande.renvoyer}
              </button>
            </div>
          ) : (
            <div className="champ">
              <label htmlFor={`${id}-telephone`}>{t.commande.telephone}</label>
              <div className="tunnel-rangee">
                <div className="tunnel-tel" data-invalide={(compteObligatoire ? erreurIdentite : montre("telephone")) ? "" : undefined}>
                  <span aria-hidden="true">{t.commande.indicatif}</span>
                  <input
                    id={`${id}-telephone`}
                    ref={(el) => {
                      refs.current.telephone = el;
                    }}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="20 123 456"
                    value={champs.telephone}
                    aria-invalid={(compteObligatoire ? erreurIdentite : montre("telephone")) ? true : undefined}
                    aria-describedby={`${id}-telephone-aide ${id}-telephone-erreur`}
                    onChange={(e) => change("telephone")(e.target.value.slice(0, 20))}
                    onKeyDown={(e: KeyboardEvent) => {
                      if (compteObligatoire && e.key === "Enter") {
                        e.preventDefault();
                        void envoyerCode();
                      }
                    }}
                  />
                </div>
                {compteObligatoire ? (
                  <button type="button" className="btn btn-second" onClick={envoyerCode} disabled={envoiCode}>
                    {envoiCode ? t.commande.envoiCode : t.commande.recevoirCode}
                  </button>
                ) : null}
              </div>
              <p id={`${id}-telephone-aide`} className="legende">
                {compteObligatoire ? t.commande.telephoneAideCompte : t.commande.telephoneAide}
              </p>
              <p id={`${id}-telephone-erreur`} className="champ-erreur">
                {compteObligatoire ? (erreurIdentite ?? montre("telephone")) : montre("telephone")}
              </p>
            </div>
          )}
        </fieldset>

        {/* 2 — Livraison */}
        <fieldset className="tunnel-etape">
          <legend>
            <span className="tunnel-num" aria-hidden="true">2</span>
            {t.commande.etapeLivraison}
          </legend>
          <div className="tunnel-grille">
            <Champ
              id={`${id}-nom`}
              libelle={t.commande.nom}
              erreur={montre("nom")}
              refChamp={(el) => {
                refs.current.nom = el;
              }}
              valeur={champs.nom}
              onChange={change("nom")}
              autoComplete="name"
              longueur={80}
              large
            />
            <Champ
              id={`${id}-ligne1`}
              libelle={t.commande.adresse}
              aide={t.commande.adresseAide}
              erreur={montre("ligne1")}
              refChamp={(el) => {
                refs.current.ligne1 = el;
              }}
              valeur={champs.ligne1}
              onChange={change("ligne1")}
              autoComplete="address-line1"
              large
            />
            <Champ
              id={`${id}-ligne2`}
              libelle={t.commande.complement}
              facultatif
              valeur={champs.ligne2}
              onChange={change("ligne2")}
              autoComplete="address-line2"
              large
            />
            <Champ
              id={`${id}-ville`}
              libelle={t.commande.ville}
              erreur={montre("ville")}
              refChamp={(el) => {
                refs.current.ville = el;
              }}
              valeur={champs.ville}
              onChange={change("ville")}
              autoComplete="address-level2"
              longueur={80}
            />
            <div className="champ">
              <label htmlFor={`${id}-gouvernorat`}>{t.commande.gouvernorat}</label>
              <select
                id={`${id}-gouvernorat`}
                ref={(el) => {
                  refs.current.gouvernorat = el;
                }}
                value={champs.gouvernorat}
                aria-invalid={montre("gouvernorat") ? true : undefined}
                aria-describedby={`${id}-gouvernorat-erreur`}
                onChange={(e) => change("gouvernorat")(e.target.value)}
                autoComplete="address-level1"
              >
                <option value="">{t.commande.choisirGouvernorat}</option>
                {gouvernorats.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.nom}
                  </option>
                ))}
              </select>
              <p id={`${id}-gouvernorat-erreur`} className="champ-erreur">{montre("gouvernorat")}</p>
            </div>
            <Champ
              id={`${id}-cp`}
              libelle={t.commande.codePostal}
              facultatif
              erreur={montre("codePostal")}
              refChamp={(el) => {
                refs.current.codePostal = el;
              }}
              valeur={champs.codePostal}
              onChange={(v) => change("codePostal")(valeurNumerique(v, 4))}
              autoComplete="postal-code"
              inputMode="numeric"
            />
          </div>

          {devis?.gouvernorat && devis.frais_livraison_millimes !== null ? (
            <p className="tunnel-livraison" aria-live="polite">
              <span>{zone ? t.commande.livraisonVers(zone) : t.commande.livraison}</span>
              {delai ? <span>{delai}</span> : null}
              <span className="tunnel-livraison-frais">
                {devis.frais_livraison_millimes === 0 ? t.commande.livraisonOfferte : formatePrix(devis.frais_livraison_millimes)}
              </span>
            </p>
          ) : null}
        </fieldset>

        {/* 3 — Paiement */}
        <fieldset className="tunnel-etape">
          <legend>
            <span className="tunnel-num" aria-hidden="true">3</span>
            {t.commande.etapePaiement}
          </legend>
          <label className="tunnel-mode">
            <input type="radio" name="paiement" value="cod" checked readOnly disabled={!cod} />
            <span className="tunnel-mode-corps">
              <strong>{t.commande.cod}</strong>
              <span className="legende">{t.commande.codTexte}</span>
            </span>
            <Billets taille={22} />
          </label>
          {rappel ? <p className="legende tunnel-rappel">{t.commande.appelConfirmation}</p> : null}
          <div className="champ">
            <label htmlFor={`${id}-note`}>
              {t.commande.note} <span className="facultatif">({t.commande.facultatif})</span>
            </label>
            <textarea
              id={`${id}-note`}
              rows={2}
              maxLength={500}
              placeholder={t.commande.noteAide}
              value={champs.note}
              onChange={(e) => change("note")(e.target.value)}
            />
          </div>
        </fieldset>

        <div className="tunnel-envoi">
          <button type="submit" className="btn btn-primaire btn-bloc tunnel-bouton" disabled={envoi || !cod} aria-busy={envoi || undefined}>
            <span>{envoi ? t.commande.envoi : t.commande.confirmer}</span>
            {devis?.total_millimes != null && !envoi ? <Prix millimes={devis.total_millimes} /> : null}
          </button>
          <p className="legende">{t.commande.donnees}</p>
        </div>
      </form>
    </div>
  );
}

function Champ({
  id,
  libelle,
  aide,
  erreur,
  facultatif = false,
  large = false,
  valeur,
  onChange,
  refChamp,
  autoComplete,
  inputMode,
  longueur = 200,
}: {
  id: string;
  libelle: string;
  aide?: string;
  erreur?: string;
  facultatif?: boolean;
  large?: boolean;
  valeur: string;
  onChange: (valeur: string) => void;
  refChamp?: (el: HTMLInputElement | null) => void;
  autoComplete?: string;
  inputMode?: "numeric" | "text";
  longueur?: number;
}) {
  const decrit = [aide ? `${id}-aide` : null, `${id}-erreur`].filter(Boolean).join(" ");
  return (
    <div className="champ" data-large={large ? "" : undefined}>
      <label htmlFor={id}>
        {libelle} {facultatif ? <span className="facultatif">({t.commande.facultatif})</span> : null}
      </label>
      <input
        id={id}
        ref={refChamp}
        value={valeur}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={longueur}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={decrit}
        onChange={(e) => onChange(e.target.value)}
      />
      {aide ? <p id={`${id}-aide`} className="legende">{aide}</p> : null}
      <p id={`${id}-erreur`} className="champ-erreur">{erreur}</p>
    </div>
  );
}

/** Le récapitulatif : les lignes du panier telles que la base les vend. */
function Recap({
  panier,
  devis,
  enPanne,
  ouvert,
  onBascule,
  zone,
}: {
  panier: LignePanier[];
  devis: Devis | null;
  enPanne: boolean;
  ouvert: boolean;
  onBascule: () => void;
  zone: string | null;
}) {
  const parId = new Map<string, LigneDevis>((devis?.lignes ?? []).map((l) => [l.variante_id, l]));
  const total = devis?.total_millimes ?? devis?.sous_total_millimes ?? null;

  return (
    <aside className="tunnel-recap" data-ouvert={ouvert ? "" : undefined} aria-labelledby="recap-titre">
      <button type="button" className="tunnel-recap-bascule" aria-expanded={ouvert} aria-controls="recap-corps" onClick={onBascule}>
        <span>{ouvert ? t.commande.masquerRecap : t.commande.afficherRecap}</span>
        {total !== null ? <Prix millimes={total} /> : null}
      </button>
      <div id="recap-corps" className="tunnel-recap-corps">
        <div className="tunnel-recap-tete">
          <h2 id="recap-titre">{t.commande.recapitulatif}</h2>
          <button type="button" className="btn-lien legende" onClick={ouvrePanier}>
            {t.commande.retourPanier}
          </button>
        </div>
        <ul className="tunnel-lignes">
          {panier.map((ligne) => {
            const d = parId.get(ligne.varianteId);
            const image = d?.image ?? ligne.image;
            const indisponible = d !== undefined && d.quantite_disponible === 0;
            const reste = d !== undefined && !indisponible && d.quantite_disponible < ligne.quantite ? d.quantite_disponible : null;
            return (
              <li key={ligne.varianteId} className="tunnel-ligne" data-indisponible={indisponible ? "" : undefined}>
                <span className="tunnel-vignette">
                  {image ? <Image src={urlFichier(image)} alt="" fill sizes="64px" /> : null}
                  <span className="tunnel-vignette-n" aria-hidden="true">{ligne.quantite}</span>
                </span>
                <span className="tunnel-ligne-corps">
                  <span className="tunnel-ligne-nom">{d?.produit_nom ?? ligne.libelle}</span>
                  {d?.variante_libelle ? <span className="legende">{d.variante_libelle}</span> : null}
                  <span className="legende">{t.commande.quantite(ligne.quantite)}</span>
                  {indisponible ? (
                    <span className="tunnel-ligne-alerte">
                      {t.commande.indisponible}{" "}
                      <button type="button" className="btn-lien" onClick={() => retireDuPanier(ligne.varianteId)}>
                        {t.commande.retirer}
                      </button>
                    </span>
                  ) : reste !== null ? (
                    <span className="tunnel-ligne-alerte">
                      {t.commande.reste(reste)}{" "}
                      <button type="button" className="btn-lien" onClick={() => ramenePanier(ligne.varianteId, reste)}>
                        {t.commande.ajuster(reste)}
                      </button>
                    </span>
                  ) : null}
                </span>
                <span className="tunnel-ligne-prix">
                  {d?.total_ligne_millimes != null ? <Prix millimes={d.total_ligne_millimes} /> : null}
                </span>
              </li>
            );
          })}
        </ul>

        {devis ? (
          <dl className="tunnel-totaux">
            <div>
              <dt>{t.commande.sousTotal}</dt>
              <dd><Prix millimes={devis.sous_total_millimes} /></dd>
            </div>
            <div>
              <dt>{zone ? t.commande.livraisonVers(zone) : t.commande.livraison}</dt>
              <dd>
                {devis.frais_livraison_millimes === null ? (
                  <span className="legende">{t.commande.selonGouvernorat}</span>
                ) : devis.frais_livraison_millimes === 0 ? (
                  t.commande.livraisonOfferte
                ) : (
                  <Prix millimes={devis.frais_livraison_millimes} />
                )}
              </dd>
            </div>
            <div className="tunnel-total">
              <dt>
                {t.commande.total} <span className="ttc">{t.commande.ttc}</span>
              </dt>
              <dd><Prix millimes={devis.total_millimes ?? devis.sous_total_millimes} fort /></dd>
            </div>
          </dl>
        ) : (
          <p className="legende tunnel-calcul" aria-live="polite">{enPanne ? t.commande.erreur : t.commande.calcul}</p>
        )}
      </div>
    </aside>
  );
}
