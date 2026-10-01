"use client";

import { useEffect, useRef, useState } from "react";
import { Coche } from "./Icones";
import { Etoiles } from "./Etoiles";
import { PhotosAvis } from "./PhotosAvis";
import { t } from "@/lib/i18n";
import { AVIS_FILTRABLES_DES, PAGE_AVIS, noteLisible, type FiltreAvis, type PageAvis } from "@/lib/avis-communs";
import type { AvisProduit as Avis, AvisPublie } from "@/lib/avis";

/* ============================================================================
   LES AVIS DE LA FICHE, DANS LE NAVIGATEUR — la synthèse (moyenne,
   répartition), « Les photos des clients » en rang, puis la liste, du plus
   récent au plus ancien, par pages de dix (« Voir 4 avis de plus »).

   Dès quatre avis, la liste se filtre : tous, avec photos, ou une note — par
   les pastilles au-dessus de la liste ou en touchant une ligne de la
   répartition. Quand la fiche a déjà tous les avis, le filtre est immédiat ;
   sinon il lit sa page à /recherche/avis (public.avis_produit_page).
   Chaque filtre garde ce qu'il a lu : y revenir ne recharge rien.

   Le résultat d'un filtre est annoncé aux lecteurs d'écran ; après « Voir
   plus », le focus va au premier avis ajouté.
   ========================================================================== */

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Tunis" });

type Lu = { total: number; avis: AvisPublie[] };

function retient(f: FiltreAvis, a: AvisPublie): boolean {
  if (f === "tous") return true;
  if (f === "photos") return (a.photos?.length ?? 0) > 0;
  return a.note === Number(f);
}

/** Ajoute une page sans répéter un avis déjà lu (un avis publié entre deux pages décale la suite). */
function fusionne(avant: AvisPublie[], page: AvisPublie[]): AvisPublie[] {
  const vus = new Set(avant.map((a) => a.id));
  return [...avant, ...page.filter((a) => !vus.has(a.id))];
}

export function ListeAvis({ avis, produitId }: { avis: Avis; produitId: string }) {
  const [filtre, setFiltre] = useState<FiltreAvis>("tous");
  const [lus, setLus] = useState<Partial<Record<FiltreAvis, Lu>>>({ tous: { total: avis.total, avis: avis.avis } });
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState<null | { filtre: FiltreAvis; deja: AvisPublie[] }>(null);
  const [annonce, setAnnonce] = useState("");
  // L'avis à focaliser une fois rendu (le premier ajouté par « Voir plus »).
  const aFocaliser = useRef<string | null>(null);
  const liste = useRef<HTMLUListElement>(null);
  const enCours = useRef<AbortController | null>(null);

  const comptes: Record<FiltreAvis, number> = {
    tous: avis.total,
    photos: avis.avec_photos ?? 0,
    ...avis.repartition,
  };
  const filtrable = avis.total >= AVIS_FILTRABLES_DES;
  const tousLus = (lus.tous?.avis.length ?? 0) >= avis.total;

  // Ce que montre le filtre : ce qu'il a lu, ou — tous les avis en main — leur tri immédiat.
  function contenu(f: FiltreAvis): Lu | undefined {
    if (lus[f]) return lus[f];
    if (tousLus && lus.tous) {
      const retenus = lus.tous.avis.filter((a) => retient(f, a));
      return { total: retenus.length, avis: retenus };
    }
    return undefined;
  }
  const courant = contenu(filtre);

  useEffect(() => {
    if (!aFocaliser.current) return;
    liste.current?.querySelector<HTMLElement>(`[data-avis="${aFocaliser.current}"]`)?.focus();
    aFocaliser.current = null;
  });

  useEffect(() => () => enCours.current?.abort(), []);

  /** Lit une page du filtre ; `deja` : ce qu'il montre déjà (rien pour une première page). */
  async function lit(f: FiltreAvis, deja: AvisPublie[]) {
    enCours.current?.abort();
    const arret = new AbortController();
    enCours.current = arret;
    setCharge(true);
    setErreur(null);
    try {
      const adresse = `/recherche/avis?produit=${produitId}&filtre=${f}&decalage=${deja.length}`;
      let r = await fetch(adresse, { signal: arret.signal });
      // Une panne passagère du serveur : une seconde tentative, sans rien dire, avant l'erreur.
      if (r.status >= 500) {
        await new Promise((fin) => setTimeout(fin, 400));
        r = await fetch(adresse, { signal: arret.signal });
      }
      if (!r.ok) throw new Error(String(r.status));
      const page = (await r.json()) as PageAvis;
      const fusion = fusionne(deja, page.avis);
      if (deja.length > 0) aFocaliser.current = fusion[deja.length]?.id ?? null;
      setLus((avant) => ({ ...avant, [f]: { total: page.total, avis: fusion } }));
      if (deja.length > 0) {
        setAnnonce(t.avis.ajoutes(fusion.length - deja.length));
      } else {
        setAnnonce(t.avis.resultat(f, page.total));
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setErreur({ filtre: f, deja });
      setAnnonce(t.avis.erreurListe);
    } finally {
      if (enCours.current === arret) {
        enCours.current = null;
        setCharge(false);
      }
    }
  }

  function choisit(f: FiltreAvis) {
    if (f === filtre) return;
    setFiltre(f);
    setErreur(null);
    const deja = contenu(f);
    if (deja) {
      enCours.current?.abort();
      setCharge(false);
      setAnnonce(t.avis.resultat(f, deja.total));
    } else {
      void lit(f, []);
    }
  }

  // La suite se lit au serveur, à partir de ce qui est montré (lu, ou trié dans le navigateur).
  function voirPlus() {
    if (courant && !charge) void lit(filtre, courant.avis);
  }

  const reste = courant ? courant.total - courant.avis.length : 0;
  const plus = Math.max(1, ...Object.values(avis.repartition));
  const pastilles: FiltreAvis[] = [
    "tous",
    ...(comptes.photos > 0 && comptes.photos < avis.total ? (["photos"] as const) : []),
    ...(["5", "4", "3", "2", "1"] as const).filter((n) => comptes[n] > 0 && comptes[n] < avis.total),
  ];
  const illustres = avis.photos ? new Set(avis.photos.map((p) => p.avis_id)).size : 0;

  return (
    <div className="avis-grille">
      <div className="avis-synthese">
        <p className="avis-moyenne">
          <span>{noteLisible(avis.moyenne ?? 0)}</span>
          <span className="avis-sur">/5</span>
        </p>
        <Etoiles note={avis.moyenne ?? 0} taille={20} />
        <p className="avis-compte">{t.avis.totalVerifies(avis.total)}</p>
        <ol className="avis-repartition" aria-label={t.avis.repartition}>
          {(["5", "4", "3", "2", "1"] as const).map((n) => {
            const ligne = (
              <>
                <span className="avis-repartition-note">{t.avis.etoilesCourt(Number(n))}</span>
                <span className="avis-barre" aria-hidden="true">
                  <i style={{ inlineSize: `${(avis.repartition[n] / plus) * 100}%` }} />
                </span>
                <span className="avis-repartition-compte">{avis.repartition[n]}</span>
              </>
            );
            // Une note qui a des avis, sur une liste filtrable : la toucher ne montre qu'eux (la retoucher, tous).
            return filtrable && avis.repartition[n] > 0 ? (
              <li key={n}>
                <button
                  type="button"
                  className="avis-repartition-bouton"
                  aria-pressed={filtre === n}
                  aria-label={t.avis.filtrerNote(Number(n), avis.repartition[n])}
                  onClick={() => choisit(filtre === n ? "tous" : n)}
                >
                  {ligne}
                </button>
              </li>
            ) : (
              <li key={n}>{ligne}</li>
            );
          })}
        </ol>
        <p className="legende avis-explique">{t.avis.explication}</p>
      </div>

      <div className="avis-colonne">
        {/* Le rang, dès que les photos viennent de plusieurs avis (d'un seul, elles sont déjà sous lui). */}
        {avis.photos && illustres > 1 ? (
          <div className="avis-rang" id="avis-rang">
            <p className="avis-rang-titre" id="avis-rang-titre">{t.avis.photosClients(avis.photos.length)}</p>
            <PhotosAvis
              photos={avis.photos}
              auteurs={avis.photos.map((p) => avis.avis.find((a) => a.id === p.avis_id)?.auteur ?? lus.tous?.avis.find((a) => a.id === p.avis_id)?.auteur ?? "")}
              classe="avis-photos"
              taille={104}
            />
          </div>
        ) : null}

        {filtrable && pastilles.length > 1 ? (
          <div className="avis-filtres" role="group" aria-label={t.avis.filtres}>
            {pastilles.map((f) => (
              <button key={f} type="button" className="avis-filtre" aria-pressed={filtre === f} onClick={() => choisit(f)}>
                <span>{f === "tous" ? t.avis.filtreTous : f === "photos" ? t.avis.filtrePhotos : t.avis.filtreNote(Number(f))}</span>
                <span className="avis-filtre-compte">{comptes[f]}</span>
              </button>
            ))}
          </div>
        ) : null}
        <p className="sr-only avis-annonce" aria-live="polite">{annonce}</p>

        {courant ? (
          <ul ref={liste} className="avis-liste" role="list" aria-busy={charge || undefined} data-filtre={filtre}>
            {courant.avis.map((a) => (
              <li key={a.id} className="avis-item" data-avis={a.id} tabIndex={-1}>
                <div className="avis-item-tete">
                  <Etoiles note={a.note} taille={14} />
                  <b>{a.auteur}</b>
                  <span className="avis-verifie"><Coche taille={12} /> {t.avis.achatVerifie}</span>
                </div>
                <p className="legende">
                  {JOUR.format(new Date(a.cree_le))}
                  {a.variante_libelle ? ` · ${a.variante_libelle}` : null}
                </p>
                {a.texte ? <p className="avis-texte">{a.texte}</p> : null}
                {a.photos && a.photos.length > 0 ? (
                  <PhotosAvis photos={a.photos} auteurs={a.photos.map(() => a.auteur)} classe="avis-photos" />
                ) : null}
                {a.reponse ? (
                  <div className="avis-reponse">
                    <b>{t.avis.reponseBoutique}</b>
                    <p>{a.reponse}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="avis-attente legende" aria-busy="true">{t.avis.chargement}</p>
        )}

        {erreur ? (
          <p className="avis-erreur" role="alert">
            {t.avis.erreurListe}{" "}
            <button type="button" className="lien-souligne" onClick={() => void lit(erreur.filtre, erreur.deja)}>{t.avis.reessayer}</button>
          </p>
        ) : null}

        {courant && reste > 0 ? (
          <div className="avis-suite">
            <button type="button" className="btn btn-second avis-plus" onClick={voirPlus} aria-disabled={charge || undefined}>
              {charge ? t.avis.chargement : t.avis.voirPlus(Math.min(reste, PAGE_AVIS))}
            </button>
            <span className="legende">{t.avis.lus(courant.avis.length, courant.total)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
