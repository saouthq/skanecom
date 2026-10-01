import Link from "next/link";
import type { ReactNode } from "react";
import { typographie } from "./typographie";

/* ============================================================================
   LE TEXTE D'UNE PAGE — ce que le commerçant écrit au backoffice, en peu de
   signes : des paragraphes (une ligne vide les sépare), des intertitres
   (« ## » et « ### » en début de ligne), des listes (« - » ou « 1. »), du
   gras (**…**), de l'italique (*…*) et des liens ([le texte](adresse) : une
   page de la boutique « /catalogue », une adresse https, mailto: ou tel:).

   Rien d'autre : pas de HTML. Tout est rendu en texte par React, qui
   l'échappe ; un lien vers une autre sorte d'adresse reste du texte.
   ========================================================================== */

export type Bloc =
  | { genre: "h2" | "h3" | "p"; texte: string }
  | { genre: "ul" | "ol"; items: string[] };

export { typographie };

export function blocs(source: string): Bloc[] {
  const sortie: Bloc[] = [];
  let paragraphe: string[] = [];
  let liste: { genre: "ul" | "ol"; items: string[] } | null = null;
  const fermer = () => {
    if (paragraphe.length) sortie.push({ genre: "p", texte: paragraphe.join(" ") });
    if (liste) sortie.push(liste);
    paragraphe = [];
    liste = null;
  };
  for (const brute of source.replace(/\r\n?/g, "\n").split("\n")) {
    const ligne = typographie(brute.trim());
    if (!ligne) { fermer(); continue; }
    const titre = /^(#{2,3})\s+(.+)$/.exec(ligne);
    if (titre) { fermer(); sortie.push({ genre: titre[1].length === 2 ? "h2" : "h3", texte: titre[2] }); continue; }
    const puce = /^[-•*]\s+(.+)$/.exec(ligne);
    const numero = /^\d{1,2}[.)]\s+(.+)$/.exec(ligne);
    if (puce || numero) {
      const genre = puce ? "ul" : "ol";
      if (paragraphe.length) { sortie.push({ genre: "p", texte: paragraphe.join(" ") }); paragraphe = []; }
      if (liste && liste.genre !== genre) { sortie.push(liste); liste = null; }
      liste ??= { genre, items: [] };
      liste.items.push((puce ?? numero)![1]);
      continue;
    }
    if (liste) { sortie.push(liste); liste = null; }
    paragraphe.push(ligne);
  }
  fermer();
  return sortie;
}

/** Une adresse qu'un lien peut prendre : une page de la boutique, https, mailto, tel. */
function adresseSure(url: string): { href: string; interne: boolean } | null {
  if (/^\/(?!\/)[A-Za-z0-9\-._~%/?=&#]*$/.test(url)) return { href: url, interne: true };
  if (/^(mailto:[^\s<>"]+|tel:\+?[0-9 ]{6,20})$/i.test(url)) return { href: url.replace(/\s+/g, ""), interne: false };
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? { href: u.toString(), interne: false } : null;
  } catch {
    return null;
  }
}

/** Le gras, l'italique, les liens d'une ligne. */
export function enLigne(texte: string, cle = "l"): ReactNode[] {
  const sortie: ReactNode[] = [];
  const motif = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let dernier = 0;
  let n = 0;
  for (const m of texte.matchAll(motif)) {
    if (m.index! > dernier) sortie.push(texte.slice(dernier, m.index));
    const k = `${cle}-${n++}`;
    if (m[1] !== undefined) sortie.push(<strong key={k}>{m[1]}</strong>);
    else if (m[2] !== undefined) sortie.push(<em key={k}>{m[2]}</em>);
    else {
      const sure = adresseSure(m[4]);
      if (!sure) sortie.push(m[3]);
      else if (sure.interne) sortie.push(<Link key={k} href={sure.href}>{m[3]}</Link>);
      else sortie.push(<a key={k} href={sure.href} {...(/^https?:/.test(sure.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{m[3]}</a>);
    }
    dernier = m.index! + m[0].length;
  }
  if (dernier < texte.length) sortie.push(texte.slice(dernier));
  return sortie;
}

export function Enrichi({ source, className }: { source: string; className?: string }) {
  return (
    <div className={className}>
      <BlocsRendus blocs={blocs(source)} cle="b" />
    </div>
  );
}

/** Une page de questions : chaque intertitre est une question, ce qui le
 *  suit jusqu'au suivant sa réponse. Le texte d'avant le premier : une
 *  introduction. */
export function questions(source: string): { intro: Bloc[]; questions: { question: string; reponse: Bloc[] }[] } {
  const intro: Bloc[] = [];
  const liste: { question: string; reponse: Bloc[] }[] = [];
  for (const b of blocs(source)) {
    if (b.genre === "h2" || b.genre === "h3") liste.push({ question: b.texte, reponse: [] });
    else if (liste.length) liste[liste.length - 1].reponse.push(b);
    else intro.push(b);
  }
  return { intro, questions: liste };
}

export function BlocsRendus({ blocs: liste, cle }: { blocs: Bloc[]; cle: string }) {
  return (
    <>
      {liste.map((b, i) => {
        const k = `${cle}-${i}`;
        switch (b.genre) {
          case "ul": return <ul key={k}>{b.items.map((x, j) => <li key={j}>{enLigne(x, `${k}-${j}`)}</li>)}</ul>;
          case "ol": return <ol key={k}>{b.items.map((x, j) => <li key={j}>{enLigne(x, `${k}-${j}`)}</li>)}</ol>;
          case "h2": return <h2 key={k}>{enLigne(b.texte, k)}</h2>;
          case "h3": return <h3 key={k}>{enLigne(b.texte, k)}</h3>;
          case "p": return <p key={k}>{enLigne(b.texte, k)}</p>;
        }
      })}
    </>
  );
}
