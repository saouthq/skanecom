"use client";

import { useRef, useSyncExternalStore } from "react";
import { Icone, type NomIcone } from "@/components/console/Icone";
import { LIMITES } from "@/lib/pages-forme";

/* ============================================================================
   LE TEXTE D'UNE PAGE, AVEC SA MISE EN FORME — la zone où l'on écrit, et la
   barre qui pose les marques en peu de signes (## intertitre, ### question,
   **gras**, *italique*, - liste, [lien](adresse)) autour de la sélection ou
   en début de ligne, à la souris ou au clavier (⌘B, ⌘I, ⌘K) : personne n'a
   à les retenir. Le compteur de signes et l'aide sous la zone.
   ========================================================================== */

type Outil = "intertitre" | "question" | "gras" | "italique" | "liste" | "lien";
type Genre = "texte" | "questions";

const OUTILS: { cle: Outil; libelle: (mod: string) => string; seul?: Genre }[] = [
  { cle: "intertitre", libelle: () => "Intertitre (## en début de ligne)", seul: "texte" },
  { cle: "question", libelle: () => "Ajouter une question", seul: "questions" },
  { cle: "gras", libelle: (m) => `Gras (${m}B)` },
  { cle: "italique", libelle: (m) => `Italique (${m}I)` },
  { cle: "liste", libelle: () => "Liste à puces" },
  { cle: "lien", libelle: (m) => `Lien (${m}K)` },
];

const rien = () => () => {};
const surMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

export function ZoneTexte({
  id, valeur, genre, changer, erreur, rangs = 14, desactive = false,
}: {
  id: string;
  valeur: string;
  genre: Genre;
  changer: (texte: string) => void;
  erreur?: string;
  rangs?: number;
  desactive?: boolean;
}) {
  const zone = useRef<HTMLTextAreaElement>(null);
  const mac = useSyncExternalStore(rien, surMac, () => false);
  const mod = mac ? "⌘" : "Ctrl+";

  function remplacer(debut: number, fin: number, texte: string, selDebut: number, selFin: number) {
    const t = zone.current;
    if (!t) return;
    changer(valeur.slice(0, debut) + texte + valeur.slice(fin));
    requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(selDebut, selFin);
    });
  }

  function entourer(t: HTMLTextAreaElement, marque: string, defaut: string) {
    const { selectionStart: a, selectionEnd: b } = t;
    const choisi = valeur.slice(a, b);
    // Déjà entouré : on retire la marque.
    if (choisi && valeur.slice(a - marque.length, a) === marque && valeur.slice(b, b + marque.length) === marque) {
      remplacer(a - marque.length, b + marque.length, choisi, a - marque.length, b - marque.length);
      return;
    }
    const texte = choisi || defaut;
    remplacer(a, b, `${marque}${texte}${marque}`, a + marque.length, a + marque.length + texte.length);
  }

  function debutDeLigne(t: HTMLTextAreaElement, prefixe: string) {
    const { selectionStart: a, selectionEnd: b } = t;
    const debut = valeur.lastIndexOf("\n", a - 1) + 1;
    const finLigne = valeur.indexOf("\n", b);
    const fin = finLigne === -1 ? valeur.length : finLigne;
    const lignes = valeur.slice(debut, fin).split("\n");
    const tous = lignes.every((l) => l.startsWith(prefixe));
    const texte = lignes
      .map((l) => (tous ? l.slice(prefixe.length) : `${prefixe}${l.replace(/^(#{2,3}\s+|[-•*]\s+|\d{1,2}[.)]\s+)/, "")}`))
      .join("\n");
    remplacer(debut, fin, texte, debut, debut + texte.length);
  }

  function appliquer(outil: Outil) {
    const t = zone.current;
    if (!t) return;
    switch (outil) {
      case "gras": return entourer(t, "**", "texte en gras");
      case "italique": return entourer(t, "*", "texte en italique");
      case "intertitre": return debutDeLigne(t, "## ");
      case "liste": return debutDeLigne(t, "- ");
      case "lien": {
        const { selectionStart: a, selectionEnd: b } = t;
        const texte = valeur.slice(a, b) || "le texte du lien";
        // L'adresse est sélectionnée : il n'y a plus qu'à la taper (ou « /catalogue »).
        return remplacer(a, b, `[${texte}](https://)`, a + texte.length + 3, a + texte.length + 11);
      }
      case "question": {
        const a = t.selectionEnd;
        const avant = valeur.slice(0, a).replace(/\s+$/, "");
        const q = "Votre question ?";
        const saut = avant ? "\n\n" : "";
        const debutQ = avant.length + saut.length + 4;
        return remplacer(avant.length, a, `${saut}### ${q}\nLa réponse, en quelques phrases.`, debutQ, debutQ + q.length);
      }
    }
  }

  function raccourcis(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const outil = ({ b: "gras", i: "italique", k: "lien" } as const)[e.key.toLowerCase() as "b" | "i" | "k"];
    if (outil) { e.preventDefault(); appliquer(outil); }
  }

  const signes = valeur.length;
  return (
    <div className="champ pg-corps">
      <div className="pg-corps-tete">
        <label htmlFor={id}>Texte</label>
        <div className="pg-outils" role="toolbar" aria-label="Mise en forme" aria-controls={id}>
          {OUTILS.filter((o) => !o.seul || o.seul === genre).map((o) => (
            <button key={o.cle} type="button" className="btn-icone" aria-label={o.libelle(mod)} title={o.libelle(mod)} disabled={desactive}
              onMouseDown={(e) => e.preventDefault()} onClick={() => appliquer(o.cle)}>
              <Icone nom={o.cle as NomIcone} taille={16} />
            </button>
          ))}
        </div>
      </div>
      <textarea
        ref={zone}
        id={id}
        value={valeur}
        rows={rangs}
        disabled={desactive}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={erreur ? `${id}-erreur ${id}-signes` : `${id}-signes`}
        placeholder={genre === "questions"
          ? "### Comment payer ?\nÀ la livraison, en espèces.\n\n### Quels sont les délais ?\n2 à 4 jours ouvrés, partout en Tunisie."
          : "Une maison de Tunis, depuis 1998.\n\n## Nos matières\nDu lin et du coton, tissés à Ksar Hellal."}
        onKeyDown={raccourcis}
        onChange={(e) => changer(e.currentTarget.value)}
      />
      <div className="pg-corps-pied">
        {erreur ? <p id={`${id}-erreur`} className="pg-erreur">{erreur}</p> : <span />}
        <span id={`${id}-signes`} className="pg-signes" data-alerte={signes > LIMITES.corps * 0.9 ? "" : undefined}>
          {signes.toLocaleString("fr-FR")} / {LIMITES.corps.toLocaleString("fr-FR")} signes
        </span>
      </div>
      <details className="pg-aide">
        <summary>Mise en forme : ce que chaque signe donne</summary>
        <dl>
          <div><dt><code>## Livraison</code></dt><dd>un intertitre{genre === "questions" ? " (une question)" : ""}</dd></div>
          <div><dt><code>### Comment payer ?</code></dt><dd>{genre === "questions" ? "une question, sa réponse en dessous" : "un sous-titre"}</dd></div>
          <div><dt><code>**important**</code></dt><dd><b>important</b></dd></div>
          <div><dt><code>*en italique*</code></dt><dd><i>en italique</i></dd></div>
          <div><dt><code>- un point</code></dt><dd>une liste à puces (<code>1.</code> : numérotée)</dd></div>
          <div><dt><code>[le catalogue](/catalogue)</code></dt><dd>un lien vers une page de la boutique, ou une adresse https://, mailto:, tel:</dd></div>
          <div><dt>une ligne vide</dt><dd>un nouveau paragraphe</dd></div>
        </dl>
      </details>
    </div>
  );
}
