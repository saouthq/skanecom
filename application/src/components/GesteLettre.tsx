"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { Coche, Enveloppe } from "./Icones";
import { t } from "@/lib/i18n";

/* ============================================================================
   LE GESTE DE LA LETTRE — la page du lien reçu par e-mail : un bouton,
   « Confirmer mon inscription » ou « Me désinscrire », puis ce qui s'est
   passé, en une phrase (le titre prend le focus : un lecteur d'écran le lit).
   Depuis la confirmation, le même lien désinscrit (« Je ne veux plus la
   recevoir »).
   ========================================================================== */

type Etat = "inscrit" | "deja" | "desinscrit" | "expire" | "inconnu" | "serveur";

export function GesteLettre({ jeton, geste, boutique }: { jeton: string | null; geste: "confirmer" | "desinscrire"; boutique: string }) {
  const [etat, setEtat] = useState<Etat | null>(jeton ? null : "inconnu");
  const [enCours, setEnCours] = useState(false);
  const titre = useRef<HTMLHeadingElement>(null);
  const p = t.lettre.page;

  useLayoutEffect(() => {
    if (etat && jeton) titre.current?.focus();
  }, [etat, jeton]);

  async function agir() {
    if (!jeton || enCours) return;
    setEnCours(true);
    try {
      const r = await fetch("/lettre/geste", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jeton, geste }),
      });
      const d = (await r.json()) as { etat: Etat };
      setEtat(d.etat ?? "serveur");
    } catch {
      setEtat("serveur");
    } finally {
      setEnCours(false);
    }
  }

  const lienDesinscrire = jeton ? `/lettre?${new URLSearchParams({ j: jeton, a: "desinscrire" })}` : null;
  const textes: Record<Etat, [string, string]> = {
    inscrit: [p.inscritTitre, p.inscritTexte(boutique)],
    deja: [p.dejaTitre, p.dejaTexte],
    desinscrit: [p.desinscritTitre, p.desinscritTexte],
    expire: [p.expireTitre, p.expireTexte],
    inconnu: [p.inconnuTitre, p.inconnuTexte],
    serveur: [p.inconnuTitre, t.lettre.erreur],
  };
  const [titreTexte, chapo] = etat
    ? textes[etat]
    : geste === "desinscrire"
      ? [p.desinscrireTitre, p.desinscrireTexte(boutique)]
      : [p.confirmerTitre, p.confirmerTexte(boutique)];
  const reussi = etat === "inscrit" || etat === "deja" || etat === "desinscrit";

  return (
    <div className="lettre-geste" data-etat={etat ?? "attente"}>
      <span className="lettre-geste-icone" aria-hidden="true">
        {reussi ? <Coche taille={26} /> : <Enveloppe taille={26} />}
      </span>
      <p className="etiquette">{t.lettre.titre}</p>
      <h1 ref={titre} tabIndex={-1}>{titreTexte}</h1>
      <p className="chapo">{chapo}</p>
      {etat === null ? (
        <button
          type="button"
          className={geste === "desinscrire" ? "btn btn-second" : "btn btn-primaire"}
          onClick={() => void agir()}
          disabled={enCours}
          aria-busy={enCours || undefined}
        >
          {enCours ? t.lettre.envoi : geste === "desinscrire" ? p.desinscrire : p.confirmer}
        </button>
      ) : (
        <Link className="btn btn-primaire" href="/">{p.retour}</Link>
      )}
      {lienDesinscrire && geste === "confirmer" && etat !== "desinscrit" && etat !== "inconnu" && etat !== "expire" ? (
        <p className="legende lettre-geste-sortie">
          <Link className="lien-souligne" href={lienDesinscrire}>{p.sortie}</Link>
        </p>
      ) : null}
    </div>
  );
}
