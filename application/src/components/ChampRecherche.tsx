"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Fleche } from "./Icones";
import { Prix } from "./Prix";
import { t } from "@/lib/i18n";
import type { ReponseSuggestions, Suggestion } from "@/lib/suggestions";

/* ============================================================================
   LE CHAMP DE RECHERCHE — ce qu'on tape propose déjà des pièces : dès deux
   lettres, les six plus pertinentes (photo, marque, prix, référence), puis
   « Voir les N résultats ». Posé dans le formulaire de recherche, qui reste
   un formulaire ordinaire : sans JavaScript, ou Entrée sans suggestion
   choisie, on arrive sur la page des résultats comme avant.

   Au clavier (motif « combobox » de l'ARIA) : ↓ et ↑ parcourent, Entrée ouvre
   la pièce choisie, Échap referme. La liste ne vole jamais le focus.
   ========================================================================== */

const DELAI = 160;

/** Le nom, avec la partie tapée en gras (sans tenir compte des accents). */
function surligne(nom: string, q: string) {
  const plat = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const i = plat(nom).indexOf(plat(q.trim()));
  if (i < 0 || !q.trim()) return nom;
  const n = q.trim().length;
  return (
    <>
      {nom.slice(0, i)}
      <mark>{nom.slice(i, i + n)}</mark>
      {nom.slice(i + n)}
    </>
  );
}

export function ChampRecherche({
  id,
  defaultValue = "",
  placeholder,
  className,
}: {
  id: string;
  defaultValue?: string;
  placeholder: string;
  className?: string;
}) {
  const router = useRouter();
  const chemin = usePathname();
  const liste = useId();
  const champ = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(defaultValue);
  const [reponse, setReponse] = useState<{ q: string; r: ReponseSuggestions } | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(-1);

  // Une autre page : la liste se referme.
  const [cheminVu, setCheminVu] = useState(chemin);
  if (cheminVu !== chemin) {
    setCheminVu(chemin);
    setOuvert(false);
    setActif(-1);
  }

  const terme = q.replace(/\s+/g, " ").trim();
  useEffect(() => {
    if (terme.length < 2) return;
    const arret = new AbortController();
    const minuterie = window.setTimeout(async () => {
      try {
        const r = await fetch(`/recherche/suggestions?q=${encodeURIComponent(terme)}`, { signal: arret.signal });
        if (!r.ok) return;
        setReponse({ q: terme, r: (await r.json()) as ReponseSuggestions });
        setActif(-1);
      } catch {
        /* interrompue, ou hors ligne : la page des résultats reste là */
      }
    }, DELAI);
    return () => {
      arret.abort();
      window.clearTimeout(minuterie);
    };
  }, [terme]);

  const produits: Suggestion[] = terme.length >= 2 && reponse ? reponse.r.produits : [];
  const total = terme.length >= 2 && reponse ? reponse.r.total : 0;
  const visible = ouvert && terme.length >= 2 && reponse !== null;
  // Les options : les pièces, puis « Voir les N résultats ».
  const nOptions = produits.length + (total > 0 ? 1 : 0);
  const optionId = (i: number) => `${liste}-${i}`;

  const ouvre = (i: number) => {
    setOuvert(false);
    if (i < produits.length) router.push(`/produit/${produits[i].slug}`);
    else champ.current?.form?.requestSubmit();
  };

  const auClavier = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!nOptions) return;
      e.preventDefault();
      setOuvert(true);
      setActif((a) => (e.key === "ArrowDown" ? (a + 1) % nOptions : a <= 0 ? nOptions - 1 : a - 1));
    } else if (e.key === "Enter" && visible && actif >= 0) {
      e.preventDefault();
      ouvre(actif);
    } else if (e.key === "Escape" && visible) {
      e.preventDefault();
      setOuvert(false);
      setActif(-1);
    }
  };

  return (
    <>
      <input
        ref={champ}
        id={id}
        name="q"
        type="search"
        value={q}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        className={className}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={liste}
        aria-activedescendant={visible && actif >= 0 ? optionId(actif) : undefined}
        onChange={(e) => {
          setQ(e.target.value);
          setOuvert(true);
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setOuvert(false)}
        onKeyDown={auClavier}
      />
      <div className="recherche-suggestions" data-ouvert={visible ? "" : undefined} onMouseDown={(e) => e.preventDefault()}>
        <ul id={liste} role="listbox" aria-label={t.recherche.suggestionsAria}>
          {visible
            ? produits.map((p, i) => (
                <li
                  key={p.slug}
                  id={optionId(i)}
                  role="option"
                  aria-selected={actif === i}
                  className="suggestion"
                  onMouseEnter={() => setActif(i)}
                  onClick={() => ouvre(i)}
                >
                  <span className="suggestion-photo" aria-hidden="true">
                    {p.photo ? <Image src={p.photo} alt="" fill sizes="48px" /> : <span>{p.nom.charAt(0)}</span>}
                  </span>
                  <span className="suggestion-texte">
                    <span className="suggestion-nom">{surligne(p.nom, terme)}</span>
                    <span className="suggestion-detail">{[p.marque, p.reference].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="suggestion-prix">
                    {p.plusieursPrix ? <span className="suggestion-des">{t.catalogue.aPartirDe}</span> : null}
                    <Prix millimes={p.prix} />
                  </span>
                </li>
              ))
            : null}
          {visible && total > 0 ? (
            <li
              id={optionId(produits.length)}
              role="option"
              aria-selected={actif === produits.length}
              className="suggestion-tout"
              onMouseEnter={() => setActif(produits.length)}
              onClick={() => ouvre(produits.length)}
            >
              {t.recherche.voirTout(total, terme)}
              <Fleche taille={14} className="icone-fleche rtl:-scale-x-100" />
            </li>
          ) : null}
        </ul>
        {visible && total === 0 ? <p className="suggestion-rien">{t.recherche.rienPour(terme)}</p> : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {visible ? t.recherche.annonceSuggestions(produits.length) : ""}
      </p>
    </>
  );
}
