"use client";

import { useEffect, useRef, useState } from "react";
import { Coche, Croix } from "./Icones";
import { Etoiles } from "./Etoiles";
import { supabaseNavigateur } from "@/lib/supabase-navigateur";
import { nomPour, reduire } from "@/lib/reduire-photo";
import { t } from "@/lib/i18n";
import type { MonAvis } from "@/lib/avis";

/* ============================================================================
   « DONNER MON AVIS » (module avis) — dans « Mes commandes », sous une
   commande livrée : chaque article reçu, noté ou à noter. Noter : cinq
   étoiles (des boutons radio, donc les flèches du clavier), un mot
   facultatif, « Publier mon avis ». La base revérifie tout (public.
   donner_avis : client connecté, commande livrée à lui, un avis par
   article) et dit si l'avis paraît aussitôt ou après relecture.

   Avec le réglage avis.photos : jusqu'à trois photos de l'article reçu,
   vues avant l'envoi et retirables. Réduites dans le navigateur, elles
   partent juste après l'avis (compte/avis/photos) ; si l'une n'y arrive
   pas, l'avis reste donné et le message le dit.
   ========================================================================== */

const PHOTOS_MAX = 3;

type Ligne = { id: string; produit_nom: string; variante_libelle: string | null };

const ETOILE = "M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.3l-5.8 3.1 1.2-6.5L2.6 9.4l6.5-.8z";

export function AvisCommande({ boutiqueId, numero, lignes, mesAvis, surAvis, photos = false }: {
  boutiqueId: string;
  numero: string;
  lignes: Ligne[];
  mesAvis: MonAvis[];
  surAvis: () => void;
  /** Réglage avis.photos : on peut joindre des photos à son avis. */
  photos?: boolean;
}) {
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [merci, setMerci] = useState<{ ligne: string; publie: boolean; photos: number; erreur: string | null } | null>(null);
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
                <p className="avis-merci" role="status" data-erreur={merci.erreur ? "" : undefined}>
                  <Coche taille={16} /> {merci.publie ? t.avis.merciPublie : t.avis.merciRelu}
                  {merci.photos > 0 ? ` ${t.avis.merciPhotos(merci.photos)}` : null}
                  {merci.erreur ? ` ${t.avis.photoRatee(merci.erreur)}` : null}
                </p>
              ) : null}
              {ouverte === l.id && !mien ? (
                <Formulaire
                  boutiqueId={boutiqueId}
                  numero={numero}
                  ligne={l}
                  photos={photos}
                  fermer={() => setOuverte(null)}
                  envoye={(publie, envoi) => {
                    setOuverte(null);
                    setMerci({ ligne: l.id, publie, ...envoi });
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

type Envoi = { photos: number; erreur: string | null };

/** Les photos choisies, avec l'adresse de leur aperçu (révoquée au retrait). */
type Choisie = { fichier: File; apercu: string };

async function envoyerPhotos(avisId: string, choisies: Choisie[]): Promise<Envoi> {
  const f = new FormData();
  f.set("avis_id", avisId);
  for (const c of choisies) {
    const blob = await reduire(c.fichier, 1600);
    f.append("photos", blob, nomPour(c.fichier, blob));
  }
  try {
    const r = await fetch("/compte/avis/photos", { method: "POST", body: f });
    const rep = (await r.json().catch(() => null)) as { passees?: number; erreur?: string | null } | null;
    return { photos: rep?.passees ?? 0, erreur: rep ? (rep.erreur ?? null) : t.avis.photosErreur };
  } catch {
    return { photos: 0, erreur: t.avis.photosErreur };
  }
}

function Formulaire({ boutiqueId, numero, ligne, photos, fermer, envoye }: {
  boutiqueId: string;
  numero: string;
  ligne: Ligne;
  photos: boolean;
  fermer: () => void;
  envoye: (publie: boolean, envoi: Envoi) => void;
}) {
  const [note, setNote] = useState(0);
  const [survol, setSurvol] = useState<number | null>(null);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choisies, setChoisies] = useState<Choisie[]>([]);
  const entree = useRef<HTMLInputElement>(null);
  const id = `avis-${ligne.id}`;
  const allumees = survol ?? note;

  // Les aperçus vivent le temps du formulaire.
  const vues = useRef<Choisie[]>([]);
  useEffect(() => {
    vues.current = choisies;
  }, [choisies]);
  useEffect(() => () => vues.current.forEach((c) => URL.revokeObjectURL(c.apercu)), []);

  function ajoute(liste: FileList | null) {
    const nouvelles = [...(liste ?? [])]
      .filter((f) => f.type.startsWith("image/") || f.type === "")
      .slice(0, PHOTOS_MAX - choisies.length)
      .map((fichier) => ({ fichier, apercu: URL.createObjectURL(fichier) }));
    if (nouvelles.length) setChoisies((c) => [...c, ...nouvelles]);
    if (entree.current) entree.current.value = "";
  }
  function retire(i: number) {
    URL.revokeObjectURL(choisies[i].apercu);
    setChoisies((c) => c.filter((_, j) => j !== i));
  }

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
    if (error) {
      setEnvoi(false);
      setErreur(["deja", "statut", "note", "texte", "ligne", "module"].includes(error.hint ?? "") ? error.message : t.avis.erreur);
      return;
    }
    const rendu = data as { statut: string; id?: string; photos?: boolean };
    const suite = photos && rendu.photos && rendu.id && choisies.length > 0
      ? await envoyerPhotos(rendu.id, choisies)
      : { photos: 0, erreur: null };
    setEnvoi(false);
    envoye(rendu.statut === "publie", suite);
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
      {photos ? (
        <div className="avis-depot">
          <span className="avis-depot-titre" id={`${id}-photos`}>
            {t.avis.photosTitre} <span className="legende">({t.avis.photosAide(PHOTOS_MAX)})</span>
          </span>
          <ul className="avis-depot-liste" role="list" aria-labelledby={`${id}-photos`}>
            {choisies.map((c, i) => (
              <li key={c.apercu} className="avis-depot-apercu">
                {/* eslint-disable-next-line @next/next/no-img-element -- un aperçu local (blob:), pas une image du site */}
                <img src={c.apercu} alt={t.avis.photoChoisie(i + 1)} />
                <button type="button" className="avis-depot-retirer" aria-label={t.avis.retirerPhoto(i + 1)} onClick={() => retire(i)}>
                  <Croix taille={14} />
                </button>
              </li>
            ))}
            {choisies.length < PHOTOS_MAX ? (
              <li>
                <label className="avis-depot-ajout">
                  <input ref={entree} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" multiple
                    onChange={(e) => ajoute(e.target.files)} />
                  <span aria-hidden="true">＋</span>
                  {t.avis.ajouterPhoto}
                </label>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
      <p className="champ-erreur" role={erreur ? "alert" : undefined}>{erreur}</p>
      <div className="avis-gestes">
        <button type="submit" className="btn btn-primaire" disabled={envoi}>{envoi ? t.avis.envoi : t.avis.publier}</button>
        <button type="button" className="btn-lien" onClick={fermer}>{t.avis.annuler}</button>
      </div>
    </form>
  );
}
