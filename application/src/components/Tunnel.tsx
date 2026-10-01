"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { evenementPub, lignesPub } from "@/lib/pixels";
import { signaleEtape } from "@/lib/etapes-visite";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Billets, Camion, Coche, Etiquette, Magasin as IconeMagasin } from "./Icones";
import { Prix } from "./Prix";
import { Connexion, Identification } from "./Connexion";
import { ouvrePanier, ramenePanier, retireDuPanier, usePanierLu } from "@/lib/panier";
import type { LignePanier } from "@/lib/panier-contrat";
import { supabaseNavigateur } from "@/lib/supabase-navigateur";
import {
  chiffresTelephone,
  cleDeCommande,
  codeGarde,
  gardeCode,
  telephoneLisible,
  type CodeDevis,
  type Devis,
  type LigneDevis,
  type Magasin,
  type ModeLivraison,
  type Raison,
  type ReponseDevis,
  type ReponsePasser,
} from "@/lib/commande";
import { sessionAcheteur, type SessionAcheteur, type Verification } from "@/lib/connexion";
import { urlFichier } from "@/lib/photos";
import { formatePrix } from "@/lib/prix";
import { poidsLisible } from "@/lib/caracteristiques";
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
     un code SMS, ou l'adresse e-mail par un code e-mail (réglage
     compte.verification), et devient le compte de l'acheteur dans cette
     boutique. Connecté par e-mail, il saisit ensuite le numéro du livreur
     (non vérifié : l'appel de confirmation le vérifie). Sinon, le numéro
     est un simple champ (commande en invité) ;
   · une commande envoyée deux fois (double clic, réseau coupé) n'est créée
     qu'une fois : la clé d'idempotence survit au rechargement de la page
     tant que le panier ne change pas ;
   · si la boutique propose le retrait en magasin (module), l'acheteur choisit
     entre la livraison à domicile et le retrait, gratuit : plus d'adresse à
     saisir, le magasin, ses horaires et son temps de préparation à la place ;
   · l'achat express (réglage commande.achat_express) : un article venu de sa
     fiche, commandé seul — le panier du navigateur n'est ni lu ni vidé ;
     sur la page de vente (structure Monoproduit), le même formulaire posé
     sous les offres, qui suit l'offre choisie (`integre`) ;
   · un code promo (module promotions), derrière « Vous avez un code
     promo ? » pour ne pas envoyer chercher un code ailleurs : la base dit
     s'il s'applique (la remise, le total) ou pourquoi pas ; il est gardé le
     temps de la visite. Refusé à la commande (sa limite atteinte entre-temps,
     déjà servi pour ce numéro), il tombe et le total se recalcule sans lui.
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
const JOUR_DEVIS = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Africa/Tunis" });

/** Le focus sur un champ, amené au milieu de l'écran : un champ déjà visible
 *  mais caché par l'en-tête collant, le navigateur ne le déplacerait pas.
 *  D'un coup, pas en glissant : le clavier du téléphone, qui s'ouvre au même
 *  moment, interromprait le glissement. */
function amene(el: HTMLElement | null | undefined) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "center", behavior: "auto" });
}

/** Rien à écouter : la valeur gardée ne change que par ce composant. */
const rienAEcouter = () => () => {};

function valeurNumerique(saisie: string, max: number): string {
  return saisie.replace(/\D/g, "").slice(0, max);
}

export function Tunnel({
  gabarit,
  boutiqueId,
  boutique,
  compteObligatoire: compteReglage,
  verification,
  rappel,
  cod,
  gouvernorats,
  retractationJours,
  retrait,
  devisNumero = null,
  express = null,
  codesPromo = false,
  relancePaniers = false,
  integre = false,
}: {
  gabarit: CodeTheme;
  boutiqueId: string;
  boutique: string;
  compteObligatoire: boolean;
  /** Le code de connexion : par SMS, par e-mail, ou au choix (compte.verification). */
  verification: Verification;
  rappel: boolean;
  cod: boolean;
  gouvernorats: Gouvernorat[];
  retractationJours: number;
  /** Le magasin, si la boutique propose le retrait ; null sinon. */
  retrait: Magasin | null;
  /** Accepter un devis (module devis) : ses lignes et ses prix, figés ; le
   *  compte est exigé, la commande passe par public.accepter_devis. */
  devisNumero?: string | null;
  /** L'achat express : la déclinaison et la quantité choisies sur la fiche. */
  express?: { varianteId: string; quantite: number } | null;
  /** Le module promotions : le champ du code promo (jamais sur un devis). */
  codesPromo?: boolean;
  /** Réglage `commande.relance_paniers` : le tunnel prévient qu'un panier laissé peut être rappelé, une fois. */
  relancePaniers?: boolean;
  /** Posé sur la page de vente : « la commande ouverte » (le pixel, l'étape
   *  de l'entonnoir) part au premier geste dans le formulaire, pas à chaque
   *  visite de la page. */
  integre?: boolean;
}) {
  const compteObligatoire = compteReglage || Boolean(devisNumero);
  const id = useId();
  const router = useRouter();
  const panierLu = usePanierLu();
  const [champs, setChamps] = useState<Champs>(CHAMPS_VIDES);
  const [tentee, setTentee] = useState(false);
  const [alerte, setAlerte] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [recapOuvert, setRecapOuvert] = useState(false);
  const [accepte, setAccepte] = useState(false);
  const refConditions = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ModeLivraison>("domicile");
  const enRetrait = mode === "retrait" && retrait !== null;

  // Le code promo tapé (module promotions), gardé le temps de la visite :
  // celui du navigateur tant que l'acheteur n'y touche pas (lu après
  // l'hydratation, la page servie est la même pour tous).
  const avecCodes = codesPromo && !devisNumero;
  const codeDuNavigateur = useSyncExternalStore(rienAEcouter, () => (avecCodes ? codeGarde(boutique) : null), () => null);
  const [codeTouche, setCodeTouche] = useState<string | null | undefined>(undefined);
  const code = codeTouche === undefined ? codeDuNavigateur : codeTouche;
  const changeCode = (nouveau: string | null) => {
    setCodeTouche(nouveau);
    gardeCode(boutique, nouveau);
  };

  // Le devis de la base.
  const [devis, setDevis] = useState<Devis | null>(null);
  const [devisEnPanne, setDevisEnPanne] = useState(false);
  const [messagePanne, setMessagePanne] = useState<{ raison: Raison; texte: string } | null>(null);
  const [rafraichir, setRafraichir] = useState(0);

  // Le compte de l'acheteur (connexion par un code SMS ou e-mail).
  const [session, setSession] = useState<SessionAcheteur | null>(null);
  const connecte = session !== null;

  const refs = useRef<Partial<Record<keyof Champs, HTMLElement | null>>>({});
  const refAlerte = useRef<HTMLDivElement>(null);
  // L'alerte ne prend le focus que pour un refus de la base (ou une coupure) :
  // un formulaire incomplet, lui, met le focus sur le premier champ à reprendre.
  const focusAlerte = useRef(false);
  const focusApresConnexion = useRef(false);

  // Les lignes : celles du panier ; au tunnel d'un devis ou d'un achat
  // express, celles que la base a relues (avec leurs prix), jamais
  // modifiables ici.
  const fige = Boolean(devisNumero || express);
  const lignesLues = useMemo<LignePanier[]>(
    () =>
      (devis?.lignes ?? []).map((l) => ({
        varianteId: l.variante_id,
        produitSlug: l.produit_slug ?? "",
        sku: l.sku ?? "",
        libelle: l.produit_nom ?? "",
        quantite: l.quantite,
        prixMillimesAjout: l.prix_unitaire_millimes ?? 0,
        ajouteLe: "",
        ...(l.image ? { image: l.image } : {}),
      })),
    [devis],
  );
  const lignesPanier = useMemo(() => (fige ? lignesLues : (panierLu?.lignes ?? [])), [fige, lignesLues, panierLu]);
  const lignes = useMemo(
    () =>
      express
        ? [{ variante_id: express.varianteId, quantite: express.quantite }]
        : lignesPanier.map((l) => ({ variante_id: l.varianteId, quantite: l.quantite })),
    [express, lignesPanier],
  );
  const cleLignes = JSON.stringify(lignes);
  const cleDevis = devisNumero ? `devis:${devisNumero}` : cleLignes;

  const debutSignale = useRef(false);

  // Le devis suit le panier, le mode de livraison et le gouvernorat.
  useEffect(() => {
    if (cleDevis === "[]") return;
    const arret = new AbortController();
    const gouvernorat = JSON.stringify(enRetrait ? null : champs.gouvernorat || null);
    const mode = enRetrait ? "retrait" : "domicile";
    const avecCode = avecCodes && code ? `,"code":${JSON.stringify(code)}` : "";
    fetch("/commande/devis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: cleDevis.startsWith("devis:")
        ? `{"devis":${JSON.stringify(cleDevis.slice(6))},"gouvernorat":${gouvernorat},"mode":"${mode}"}`
        : `{"lignes":${cleDevis},"gouvernorat":${gouvernorat},"mode":"${mode}"${avecCode}}`,
      signal: arret.signal,
    })
      .then((r) => r.json() as Promise<ReponseDevis>)
      .then((rep) => {
        if (rep.ok) {
          setDevis(rep.devis);
          setDevisEnPanne(false);
          // Les pixels publicitaires, s'ils sont chargés : la commande ouverte, une fois, au premier chiffrage.
          if (!debutSignale.current && !integre) {
            debutSignale.current = true;
            evenementPub("InitiateCheckout", lignesPub(rep.devis.lignes));
          }
        } else {
          setDevisEnPanne(true);
          setMessagePanne({ raison: rep.raison, texte: rep.message });
        }
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setDevisEnPanne(true);
      });
    return () => arret.abort();
    // Relu aussi à la connexion : le devis d'un client, le prix d'un pro ;
    // et au code promo tapé.
  }, [cleDevis, champs.gouvernorat, enRetrait, rafraichir, connecte, avecCodes, code, integre]);

  // Sur la page de vente, la commande s'ouvre au premier champ touché.
  const commence = () => {
    if (!integre || debutSignale.current) return;
    debutSignale.current = true;
    if (devis) evenementPub("InitiateCheckout", lignesPub(devis.lignes));
    signaleEtape("commande");
  };

  // La session : lue au montage, puis suivie (connexion, déconnexion).
  useEffect(() => {
    if (!compteObligatoire) return;
    const { data } = supabaseNavigateur().auth.onAuthStateChange((_evenement, s) => setSession(sessionAcheteur(s?.user)));
    return () => data.subscription.unsubscribe();
  }, [compteObligatoire]);

  // Connecté par e-mail : le numéro que la boutique lui connaît (sa fiche),
  // sinon il le saisit.
  const sansNumero = Boolean(session && !session.telephone);
  useEffect(() => {
    if (!sansNumero) return;
    let actif = true;
    supabaseNavigateur()
      .rpc("mon_telephone", { p_boutique_id: boutiqueId })
      .then(({ data }) => {
        const huit = typeof data === "string" ? chiffresTelephone(data) : null;
        if (actif && huit) setChamps((c) => ({ ...c, telephone: c.telephone || `${huit.slice(0, 2)} ${huit.slice(2, 5)} ${huit.slice(5)}` }));
      });
    return () => {
      actif = false;
    };
  }, [sansNumero, boutiqueId]);

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
    if (alerte && focusAlerte.current) {
      focusAlerte.current = false;
      refAlerte.current?.focus();
    }
  }, [alerte]);

  // Numéro confirmé : on passe à l'adresse ; adresse e-mail confirmée : au numéro.
  useEffect(() => {
    if (session && focusApresConnexion.current) {
      focusApresConnexion.current = false;
      amene(session.telephone ? refs.current.nom : refs.current.telephone);
    }
  }, [session]);

  const erreurs = useMemo<Erreurs>(() => {
    const e: Erreurs = {};
    if (compteObligatoire) {
      if (!session) e.telephone = t.connexion.aConfirmer(verification);
      else if (!session.telephone && !chiffresTelephone(champs.telephone)) e.telephone = t.commande.telephoneInvalide;
    } else if (!chiffresTelephone(champs.telephone)) e.telephone = t.commande.telephoneInvalide;
    const nom = champs.nom.trim();
    if (nom.length < 2 || nom.length > 80) e.nom = enRetrait ? t.commande.nomRetraitInvalide : t.commande.nomInvalide;
    if (enRetrait) return e;
    if (champs.ligne1.trim().length < 3) e.ligne1 = t.commande.adresseInvalide;
    if (champs.ville.trim().length < 2) e.ville = t.commande.villeInvalide;
    if (!champs.gouvernorat) e.gouvernorat = t.commande.gouvernoratInvalide;
    if (champs.codePostal.trim() && !/^\d{4}$/.test(champs.codePostal.trim())) e.codePostal = t.commande.codePostalInvalide;
    return e;
  }, [champs, compteObligatoire, session, enRetrait, verification]);

  // Une étape remplie se coche (le numéro devient une coche) : on voit où l'on en est.
  const etapeUneFaite = !erreurs.telephone;
  const etapeDeuxFaite = !erreurs.nom && !erreurs.ligne1 && !erreurs.ville && !erreurs.gouvernorat && !erreurs.codePostal;

  const change = (cle: keyof Champs) => (valeur: string) => setChamps((c) => ({ ...c, [cle]: valeur }));

  async function changerCompte() {
    await supabaseNavigateur().auth.signOut();
    window.setTimeout(() => amene(refs.current.telephone), 0);
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
        return setAlerte(t.connexion.reconnexion(verification));
      case "en_attente":
        return setAlerte(t.commande.enAttente);
      case "bloque":
        return setAlerte(t.commande.bloque);
      case "contact":
      case "adresse":
        return setAlerte(message);
      case "conditions":
        setAccepte(false);
        return setAlerte(t.commande.conditionsRequises);
      case "retrait":
        // La boutique a cessé de proposer le retrait entre-temps.
        setMode("domicile");
        return setAlerte(t.commande.retraitIndisponible);
      case "code":
        // Vu appliqué, refusé à la commande : il tombe, le total se recalcule.
        changeCode(null);
        setRecapOuvert(true);
        return setAlerte(t.promo.refuseCommande(message));
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
      amene(refs.current[premiere]);
      return;
    }
    // L'accord explicite aux conditions de vente : la base le revérifie.
    if (!accepte) {
      setAlerte(t.commande.conditionsRequises);
      amene(refConditions.current);
      return;
    }
    if (!devis || !devis.complet || devis.total_millimes === null) {
      setRafraichir((n) => n + 1);
      setRecapOuvert(true);
      focusAlerte.current = true;
      const sousMinimum = devis?.lignes.some((l) => l.quantite_disponible > 0 && l.quantite < (l.quantite_min ?? 1));
      setAlerte(sousMinimum ? t.commande.minimumNonAtteint : t.commande.stockChange);
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
          cle: cleDeCommande(boutique, cleDevis),
          ...(devisNumero ? { devis: devisNumero } : {}),
          ...(express ? { origine: "express" } : {}),
          lignes,
          contact: { nom: champs.nom.trim(), telephone, ...(session?.email ? { email: session.email } : {}), accepte_conditions: accepte },
          livraison: enRetrait
            ? { mode: "retrait" }
            : {
                mode: "domicile",
                ligne1: champs.ligne1.trim(),
                ligne2: champs.ligne2.trim() || null,
                ville: champs.ville.trim(),
                gouvernorat: champs.gouvernorat,
                code_postal: champs.codePostal.trim() || null,
              },
          total: devis.total_millimes,
          note: champs.note.trim() || null,
          // Le code, s'il s'applique : un code refusé ne part pas.
          ...(avecCodes && code && devis.code?.applique ? { code } : {}),
        }),
      });
      const rep = (await r.json()) as ReponsePasser;
      if (rep.ok) {
        // La page de fin vide le panier et oublie la clé : d'ici là, un
        // nouvel envoi du même panier rendrait la même commande.
        gardeCode(boutique, null);
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

  if (devisNumero && devis === null) {
    // Le lien du devis ouvert sans session : la connexion, sur place ; le
    // devis se relit dès qu'elle s'ouvre.
    if (devisEnPanne && messagePanne?.raison === "compte") {
      return connecte ? (
        <div className="tunnel-attente" aria-busy="true">{t.commun.chargement}</div>
      ) : (
        <div className="tunnel-vide">
          <Connexion titre={t.devis.connexionAccepterTitre} texte={t.devis.connexionAccepterTexte(verification)} verification={verification} />
        </div>
      );
    }
    return devisEnPanne ? (
      <div className="listing-vide tunnel-vide">
        <h2>{t.devis.indisponible}</h2>
        <p>{messagePanne?.texte ?? t.commande.erreur}</p>
        <a className="btn btn-primaire" href="/compte">{t.devis.voirMesDevis}</a>
      </div>
    ) : (
      <div className="tunnel-attente" aria-busy="true">{t.commun.chargement}</div>
    );
  }
  if (express && devis === null) {
    return devisEnPanne ? (
      <div className="listing-vide tunnel-vide">
        <h2>{t.commande.expressIndisponible}</h2>
        <p>{messagePanne?.texte ?? t.commande.erreur}</p>
        <a className="btn btn-primaire" href="/catalogue">{t.commande.expressRetour}</a>
      </div>
    ) : (
      <div className="tunnel-attente" aria-busy="true">{t.commun.chargement}</div>
    );
  }
  if (panierLu === null && !fige) {
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
  // Le numéro du livreur : en invité, ou connecté par e-mail.
  const champTelephone = (aide: string) => (
    <div className="champ">
      <label htmlFor={`${id}-telephone`}>{t.commande.telephone}</label>
      <div className="tunnel-rangee">
        <div className="tunnel-tel" data-invalide={montre("telephone") ? "" : undefined}>
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
            aria-invalid={montre("telephone") ? true : undefined}
            aria-describedby={`${id}-telephone-aide ${id}-telephone-erreur`}
            onChange={(e) => change("telephone")(e.target.value.slice(0, 20))}
          />
        </div>
      </div>
      <p id={`${id}-telephone-aide`} className="legende">{aide}</p>
      <p id={`${id}-telephone-erreur`} className="champ-erreur">{montre("telephone")}</p>
    </div>
  );
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
        retrait={enRetrait}
        fige={fige}
      />

      <form className="tunnel-formulaire" noValidate onSubmit={confirmer} onFocus={integre ? commence : undefined}>
        {alerte ? (
          <div className="tunnel-alerte" role="alert" tabIndex={-1} ref={refAlerte}>
            {alerte}
          </div>
        ) : null}

        {!cod ? <p className="tunnel-alerte">{t.commande.fermee}</p> : null}

        {/* 1 — Vos coordonnées */}
        <fieldset className="tunnel-etape" data-faite={etapeUneFaite ? "" : undefined}>
          <legend>
            <span className="tunnel-num" aria-hidden="true">1</span>
            {t.commande.etapeCoordonnees}
          </legend>

          {compteObligatoire && session ? (
            <>
              <div className="tunnel-identite">
                <p>
                  <Coche taille={18} />
                  <span>
                    {session.telephone ? t.commande.connecte(telephoneLisible(session.telephone)) : t.connexion.connecteEmail(session.email ?? "")}
                  </span>
                </p>
                <button type="button" className="btn-lien legende" onClick={changerCompte}>
                  {session.telephone ? t.commande.changerNumero : t.connexion.changerEmail}
                </button>
              </div>
              {session.telephone ? null : champTelephone(t.connexion.telephoneAideEmail)}
              {relancePaniers && !devisNumero ? <p className="legende tunnel-relance">{t.commande.relancePaniers}</p> : null}
            </>
          ) : compteObligatoire ? (
            <Identification
              verification={verification}
              bouton="second"
              aide
              erreurExterne={montre("telephone")}
              refSaisie={(el) => {
                refs.current.telephone = el;
              }}
              surConnexion={() => {
                focusApresConnexion.current = true;
              }}
            />
          ) : (
            champTelephone(t.commande.telephoneAide)
          )}
        </fieldset>

        {/* 2 — Livraison */}
        <fieldset className="tunnel-etape" data-faite={etapeDeuxFaite ? "" : undefined}>
          <legend>
            <span className="tunnel-num" aria-hidden="true">2</span>
            {t.commande.etapeLivraison}
          </legend>
          {retrait ? (
            <div className="tunnel-choix" role="radiogroup" aria-label={t.commande.modeLivraison}>
              <label className="tunnel-mode">
                <input type="radio" name="mode-livraison" value="domicile" checked={!enRetrait} onChange={() => setMode("domicile")} />
                <span className="tunnel-mode-corps">
                  <strong>{t.commande.modeDomicile}</strong>
                  <span className="legende">{t.commande.modeDomicileTexte}</span>
                </span>
                <Camion taille={22} />
              </label>
              <label className="tunnel-mode">
                <input type="radio" name="mode-livraison" value="retrait" checked={enRetrait} onChange={() => setMode("retrait")} />
                <span className="tunnel-mode-corps">
                  <strong>{t.commande.modeRetrait} <span className="tunnel-gratuit">{t.commande.gratuit}</span></strong>
                  <span className="legende">{t.commande.modeRetraitTexte(retrait.ville, t.commande.pretSous(retrait.delai_heures))}</span>
                </span>
                <IconeMagasin taille={22} />
              </label>
            </div>
          ) : null}
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
            {enRetrait && retrait ? (
              <div className="tunnel-magasin" data-large="">
                <p className="tunnel-magasin-titre">{t.commande.retraitOu}</p>
                <address>
                  {retrait.adresse}
                  <br />
                  {retrait.ville}
                </address>
                {retrait.horaires ? <p>{retrait.horaires}</p> : null}
                <p className="tunnel-magasin-delai">{t.commande.pretSous(retrait.delai_heures)}</p>
                <p className="legende">{t.commande.retraitSuite}</p>
              </div>
            ) : (
            <>
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
            </>
            )}
          </div>

          {!enRetrait && devis?.gouvernorat && devis.frais_livraison_millimes !== null ? (
            <p className="tunnel-livraison" aria-live="polite">
              <span>{zone ? t.commande.livraisonVers(zone) : t.commande.livraison}</span>
              {delai ? <span>{delai}</span> : null}
              <span className="tunnel-livraison-frais">
                {devis.frais_livraison_millimes === 0 || livraisonParCode(devis) ? t.commande.livraisonOfferte : formatePrix(devis.frais_livraison_millimes)}
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
              <strong>{enRetrait ? t.commande.codRetrait : t.commande.cod}</strong>
              <span className="legende">{enRetrait ? t.commande.codTexteRetrait : t.commande.codTexte}</span>
            </span>
            <Billets taille={22} />
          </label>
          {rappel ? <p className="legende tunnel-rappel">{enRetrait ? t.commande.appelConfirmationRetrait : t.commande.appelConfirmation}</p> : null}
          {avecCodes ? <ChampCode id={id} code={code} devis={devis} onAppliquer={changeCode} onRetirer={() => changeCode(null)} /> : null}
          <div className="champ">
            <label htmlFor={`${id}-note`}>
              {enRetrait ? t.commande.noteRetrait : t.commande.note} <span className="facultatif">({t.commande.facultatif})</span>
            </label>
            <textarea
              id={`${id}-note`}
              rows={2}
              maxLength={500}
              placeholder={enRetrait ? t.commande.noteRetraitAide : t.commande.noteAide}
              value={champs.note}
              onChange={(e) => change("note")(e.target.value)}
            />
          </div>
        </fieldset>

        <div className="tunnel-envoi">
          <div className="tunnel-conditions" data-invalide={tentee && !accepte ? "" : undefined}>
            <label>
              <input
                type="checkbox"
                ref={refConditions}
                checked={accepte}
                onChange={(e) => setAccepte(e.target.checked)}
                aria-invalid={tentee && !accepte ? true : undefined}
                aria-describedby={`${id}-conditions-aide ${id}-conditions-erreur`}
              />
              <span>
                {t.commande.conditionsAvant}{" "}
                <a href="/conditions-de-vente" target="_blank" rel="noopener">{t.commande.conditionsLien}</a>{" "}
                {t.commande.conditionsEt}{" "}
                <a href="/confidentialite" target="_blank" rel="noopener">{t.commande.confidentialiteLien}</a>.
              </span>
            </label>
            <p id={`${id}-conditions-aide`} className="legende">{t.commande.retractation(retractationJours)}</p>
            {/* Une fois dit, le message garde sa place quand la case est cochée :
                sinon le bouton remonterait sous le doigt qui va le toucher. */}
            <p id={`${id}-conditions-erreur`} className="champ-erreur" data-masque={tentee && accepte ? "" : undefined}>
              {tentee ? t.commande.conditionsManquantes : ""}
            </p>
          </div>
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

/** La livraison offerte par un code promo appliqué. */
function livraisonParCode(devis: Devis): boolean {
  return Boolean(devis.code?.applique && devis.code.type === "livraison");
}

/** « bienvenue 10 » → « BIENVENUE10 », comme la base range les codes. */
const normalise = (code: string) => code.toUpperCase().replace(/\s+/g, "");

/** Pourquoi un code ne s'applique pas, dit à l'acheteur. */
function raisonDuCode(info: CodeDevis): string {
  const r = t.promo.raisons;
  switch (info.raison) {
    case "pas_encore":
      return r.pas_encore(info.debut ? JOUR_DEVIS.format(new Date(info.debut)) : "");
    case "minimum":
      return r.minimum(formatePrix(info.minimum_millimes ?? 0), formatePrix(info.manque_millimes ?? 0));
    case "coupe": return r.coupe;
    case "expire": return r.expire;
    case "devis": return r.devis;
    case "epuise": return r.epuise;
    case "deja": return r.deja;
    case "retrait": return r.retrait;
    case "offerte": return r.offerte;
    default: return r.inconnu;
  }
}

/** Le code promo, replié derrière « Vous avez un code promo ? » : un champ
 *  vide qui s'étale donnerait envie d'aller chercher un code ailleurs.
 *  Tapé, la base dit s'il s'applique ; Entrée l'applique sans envoyer la
 *  commande. Appliqué, il devient une pastille qu'on peut retirer. */
function ChampCode({ id, code, devis, onAppliquer, onRetirer }: {
  id: string;
  code: string | null;
  devis: Devis | null;
  onAppliquer: (code: string) => void;
  onRetirer: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState<string | null>(null);
  const refSaisie = useRef<HTMLInputElement>(null);
  const refApplique = useRef<HTMLDivElement>(null);
  const aFocaliser = useRef<"saisie" | "applique" | null>(null);

  // La réponse de la base pour CE code (une réponse plus ancienne ne compte pas).
  const info = code && devis?.code && devis.code.code === normalise(code) ? devis.code : null;
  const enCours = Boolean(code) && !info;
  const applique = Boolean(info?.applique);
  const refuse = info && !info.applique ? raisonDuCode(info) : null;
  const deplie = ouvert || Boolean(code);
  const valeur = saisie ?? code ?? "";

  useEffect(() => {
    const cible = aFocaliser.current === "saisie" ? refSaisie.current : aFocaliser.current === "applique" && applique ? refApplique.current : null;
    if (!cible) return;
    aFocaliser.current = null;
    cible.focus();
  });

  const appliquer = () => {
    const c = normalise(valeur);
    if (!c) return;
    aFocaliser.current = "applique";
    onAppliquer(c);
  };

  if (!deplie) {
    return (
      <div className="tunnel-promo">
        <button type="button" className="btn-lien tunnel-promo-ouvrir" aria-expanded={false}
          onClick={() => { aFocaliser.current = "saisie"; setOuvert(true); }}>
          <Etiquette taille={16} /> {t.promo.ouvrir}
        </button>
      </div>
    );
  }
  if (applique && info) {
    const offerte = info.type === "livraison";
    return (
      <div className="tunnel-promo tunnel-promo-applique" ref={refApplique} tabIndex={-1} role="status">
        <span className="tunnel-promo-puce">
          <Coche taille={14} /> <b>{info.code}</b> <span>{t.promo.offre(info.type, info.valeur, formatePrix)}</span>
        </span>
        <span className="legende">
          {offerte
            ? devis?.frais_livraison_millimes === null ? t.promo.livraisonAttente : t.promo.livraisonOfferte
            : info.type === "montant" ? t.promo.deduit : t.promo.economie(formatePrix(devis?.remise_millimes ?? 0))}
        </span>
        <button type="button" className="btn-lien legende" aria-label={t.promo.retirer}
          onClick={() => { aFocaliser.current = "saisie"; setSaisie(""); setOuvert(true); onRetirer(); }}>
          {t.promo.retirerCourt}
        </button>
      </div>
    );
  }
  return (
    <div className="champ tunnel-promo">
      <label htmlFor={`${id}-code`}>{t.promo.libelle}</label>
      <div className="tunnel-promo-rangee">
        <input
          id={`${id}-code`}
          ref={refSaisie}
          value={valeur}
          maxLength={40}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="done"
          aria-invalid={refuse ? true : undefined}
          aria-describedby={`${id}-code-message`}
          onChange={(e) => setSaisie(e.target.value.replace(/[^A-Za-z0-9 _-]/g, ""))}
          onKeyDown={(e) => {
            // Entrée applique le code : elle n'envoie pas la commande.
            if (e.key === "Enter") {
              e.preventDefault();
              appliquer();
            }
          }}
        />
        <button type="button" className="btn btn-second" onClick={appliquer} disabled={!normalise(valeur) || enCours} aria-busy={enCours || undefined}>
          {enCours ? t.promo.verification : t.promo.appliquer}
        </button>
      </div>
      <p id={`${id}-code-message`} className="champ-erreur" aria-live="polite">{refuse ?? ""}</p>
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
  retrait,
  fige = false,
}: {
  panier: LignePanier[];
  devis: Devis | null;
  enPanne: boolean;
  ouvert: boolean;
  onBascule: () => void;
  zone: string | null;
  retrait: boolean;
  /** Les lignes d'un devis : ni retirer, ni ajuster, ni revenir au panier. */
  fige?: boolean;
}) {
  const parId = new Map<string, LigneDevis>((devis?.lignes ?? []).map((l) => [l.variante_id, l]));
  // Sans gouvernorat, pas de frais : le total des articles (remise déduite).
  const total = devis ? (devis.total_millimes ?? devis.sous_total_millimes - (devis.remise_millimes ?? 0)) : null;
  const offerteParCode = devis ? livraisonParCode(devis) : false;

  return (
    <aside className="tunnel-recap" data-ouvert={ouvert ? "" : undefined} aria-labelledby="recap-titre">
      <button type="button" className="tunnel-recap-bascule" aria-expanded={ouvert} aria-controls="recap-corps" onClick={onBascule}>
        <span>{ouvert ? t.commande.masquerRecap : t.commande.afficherRecap}</span>
        {total !== null ? <Prix millimes={total} /> : null}
      </button>
      <div id="recap-corps" className="tunnel-recap-corps">
        <div className="tunnel-recap-tete">
          <h2 id="recap-titre">{t.commande.recapitulatif}</h2>
          {fige ? null : (
            <button type="button" className="btn-lien legende" onClick={ouvrePanier}>
              {t.commande.retourPanier}
            </button>
          )}
        </div>
        <ul className="tunnel-lignes">
          {panier.map((ligne) => {
            const d = parId.get(ligne.varianteId);
            const image = d?.image ?? ligne.image;
            const indisponible = d !== undefined && d.quantite_disponible === 0;
            const reste = d !== undefined && !indisponible && d.quantite_disponible < ligne.quantite ? d.quantite_disponible : null;
            // Sous le minimum de la déclinaison (des vis par dix) : le devis
            // n'est pas complet ; on propose d'y passer d'un geste.
            const minimum = d?.quantite_min ?? 1;
            const sousMinimum = d !== undefined && !indisponible && reste === null && ligne.quantite < minimum;
            return (
              <li key={ligne.varianteId} className="tunnel-ligne" data-indisponible={indisponible ? "" : undefined}>
                <span className="tunnel-vignette">
                  {image ? (
                    <Image src={urlFichier(image)} alt="" fill sizes="64px" />
                  ) : (
                    <span className="attente-photo" aria-hidden="true">
                      <span className="filigrane" />
                    </span>
                  )}
                  <span className="tunnel-vignette-n" aria-hidden="true">{ligne.quantite}</span>
                </span>
                <span className="tunnel-ligne-corps">
                  <span className="tunnel-ligne-nom">{d?.produit_nom ?? ligne.libelle}</span>
                  {d?.variante_libelle ? <span className="legende">{d.variante_libelle}</span> : null}
                  <span className="legende">{t.commande.quantite(ligne.quantite)}</span>
                  {indisponible ? (
                    <span className="tunnel-ligne-alerte">
                      {t.commande.indisponible}{" "}
                      {fige ? null : (
                        <button type="button" className="btn-lien" onClick={() => retireDuPanier(ligne.varianteId)}>
                          {t.commande.retirer}
                        </button>
                      )}
                    </span>
                  ) : reste !== null ? (
                    <span className="tunnel-ligne-alerte">
                      {t.commande.reste(reste)}{" "}
                      {fige ? null : (
                        <button type="button" className="btn-lien" onClick={() => ramenePanier(ligne.varianteId, reste)}>
                          {t.commande.ajuster(reste)}
                        </button>
                      )}
                    </span>
                  ) : sousMinimum ? (
                    <span className="tunnel-ligne-alerte">
                      {t.commande.sousMinimum(minimum)}{" "}
                      {fige ? null : (
                        <button type="button" className="btn-lien" onClick={() => ramenePanier(ligne.varianteId, minimum)}>
                          {t.commande.ajuster(minimum)}
                        </button>
                      )}
                    </span>
                  ) : null}
                </span>
                <span className="tunnel-ligne-prix">
                  {d?.total_ligne_millimes != null ? <Prix millimes={d.total_ligne_millimes} /> : null}
                  {d?.total_sans_palier_millimes ? (
                    <s className="tunnel-ligne-public">{formatePrix(d.total_sans_palier_millimes)}</s>
                  ) : d?.prix_public_millimes ? (
                    <s className="tunnel-ligne-public">{formatePrix(d.prix_public_millimes * ligne.quantite)}</s>
                  ) : null}
                  {d?.palier ? <span className="tunnel-ligne-palier">{t.commande.palier(d.palier)}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>

        {devis ? (
          <dl className="tunnel-totaux">
            {devis.tarif === "devis" && devis.devis ? (
              <div className="tunnel-tarif-pro tunnel-tarif-devis">
                <dt>{t.devis.tarif(devis.devis.numero)}</dt>
                <dd className="legende">{t.devis.valableJusquau(JOUR_DEVIS.format(new Date(`${devis.devis.valide_jusqu_au}T12:00:00`)))}</dd>
              </div>
            ) : null}
            {devis.tarif === "pro" ? (
              <div className="tunnel-tarif-pro">
                <dt><span className="pro-badge">{t.pro.badge}</span> {t.pro.tarifApplique}</dt>
                <dd>{devis.economie_pro_millimes ? <b>{t.pro.economie(formatePrix(devis.economie_pro_millimes))}</b> : null}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t.commande.sousTotal}</dt>
              <dd><Prix millimes={devis.sous_total_millimes} /></dd>
            </div>
            <div>
              <dt>{retrait ? t.commande.modeRetrait : zone ? t.commande.livraisonVers(zone) : t.commande.livraison}</dt>
              <dd>
                {retrait && devis.mode === "retrait" ? (
                  t.commande.gratuit
                ) : offerteParCode ? (
                  <>
                    {devis.frais_livraison_millimes ? <s className="tunnel-barre">{formatePrix(devis.frais_livraison_millimes)}</s> : null}{" "}
                    {t.commande.livraisonOfferte}
                  </>
                ) : devis.frais_livraison_millimes === null ? (
                  <span className="legende">{t.commande.selonGouvernorat}</span>
                ) : devis.frais_livraison_millimes === 0 ? (
                  t.commande.livraisonOfferte
                ) : (
                  <Prix millimes={devis.frais_livraison_millimes} />
                )}
              </dd>
            </div>
            {devis.mode === "domicile" && devis.supplement_poids_millimes && devis.poids_grammes ? (
              <div className="tunnel-totaux-detail">
                <dt>{t.commande.supplementPoids(poidsLisible(devis.poids_grammes))}</dt>
                <dd><Prix millimes={devis.supplement_poids_millimes} /></dd>
              </div>
            ) : null}
            {devis.code?.applique && devis.code.type !== "livraison" && devis.remise_millimes ? (
              <div className="tunnel-remise">
                <dt>{t.promo.ligne(devis.code.code)}</dt>
                <dd>−<Prix millimes={devis.remise_millimes} /></dd>
              </div>
            ) : null}
            <div className="tunnel-total">
              <dt>
                {t.commande.total} <span className="ttc">{t.commande.ttc}</span>
              </dt>
              <dd><Prix millimes={total ?? devis.sous_total_millimes} fort /></dd>
            </div>
          </dl>
        ) : (
          <p className="legende tunnel-calcul" aria-live="polite">{enPanne ? t.commande.erreur : t.commande.calcul}</p>
        )}
      </div>
    </aside>
  );
}
