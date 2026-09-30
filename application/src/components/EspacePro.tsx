"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Coche, Lot } from "./Icones";
import { ChampTelephoneDuCompte, renseigneTelephone, useTelephoneDuCompte } from "./TelephoneDuCompte";
import { supabaseNavigateur } from "@/lib/supabase-navigateur";
import { t } from "@/lib/i18n";

/* ============================================================================
   L'ESPACE PROFESSIONNEL (module comptes_pro) — dans « Mes commandes » :
   le plombier, l'électricien demande un compte pro (raison sociale,
   matricule fiscal, métier, un mot) ; la boutique le valide depuis son
   backoffice ; ses prix pro s'affichent alors sur les fiches et au panier.

   Lu et écrit dans le navigateur, avec la session de l'acheteur
   (public.mon_compte_pro, public.demander_compte_pro) : l'équipe ne lui dit
   que sa décision et, s'il y a lieu, son motif. Un compte ouvert par
   e-mail donne d'abord son numéro, une fois (TelephoneDuCompte.tsx).
   ========================================================================== */

type ComptePro = {
  statut: "demande" | "valide" | "refuse" | "retire";
  raison_sociale: string;
  matricule_fiscal: string | null;
  metier: string | null;
  message: string | null;
  motif: string | null;
  demande_le: string;
  decide_le: string | null;
};

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Tunis" });
const INDICES_LISIBLES = ["raison_sociale", "matricule", "metier", "message", "deja", "module", "bloque", "compte", "telephone"];

export function EspacePro({ boutiqueId }: { boutiqueId: string }) {
  // undefined : pas encore lu ; null : aucune demande.
  const [compte, setCompte] = useState<ComptePro | null | undefined>(undefined);
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<{ indice: string | null; texte: string } | null>(null);
  const [envoyee, setEnvoyee] = useState(false);
  const numero = useTelephoneDuCompte(boutiqueId, true);
  const numeroManque = numero.telephone === null;

  useEffect(() => {
    let actif = true;
    supabaseNavigateur()
      .rpc("mon_compte_pro", { p_boutique_id: boutiqueId })
      .then(({ data, error }) => {
        if (actif) setCompte(error ? null : ((data as ComptePro | null) ?? null));
      });
    return () => {
      actif = false;
    };
  }, [boutiqueId]);

  async function envoyer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (envoi) return;
    const f = new FormData(e.currentTarget);
    const texte = (cle: string) => String(f.get(cle) ?? "").trim();
    if (texte("raison_sociale").length < 2) {
      setErreur({ indice: "raison_sociale", texte: t.pro.raisonRequise });
      (e.currentTarget.elements.namedItem("raison_sociale") as HTMLInputElement | null)?.focus();
      return;
    }
    const champs = e.currentTarget.elements;
    setEnvoi(true);
    setErreur(null);
    if (numeroManque) {
      const refus = await renseigneTelephone(boutiqueId, texte("telephone"));
      if (refus) {
        setEnvoi(false);
        setErreur({ indice: "telephone", texte: refus });
        (champs.namedItem("telephone") as HTMLInputElement | null)?.focus();
        return;
      }
      numero.relire();
    }
    const { data, error } = await supabaseNavigateur().rpc("demander_compte_pro", {
      p_boutique_id: boutiqueId,
      p_raison_sociale: texte("raison_sociale"),
      p_matricule_fiscal: texte("matricule_fiscal") || null,
      p_metier: texte("metier") || null,
      p_message: texte("message") || null,
    });
    setEnvoi(false);
    if (error) {
      const indice = error.hint ?? null;
      if (indice === "telephone") numero.manque();
      setErreur({ indice, texte: INDICES_LISIBLES.includes(indice ?? "") ? error.message : t.pro.erreur });
      return;
    }
    setCompte(data as ComptePro);
    setOuvert(false);
    setEnvoyee(true);
  }

  if (compte === undefined) return null;

  const formulaire = (
    <form className="pro-formulaire" onSubmit={envoyer} noValidate aria-labelledby="pro-formulaire-titre">
      <h3 id="pro-formulaire-titre">{compte ? t.pro.modifierTitre : t.pro.formulaireTitre}</h3>
      <div className="pro-champs">
        <div className="champ pro-champ-large">
          <label htmlFor="pro-raison">{t.pro.raisonSociale}</label>
          <input id="pro-raison" name="raison_sociale" maxLength={120} required autoComplete="organization"
                 defaultValue={compte?.raison_sociale ?? ""} placeholder={t.pro.raisonExemple}
                 aria-invalid={erreur?.indice === "raison_sociale" ? true : undefined} aria-describedby="pro-erreur" />
        </div>
        <div className="champ">
          <label htmlFor="pro-matricule">{t.pro.matricule} <span className="facultatif">{t.commande.facultatif}</span></label>
          <input id="pro-matricule" name="matricule_fiscal" maxLength={30} autoCapitalize="characters" spellCheck={false}
                 defaultValue={compte?.matricule_fiscal ?? ""} placeholder="1234567A/M/000"
                 aria-invalid={erreur?.indice === "matricule" ? true : undefined} aria-describedby="pro-erreur" />
        </div>
        <div className="champ">
          <label htmlFor="pro-metier">{t.pro.metier} <span className="facultatif">{t.commande.facultatif}</span></label>
          <input id="pro-metier" name="metier" maxLength={80} defaultValue={compte?.metier ?? ""} placeholder={t.pro.metierExemple} />
        </div>
        {numeroManque ? (
          <div className="pro-champ-large">
            <ChampTelephoneDuCompte id="pro-telephone" invalide={erreur?.indice === "telephone"} decrit="pro-erreur" />
          </div>
        ) : null}
        <div className="champ pro-champ-large">
          <label htmlFor="pro-message">{t.pro.message} <span className="facultatif">{t.commande.facultatif}</span></label>
          <textarea id="pro-message" name="message" rows={3} maxLength={500} defaultValue={compte?.message ?? ""} placeholder={t.pro.messageExemple} />
        </div>
      </div>
      <p id="pro-erreur" className="champ-erreur" role={erreur ? "alert" : undefined}>{erreur?.texte}</p>
      <div className="pro-actions">
        <button type="submit" className="btn btn-primaire" disabled={envoi}>{envoi ? t.pro.envoi : t.pro.envoyer}</button>
        <button type="button" className="btn-lien legende" onClick={() => { setOuvert(false); setErreur(null); }}>{t.pro.annuler}</button>
      </div>
    </form>
  );

  return (
    <section className="pro-espace" data-statut={compte?.statut ?? "aucun"} aria-labelledby="pro-titre">
      <div className="pro-tete">
        <span className="pro-icone" aria-hidden="true">
          {compte?.statut === "valide" ? <Coche taille={18} /> : <Lot taille={18} />}
        </span>
        <div className="pro-texte">
          <h2 id="pro-titre">
            {compte?.statut === "valide" ? (
              <>
                {t.pro.valideTitre} <span className="pro-badge">{t.pro.badge}</span>
              </>
            ) : compte?.statut === "demande" ? t.pro.demandeTitre
              : compte ? t.pro.refuseTitre
              : t.pro.invitationTitre}
          </h2>
          <p className="legende" role={envoyee ? "status" : undefined}>
            {compte?.statut === "valide"
              ? t.pro.valideTexte(compte.raison_sociale)
              : compte?.statut === "demande"
                ? envoyee ? t.pro.envoyee : t.pro.demandeTexte(JOUR.format(new Date(compte.demande_le)))
                : compte
                  ? compte.statut === "retire" ? t.pro.retireTexte(compte.motif) : t.pro.refuseTexte(compte.motif)
                  : t.pro.invitationTexte}
          </p>
        </div>
        {!ouvert && compte?.statut !== "valide" ? (
          <button type="button" className="btn btn-second pro-ouvrir" aria-expanded={false} onClick={() => { setOuvert(true); setEnvoyee(false); }}>
            {compte?.statut === "demande" ? t.pro.modifier : compte ? t.pro.redemander : t.pro.demander}
          </button>
        ) : null}
      </div>
      {ouvert ? formulaire : null}
    </section>
  );
}
