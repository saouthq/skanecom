"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { lienComparaison, lisComparaison, remplaceComparaison, type PieceComparee } from "@/lib/comparaison";
import { t } from "@/lib/i18n";

/* ============================================================================
   LES MORCEAUX VIVANTS DE LA PAGE /comparer

   · SuiviComparaison — la liste du navigateur suit la page (une pièce
     retirée par son lien, une pièce qui n'est plus publiée) ; arrivé sur
     /comparer sans pièces dans l'adresse, on y met celles du navigateur.
   · DifferencesSeules — « Seulement les différences » : masque les lignes
     où toutes les pièces disent la même chose (data-pareil).
   · NomsEpingles — en descendant une longue fiche technique, les noms des
     pièces (en tête du tableau) sortaient de l'écran : on ne savait plus
     quelle colonne était quelle pièce. Un bandeau des noms s'épingle sous
     l'en-tête de la boutique, aligné sur les colonnes, et suit le tableau
     quand il glisse de côté. Décoratif (les en-têtes de colonne restent
     ceux du tableau, pour les lecteurs d'écran).
   ========================================================================== */

export function SuiviComparaison({ pieces }: { pieces: PieceComparee[] }) {
  const router = useRouter();
  const cle = pieces.map((p) => p.slug).join(",");
  useEffect(() => {
    if (pieces.length === 0) {
      const gardees = lisComparaison();
      if (gardees.length) router.replace(lienComparaison(gardees));
      return;
    }
    remplaceComparaison(pieces);
    // `cle` dit la liste : la même liste relue ne réécrit rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  return null;
}

export function DifferencesSeules({ children }: { children: React.ReactNode }) {
  const [seules, setSeules] = useState(false);
  const id = useId();
  return (
    <div className="cp" data-differences={seules ? "" : undefined}>
      <p className="cp-options">
        <input id={id} type="checkbox" checked={seules} onChange={(e) => setSeules(e.currentTarget.checked)} />
        <label htmlFor={id}>{t.comparaison.differences}</label>
      </p>
      {children}
    </div>
  );
}

/** L'en-tête de la boutique qui reste à l'écran (collant ou fixe) : le bas
 *  sous lequel épingler. Il change de hauteur selon le gabarit, et certains
 *  se cachent en descendant : on le mesure à chaque fois. */
function basDeLEntete(): number {
  let bas = 0;
  for (const h of document.querySelectorAll("header")) {
    const pos = getComputedStyle(h).position;
    if (pos !== "sticky" && pos !== "fixed") continue;
    const r = h.getBoundingClientRect();
    if (r.bottom > 0 && r.top <= 1) bas = Math.max(bas, r.bottom);
  }
  return bas;
}

export function NomsEpingles({ noms }: { noms: string[] }) {
  const bandeau = useRef<HTMLDivElement>(null);
  const rang = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const b = bandeau.current, r = rang.current;
    const defile = b?.parentElement?.querySelector<HTMLElement>(".cp-defile");
    const table = defile?.querySelector("table");
    if (!b || !r || !defile || !table || !table.tHead) return;
    let attente = 0;
    const pose = () => {
      attente = 0;
      const haut = basDeLEntete();
      const tete = table.tHead!.getBoundingClientRect();
      const fin = table.getBoundingClientRect();
      const visible = tete.bottom < haut && fin.bottom > haut + 64;
      b.toggleAttribute("data-visible", visible);
      if (!visible) return;
      const cadre = defile.getBoundingClientRect();
      b.style.top = `${haut}px`;
      b.style.left = `${cadre.left + defile.clientLeft}px`;
      b.style.width = `${defile.clientWidth}px`;
      const cellules = table.tHead!.rows[0]?.cells;
      if (!cellules) return;
      [...r.children].forEach((c, i) => { (c as HTMLElement).style.width = `${cellules[i]?.getBoundingClientRect().width ?? 0}px`; });
      r.style.transform = `translateX(${-defile.scrollLeft}px)`;
    };
    const demande = () => { if (!attente) attente = requestAnimationFrame(pose); };
    const taille = new ResizeObserver(demande);
    taille.observe(table);
    window.addEventListener("scroll", demande, { passive: true });
    window.addEventListener("resize", demande);
    defile.addEventListener("scroll", demande, { passive: true });
    demande();
    return () => {
      cancelAnimationFrame(attente);
      taille.disconnect();
      window.removeEventListener("scroll", demande);
      window.removeEventListener("resize", demande);
      defile.removeEventListener("scroll", demande);
    };
  }, [noms.length]);
  return (
    <div ref={bandeau} className="cp-epingle" aria-hidden="true">
      <div ref={rang} className="cp-epingle-rang">
        <span />
        {noms.map((n, i) => <span key={i}>{n}</span>)}
      </div>
    </div>
  );
}
