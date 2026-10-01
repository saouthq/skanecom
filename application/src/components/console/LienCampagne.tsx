"use client";

import { useId, useState } from "react";
import { BoutonCopier } from "@/components/console/BoutonCopier";
import { motCampagne, SUPPORTS } from "@/lib/gestion/visites";

/* ============================================================================
   COMPOSER UN LIEN DE CAMPAGNE — pour une publication Instagram, une
   publicité Facebook, un message WhatsApp : où l'on poste, le nom de
   l'opération, la page (l'accueil, ou l'adresse d'une page de la vitrine
   collée telle quelle). Le lien porte utm_source et utm_campaign : les
   visites qu'il amène se rangent sous la campagne, dans l'écran Visites.
   ========================================================================== */

export function LienCampagne({ vitrine }: { vitrine: string }) {
  const id = useId();
  const [support, setSupport] = useState<string>(SUPPORTS[0].cle);
  const [nom, setNom] = useState("");
  const [page, setPage] = useState("");
  const campagne = motCampagne(nom);

  // Une adresse collée (de la vitrine ou non) : on n'en garde que le chemin.
  let chemin = "/";
  const saisie = page.trim();
  if (saisie) {
    try {
      chemin = new URL(saisie, vitrine).pathname || "/";
    } catch {
      chemin = "/";
    }
  }
  const lien = campagne ? `${vitrine}${chemin}?${new URLSearchParams({ utm_source: support, utm_campaign: campagne })}` : null;

  return (
    <div className="vi-lien">
      <div className="grille-champs vi-lien-champs">
        <div className="champ">
          <label htmlFor={`${id}-support`}>Où vous le publiez</label>
          <select id={`${id}-support`} value={support} onChange={(e) => setSupport(e.target.value)}>
            {SUPPORTS.map((s) => <option key={s.cle} value={s.cle}>{s.nom}</option>)}
          </select>
        </div>
        <div className="champ">
          <label htmlFor={`${id}-nom`}>Le nom de la campagne</label>
          <input id={`${id}-nom`} value={nom} maxLength={60} onChange={(e) => setNom(e.target.value)}
            placeholder="Ex. Soldes d'été" autoComplete="off" aria-describedby={`${id}-nom-aide`} />
          <span id={`${id}-nom-aide`} className="aide">
            {campagne ? <>Dans le lien : <code>{campagne}</code></> : "Le même nom pour tous les liens d'une même opération."}
          </span>
        </div>
        <div className="champ">
          <label htmlFor={`${id}-page`}>La page <span className="discret">(facultatif)</span></label>
          <input id={`${id}-page`} value={page} onChange={(e) => setPage(e.target.value)} inputMode="url"
            placeholder="L'accueil ; ou collez l'adresse d'une fiche" autoComplete="off" />
        </div>
      </div>
      <div className="vi-lien-resultat" aria-live="polite">
        {lien ? (
          <>
            <code className="vi-lien-adresse">{lien}</code>
            <BoutonCopier texte={lien} libelle="Copier le lien" classe="btn btn-primaire btn-petit" />
          </>
        ) : (
          <span className="discret">Donnez un nom à l&apos;opération : le lien s&apos;écrit ici.</span>
        )}
      </div>
    </div>
  );
}
