"use client";

import { useState } from "react";
import { Coche } from "./Icones";
import { Etoiles } from "./Etoiles";
import { supabaseNavigateur } from "@/lib/supabase-navigateur";
import { t } from "@/lib/i18n";
import type { MonAvis } from "@/lib/avis";

/* ============================================================================
   « DONNER MON AVIS » (module avis) — dans « Mes commandes », sous une
   commande livrée : chaque article reçu, noté ou à noter. Noter : cinq
   étoiles (des boutons radio, donc les flèches du clavier), un mot
   facultatif, « Publier mon avis ». La base revérifie tout (public.
   donner_avis : client connecté, commande livrée à lui, un avis par
   article) et dit si l'avis paraît aussitôt ou après relecture.
   ========================================================================== */

type Ligne = { id: string; produit_nom: string; variante_libelle: string | null };

const ETOILE = "M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.3l-5.8 3.1 1.2-6.5L2.6 9.4l6.5-.8z";

export function AvisCommande({ boutiqueId, numero, lignes, mesAvis, surAvis }: {
  boutiqueId: string;
  numero: string;
  lignes: Ligne[];
  mesAvis: MonAvis[];
  surAvis: () => void;
}) {
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [merci, setMerci] = useState<{ ligne: string; publie: boolean } | null>(null);
  return (
    <div className="avis-commande">
      <p className="avis-commande-titre">{t.avis.vosArticles}</p>
      <ul role="list">
        {lignes.map((l) => {
          const mien = mesAvis.find((a) => a.ligne_id === l.id);
          return (
            <li key={l.id} className="avis-commande-ligne" data-note={mien ? "" : undefined}>
              <span className="avis-commande-article">
                <b>{l.produit_nom}</b>
                {l.variante_libelle ? <span className="legende">{l.variante_libelle}</span> : null}
              </span>
              {mien ? (
                <span className="avis-commande-etat">
                  <Etoiles note={mien.note} taille={14} />
                  <span className="legende">{t.avis.statut[mien.statut]}</span>
                </span>
              ) : ouverte === l.id ? null : (
                <button type="button" className="btn-lien avis-noter" onClick={() => { setMerci(null); setOuverte(l.id); }}>
                  {t.avis.noter}
                </button>
              )}
              {merci?.ligne === l.id ? (
                <p className="avis-merci" role="status"><Coche taille={16} /> {merci.publie ? t.avis.merciPublie : t.avis.merciRelu}</p>
              ) : null}
              {ouverte === l.id && !mien ? (
                <Formulaire
                  boutiqueId={boutiqueId}
                  numero={numero}
                  ligne={l}
                  fermer={() => setOuverte(null)}
                  envoye={(publie) => {
                    setOuverte(null);
                    setMerci({ ligne: l.id, publie });
                    surAvis();
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Formulaire({ boutiqueId, numero, ligne, fermer, envoye }: {
  boutiqueId: string;
  numero: string;
  ligne: Ligne;
  fermer: () => void;
  envoye: (publie: boolean) => void;
}) {
  const [note, setNote] = useState(0);
  const [survol, setSurvol] = useState<number | null>(null);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const id = `avis-${ligne.id}`;
  const allumees = survol ?? note;

  async function envoyer() {
    if (note < 1) {
      setErreur(t.avis.noteRequise);
      return;
    }
    setEnvoi(true);
    setErreur(null);
    const { data, error } = await supabaseNavigateur().rpc("donner_avis", {
      p_boutique_id: boutiqueId,
      p_numero_commande: numero,
      p_ligne_id: ligne.id,
      p_note: note,
      p_texte: texte.trim() || null,
    });
    setEnvoi(false);
    if (error) {
      setErreur(["deja", "statut", "note", "texte", "ligne", "module"].includes(error.hint ?? "") ? error.message : t.avis.erreur);
      return;
    }
    envoye((data as { statut: string }).statut === "publie");
  }

  return (
    <form
      className="avis-formulaire"
      aria-labelledby={`${id}-titre`}
      onSubmit={(e) => {
        e.preventDefault();
        void envoyer();
      }}
    >
      <h3 id={`${id}-titre`} className="sr-only">{t.avis.formulaireTitre(ligne.produit_nom)}</h3>
      <fieldset className="avis-saisie">
        <legend>{t.avis.votreNote}</legend>
        <div className="avis-saisie-etoiles" onMouseLeave={() => setSurvol(null)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} data-allumee={n <= allumees ? "" : undefined} onMouseEnter={() => setSurvol(n)}>
              <input
                type="radio"
                className="sr-only"
                name={`${id}-note`}
                value={n}
                checked={note === n}
                onChange={() => {
                  setNote(n);
                  if (erreur === t.avis.noteRequise) setErreur(null);
                }}
              />
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ETOILE} /></svg>
              <span className="sr-only">{t.avis.etoiles(n)}</span>
            </label>
          ))}
        </div>
        <span className="avis-saisie-mot" aria-live="polite">{allumees ? t.avis.qualificatif[allumees - 1] : t.avis.choisirNote}</span>
      </fieldset>
      <div className="champ">
        <label htmlFor={`${id}-texte`}>{t.avis.texte} <span className="legende">({t.commande.facultatif})</span></label>
        <textarea
          id={`${id}-texte`}
          rows={3}
          maxLength={1000}
          value={texte}
          placeholder={t.avis.texteExemple}
          onChange={(e) => setTexte(e.target.value)}
        />
      </div>
      <p className="champ-erreur" role={erreur ? "alert" : undefined}>{erreur}</p>
      <div className="avis-gestes">
        <button type="submit" className="btn btn-primaire" disabled={envoi}>{envoi ? t.avis.envoi : t.avis.publier}</button>
        <button type="button" className="btn-lien" onClick={fermer}>{t.avis.annuler}</button>
      </div>
    </form>
  );
}
