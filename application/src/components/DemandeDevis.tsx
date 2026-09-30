"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Coche } from "./Icones";
import { Prix } from "./Prix";
import { Connexion } from "./Connexion";
import { ChampTelephoneDuCompte, renseigneTelephone, useTelephoneDuCompte } from "./TelephoneDuCompte";
import { usePanierLu, videPanier } from "@/lib/panier";
import { totalMillimes } from "@/lib/panier-contrat";
import { supabaseNavigateur } from "@/lib/supabase-navigateur";
import { urlFichier } from "@/lib/photos";
import type { Verification } from "@/lib/connexion";
import { t } from "@/lib/i18n";

/* ============================================================================
   LA DEMANDE DE DEVIS (module devis) — le panier du navigateur, envoyé à la
   boutique avec un mot (le chantier, les délais) : public.demander_devis.
   La boutique chiffre chaque ligne et répond dans « Mes commandes ».

   Connecté par un code SMS ou e-mail (sur place, sans quitter la page) : la
   réponse arrive dans « Mes commandes ». Un compte e-mail donne son numéro
   une fois, pour être rappelé. Une fois envoyé, le panier est devenu une
   demande : il se vide.
   ========================================================================== */

const INDICES_LISIBLES = ["panier", "message", "trop", "bloque", "module", "compte", "telephone"];

export function DemandeDevis({ boutiqueId, verification }: { boutiqueId: string; verification: Verification }) {
  const panier = usePanierLu();
  const [session, setSession] = useState<boolean | undefined>(undefined);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<{ indice: string | null; texte: string } | null>(null);
  const [envoyee, setEnvoyee] = useState<string | null>(null);
  const numero = useTelephoneDuCompte(boutiqueId, Boolean(session));
  const numeroManque = numero.telephone === null;

  useEffect(() => {
    const { data } = supabaseNavigateur().auth.onAuthStateChange((_evenement, s) => setSession(Boolean(s)));
    return () => data.subscription.unsubscribe();
  }, []);

  async function envoyer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (envoi || !panier) return;
    const f = new FormData(e.currentTarget);
    const message = String(f.get("message") ?? "").trim();
    const champs = e.currentTarget.elements;
    setEnvoi(true);
    setErreur(null);
    if (numeroManque) {
      const refus = await renseigneTelephone(boutiqueId, String(f.get("telephone") ?? ""));
      if (refus) {
        setEnvoi(false);
        setErreur({ indice: "telephone", texte: refus });
        (champs.namedItem("telephone") as HTMLInputElement | null)?.focus();
        return;
      }
      numero.relire();
    }
    const { data, error } = await supabaseNavigateur().rpc("demander_devis", {
      p_boutique_id: boutiqueId,
      p_lignes: panier.lignes.map((l) => ({ variante_id: l.varianteId, quantite: l.quantite })),
      p_message: message || null,
    });
    setEnvoi(false);
    if (error) {
      if (error.hint === "telephone") numero.manque();
      setErreur({ indice: error.hint ?? null, texte: INDICES_LISIBLES.includes(error.hint ?? "") ? error.message : t.devis.erreur });
      return;
    }
    setEnvoyee((data as { numero: string }).numero);
    videPanier();
  }

  if (envoyee) {
    return (
      <div className="devis-envoyee" role="status">
        <span className="devis-envoyee-icone" aria-hidden="true"><Coche taille={26} /></span>
        <h2>{t.devis.envoyee(envoyee)}</h2>
        <p className="legende">{t.devis.envoyeeTexte}</p>
        <Link className="btn btn-primaire" href="/compte">{t.devis.voirMesDevis}</Link>
      </div>
    );
  }
  if (panier === null || session === undefined) {
    return <div className="compte-attente" aria-busy="true">{t.commun.chargement}</div>;
  }
  if (panier.lignes.length === 0) {
    return (
      <div className="listing-vide">
        <h2>{t.devis.panierVide}</h2>
        <p>{t.devis.panierVideTexte}</p>
        <Link className="btn btn-primaire" href="/catalogue">{t.commun.voirLeCatalogue}</Link>
      </div>
    );
  }

  return (
    <div className="devis-page-corps">
      <section className="devis-panier" aria-labelledby="devis-panier-titre">
        <div className="devis-panier-tete">
          <h2 id="devis-panier-titre">{t.devis.articles(panier.lignes.length)}</h2>
          <span className="legende">{t.devis.prixIndicatif}</span>
        </div>
        <ul className="devis-lignes" role="list">
          {panier.lignes.map((l) => (
            <li key={l.varianteId} className="devis-ligne">
              <span className="devis-vignette" aria-hidden="true">
                {l.image ? <Image src={urlFichier(l.image)} alt="" fill sizes="56px" /> : <span className="panier-vignette-attente">{l.libelle.trim().charAt(0)}</span>}
              </span>
              <span className="devis-ligne-corps">
                <span className="devis-ligne-nom">{l.libelle}</span>
                <span className="legende tabular-nums">{l.sku} · {t.commande.quantite(l.quantite)}</span>
              </span>
              <span className="devis-ligne-prix"><Prix millimes={l.prixMillimesAjout * l.quantite} /></span>
            </li>
          ))}
        </ul>
        <p className="devis-panier-total">
          <span>{t.panier.total}</span>
          <Prix millimes={totalMillimes(panier)} />
        </p>
      </section>

      {session ? (
        <form className="devis-formulaire" onSubmit={envoyer} noValidate>
          {numeroManque ? (
            <ChampTelephoneDuCompte id="devis-telephone" invalide={erreur?.indice === "telephone"} decrit="devis-erreur" />
          ) : null}
          <div className="champ">
            <label htmlFor="devis-message">{t.devis.message} <span className="facultatif">{t.commande.facultatif}</span></label>
            <textarea id="devis-message" name="message" rows={4} maxLength={1000} placeholder={t.devis.messageExemple}
                      aria-describedby="devis-message-aide devis-erreur" />
            <span id="devis-message-aide" className="legende">{t.devis.messageAide}</span>
          </div>
          <p id="devis-erreur" className="champ-erreur" role={erreur ? "alert" : undefined}>{erreur?.texte}</p>
          <button type="submit" className="btn btn-primaire btn-bloc" disabled={envoi}>
            {envoi ? t.devis.envoi : t.devis.envoyer}
          </button>
        </form>
      ) : (
        <Connexion titre={t.devis.connexionTitre(verification)} texte={t.devis.connexionTexte(verification)} verification={verification} />
      )}
    </div>
  );
}
