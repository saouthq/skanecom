"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Icone } from "./Icone";
import { nomPour, reduire } from "@/lib/reduire-photo";

/* ============================================================================
   LE DÉPÔT DE PHOTOS — une zone où l'on glisse ses photos, ou qu'on touche
   pour les choisir (sur téléphone : l'appareil photo ou la galerie).

   Sans JavaScript : un formulaire multipart ordinaire et son bouton « Envoyer ».
   Avec : dès le choix, chaque photo est RÉDUITE dans le navigateur (2 000 px
   au plus grand côté, WebP — JPEG si le navigateur ne sait pas écrire le
   WebP), ce qui fait d'une photo de téléphone de 5 Mo un fichier de 300 Ko :
   l'envoi passe même sur un réseau mobile moyen, et les informations cachées
   de la photo (lieu de la prise de vue) disparaissent. L'envoi montre sa
   progression ; la page se recharge sur le message de la boutique.
   ========================================================================== */

const TYPES = "image/jpeg,image/png,image/webp";

type Etat =
  | { phase: "repos" }
  | { phase: "preparation"; fait: number; total: number }
  | { phase: "envoi"; pourcent: number; total: number };

const rien = () => () => {};

export function DepotPhotos({ action, restantes, large }: { action: string; restantes: number; large: boolean }) {
  // Vrai une fois le script chargé (faux au rendu serveur) : le bouton
  // « Envoyer » ne sert qu'aux navigateurs sans JavaScript.
  const pret = useSyncExternalStore(rien, () => true, () => false);
  const [etat, setEtat] = useState<Etat>({ phase: "repos" });
  const [survol, setSurvol] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const entree = useRef<HTMLInputElement>(null);

  const occupe = etat.phase !== "repos";

  async function envoyer(liste: File[]) {
    const photos = liste.filter((f) => f.type.startsWith("image/") || f.type === "");
    if (photos.length === 0 || occupe) return;
    const choisies = photos.slice(0, restantes);
    const total = choisies.length;
    const donnees = new FormData();
    donnees.set("action", "ajouter");
    setNote(photos.length > restantes ? `Douze photos au plus : ${photos.length - restantes} laissée(s) de côté.` : null);
    for (let i = 0; i < total; i += 1) {
      setEtat({ phase: "preparation", fait: i, total });
      const blob = await reduire(choisies[i]);
      donnees.append("photos", blob, nomPour(choisies[i], blob));
    }
    setEtat({ phase: "envoi", pourcent: 0, total });

    const xhr = new XMLHttpRequest();
    xhr.open("POST", action);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setEtat({ phase: "envoi", pourcent: Math.round((e.loaded / e.total) * 100), total });
    };
    xhr.onload = () => {
      // La réponse a suivi la redirection vers la fiche (message compris).
      // Même adresse que la page (même message) : recharger, sinon le
      // navigateur ne ferait que défiler.
      const cible = new URL(xhr.responseURL || window.location.href);
      cible.hash = "t-photos";
      if (cible.pathname + cible.search === window.location.pathname + window.location.search) window.location.reload();
      else window.location.assign(cible.href);
    };
    xhr.onerror = () => {
      setEtat({ phase: "repos" });
      setNote("L'envoi n'a pas abouti (réseau coupé ?). Recommencez.");
    };
    xhr.send(donnees);
  }

  const libelle =
    etat.phase === "preparation"
      ? `Préparation ${etat.fait + 1} sur ${etat.total}…`
      : etat.phase === "envoi"
        ? `Envoi de ${etat.total} photo${etat.total > 1 ? "s" : ""}… ${etat.pourcent} %`
        : large
          ? "Ajouter des photos"
          : "Ajouter";
  const avancement =
    etat.phase === "preparation" ? (etat.fait / etat.total) * 40 : etat.phase === "envoi" ? 40 + etat.pourcent * 0.6 : 0;

  return (
    <form
      action={action}
      method="post"
      encType="multipart/form-data"
      className={large ? "depot depot-large" : "depot"}
      onSubmit={(e) => {
        if (!pret) return;
        e.preventDefault();
        void envoyer(Array.from(entree.current?.files ?? []));
      }}
    >
      <input type="hidden" name="action" value="ajouter" />
      <label
        className="depot-zone"
        data-survol={survol ? "" : undefined}
        data-occupe={occupe ? "" : undefined}
        onDragEnter={() => setSurvol(true)}
        onDragLeave={() => setSurvol(false)}
        onDrop={() => setSurvol(false)}
      >
        <input
          ref={entree}
          type="file"
          name="photos"
          accept={TYPES}
          multiple
          disabled={occupe || restantes <= 0}
          className="depot-entree"
          aria-describedby="depot-aide"
          onChange={(e) => {
            if (pret) void envoyer(Array.from(e.currentTarget.files ?? []));
          }}
        />
        <span className="depot-icone" aria-hidden="true">
          <Icone nom={occupe ? "horloge" : large ? "photo" : "plus"} taille={large ? 20 : 18} />
        </span>
        <strong className="depot-libelle" aria-live="polite">{libelle}</strong>
        <span id="depot-aide" className={large ? "depot-aide" : "sr-only"}>
          {restantes <= 0
            ? "Douze photos au plus : retirez-en une pour en ajouter."
            : "Glissez-les ici, ou touchez pour les choisir. JPEG, PNG ou WebP ; elles sont réduites avant l'envoi."}
        </span>
        {occupe ? (
          <span className="depot-barre" aria-hidden="true">
            <span style={{ inlineSize: `${Math.max(4, avancement)}%` }} />
          </span>
        ) : null}
      </label>
      {!pret ? <button className="btn btn-second btn-petit">Envoyer</button> : null}
      {note ? <p className="depot-note" role="status">{note}</p> : null}
    </form>
  );
}
