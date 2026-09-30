"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icone } from "./Icone";
import type { ElementPalette } from "@/lib/gestion/palette";

/* ============================================================================
   LA PALETTE (⌘K, ou Ctrl+K) — le réflexe des outils qu'on ouvre vingt fois
   par jour : on tape, on arrive. Les pages du backoffice d'abord (filtrées
   par ce qu'on tape), puis ce que la recherche trouve : commandes (numéro,
   nom, téléphone), clients, produits (gestion/[slug]/palette).

   Un <dialog> natif (le focus y reste, Échap le ferme) ; le champ est une
   « combobox » : ↓ ↑ parcourent, Entrée ouvre, sans quitter le champ.
   Ouverte aussi par le bouton « Rechercher » (OuvrirPalette).
   ========================================================================== */

export const PALETTE_OUVRIR = "palette:ouvrir";

const plat = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Palette({ slug, pages }: { slug: string; pages: ElementPalette[] }) {
  const router = useRouter();
  const chemin = usePathname();
  const liste = useId();
  const dialogue = useRef<HTMLDialogElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [trouves, setTrouves] = useState<{ q: string; elements: ElementPalette[] } | null>(null);
  const [cherche, setCherche] = useState(false);
  const [actif, setActif] = useState(0);

  const ouvrir = useCallback(() => {
    const d = dialogue.current;
    if (!d || d.open) return;
    setQ("");
    setTrouves(null);
    setActif(0);
    d.showModal();
    champ.current?.focus();
  }, []);

  // ⌘K / Ctrl+K, où que l'on soit ; le bouton « Rechercher » aussi.
  useEffect(() => {
    const touche = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialogue.current?.open) dialogue.current.close();
        else ouvrir();
      }
    };
    document.addEventListener("keydown", touche);
    window.addEventListener(PALETTE_OUVRIR, ouvrir);
    return () => {
      document.removeEventListener("keydown", touche);
      window.removeEventListener(PALETTE_OUVRIR, ouvrir);
    };
  }, [ouvrir]);

  // Arrivé ailleurs : elle se referme.
  useEffect(() => {
    if (dialogue.current?.open) dialogue.current.close();
  }, [chemin]);

  const terme = q.replace(/\s+/g, " ").trim();
  useEffect(() => {
    if (terme.length < 2) return;
    const arret = new AbortController();
    const minuterie = window.setTimeout(async () => {
      setCherche(true);
      try {
        const r = await fetch(`/gestion/${slug}/palette?q=${encodeURIComponent(terme)}`, { signal: arret.signal });
        if (r.ok) setTrouves({ q: terme, elements: ((await r.json()) as { elements: ElementPalette[] }).elements });
      } catch {
        /* interrompue : une frappe plus récente arrive */
      } finally {
        if (!arret.signal.aborted) setCherche(false);
      }
    }, 140);
    return () => {
      arret.abort();
      window.clearTimeout(minuterie);
    };
  }, [terme, slug]);

  const pagesVues = terme ? pages.filter((p) => plat(p.titre).includes(plat(terme))) : pages;
  const elements = [...pagesVues, ...(terme.length >= 2 && trouves ? trouves.elements : [])];
  const courant = Math.min(actif, Math.max(0, elements.length - 1));
  const idOption = (i: number) => `${liste}-${i}`;

  useEffect(() => {
    document.getElementById(`${liste}-${courant}`)?.scrollIntoView({ block: "nearest" });
  }, [courant, liste]);

  const va = (e: ElementPalette | undefined) => {
    if (!e) return;
    dialogue.current?.close();
    router.push(e.href);
  };

  const auClavier = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!elements.length) return;
      setActif((courant + (e.key === "ArrowDown" ? 1 : elements.length - 1)) % elements.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      va(elements[courant]);
    }
  };

  // Les éléments, par groupe, dans l'ordre : Aller à, Commandes, Clients, Produits.
  const groupes: { nom: string; debut: number; elements: ElementPalette[] }[] = [];
  elements.forEach((el, i) => {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.nom === el.groupe) dernier.elements.push(el);
    else groupes.push({ nom: el.groupe, debut: i, elements: [el] });
  });

  return (
    <dialog
      ref={dialogue}
      className="palette"
      aria-label="Rechercher et aller"
      onClick={(e) => {
        if (e.target === dialogue.current) dialogue.current.close();
      }}
    >
      <div className="palette-boite">
        <div className="palette-champ">
          <Icone nom="recherche" taille={18} />
          <input
            ref={champ}
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActif(0);
            }}
            onKeyDown={auClavier}
            placeholder="Une commande, un client, un produit, une page…"
            aria-label="Rechercher et aller"
            role="combobox"
            aria-expanded="true"
            aria-controls={liste}
            aria-activedescendant={elements.length ? idOption(courant) : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          {cherche ? <span className="palette-attente" aria-hidden="true" /> : null}
          <kbd>Échap</kbd>
        </div>
        <div className="palette-liste" id={liste} role="listbox" aria-label="Résultats">
          {groupes.map((g) => (
            <div key={g.nom} role="group" aria-label={g.nom} className="palette-groupe">
              <p className="palette-groupe-nom" aria-hidden="true">{g.nom}</p>
              {g.elements.map((el, j) => {
                const i = g.debut + j;
                return (
                  <div
                    key={el.href}
                    id={idOption(i)}
                    role="option"
                    aria-selected={i === courant}
                    className="palette-option"
                    onMouseMove={() => i !== courant && setActif(i)}
                    onClick={() => va(el)}
                  >
                    <span className="palette-icone" aria-hidden="true"><Icone nom={el.icone} taille={16} /></span>
                    <span className="palette-titre">{el.titre}</span>
                    {el.detail ? <span className="palette-detail">{el.detail}</span> : null}
                    <Icone nom="retour" taille={14} className="palette-entree" />
                  </div>
                );
              })}
            </div>
          ))}
          {terme.length >= 2 && trouves?.q === terme && elements.length === 0 ? (
            <p className="palette-rien">Rien pour « {terme} » : un numéro de commande, un nom, un téléphone, une référence…</p>
          ) : null}
        </div>
        <div className="palette-pied" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> choisir</span>
          <span><kbd>Entrée</kbd> ouvrir</span>
          <span><kbd>Échap</kbd> fermer</span>
        </div>
      </div>
    </dialog>
  );
}

/** Le bouton « Rechercher… ⌘K » de la barre latérale et de l'en-tête du téléphone. */
export function OuvrirPalette({ compact = false }: { compact?: boolean }) {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    // Après l'hydratation : le serveur ne sait pas sur quel clavier on tape.
    const id = requestAnimationFrame(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <button
      type="button"
      className={compact ? "btn-icone palette-ouvrir-compact" : "palette-ouvrir"}
      aria-label={compact ? "Rechercher" : undefined}
      aria-keyshortcuts="Control+K Meta+K"
      onClick={() => window.dispatchEvent(new Event(PALETTE_OUVRIR))}
    >
      <Icone nom="recherche" taille={compact ? 20 : 16} />
      {compact ? null : (
        <>
          <span>Rechercher…</span>
          <kbd>{mac ? "⌘K" : "Ctrl K"}</kbd>
        </>
      )}
    </button>
  );
}
