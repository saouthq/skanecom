import { strFromU8, unzipSync } from "fflate";

/* ============================================================================
   LECTURE D'UN TABLEUR — .xlsx (Excel, LibreOffice, Google Sheets) ou .csv.

   Pas de bibliothèque de tableur : un .xlsx est une archive zip de fichiers
   XML, et l'import n'a besoin que des VALEURS de la première feuille. On
   décompresse (fflate, qui tourne dans un Worker) et on lit les cellules :
   chaînes partagées, chaînes en ligne, nombres, booléens, résultats de
   formule. Mise en forme, dates et fusions sont ignorées.

   Sortie : un tableau de lignes, chaque ligne un tableau de textes, la
   première ligne étant celle des en-têtes.
   ========================================================================== */

export type Lignes = string[][];

const LIMITE_OCTETS_DECOMPRESSES = 50 * 1024 * 1024;

function entites(texte: string): string {
  return texte.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : "";
  });
}

/** Le texte d'un <si> ou d'un <is> : tous ses <t>, y compris ceux d'un texte
 *  enrichi (<r><t>…</t></r>). */
function texteDe(xml: string): string {
  let sortie = "";
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) sortie += entites(m[1] ?? "");
  return sortie;
}

/** « AB12 » → 27 (colonnes numérotées à partir de 0). */
function colonne(reference: string): number {
  const lettres = /^[A-Z]+/.exec(reference)?.[0] ?? "A";
  let n = 0;
  for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

export function litXlsx(octets: Uint8Array): Lignes {
  let taille = 0;
  const fichiers = unzipSync(octets, {
    filter: (f) => {
      const utile = f.name === "xl/workbook.xml" || f.name === "xl/_rels/workbook.xml.rels" ||
        f.name === "xl/sharedStrings.xml" || f.name.startsWith("xl/worksheets/sheet");
      if (utile) taille += f.originalSize;
      if (taille > LIMITE_OCTETS_DECOMPRESSES) throw new Error("Fichier trop volumineux une fois décompressé.");
      return utile;
    },
  });
  const lire = (nom: string) => (fichiers[nom] ? strFromU8(fichiers[nom]) : null);

  // La première feuille du classeur, dans l'ordre des onglets.
  const classeur = lire("xl/workbook.xml");
  const relations = lire("xl/_rels/workbook.xml.rels");
  let cheminFeuille = "xl/worksheets/sheet1.xml";
  const premiere = classeur ? /<sheet\b[^>]*\br:id="([^"]+)"/.exec(classeur)?.[1] : undefined;
  if (premiere && relations) {
    const cible = new RegExp(`<Relationship\\b[^>]*\\bId="${premiere}"[^>]*\\bTarget="([^"]+)"`).exec(relations)?.[1]
      ?? new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${premiere}"`).exec(relations)?.[1];
    if (cible) cheminFeuille = cible.startsWith("/") ? cible.slice(1) : `xl/${cible.replace(/^\.\//, "")}`;
  }
  const feuille = lire(cheminFeuille);
  if (!feuille) throw new Error("Aucune feuille lisible dans ce classeur.");

  const partagees: string[] = [];
  const sst = lire("xl/sharedStrings.xml");
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) partagees.push(texteDe(m[1]));

  const lignes: Lignes = [];
  for (const rang of feuille.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const attributs = rang[1] ?? rang[3] ?? "";
    const numero = Number(/\br="(\d+)"/.exec(attributs)?.[1] ?? lignes.length + 1);
    const cellules: string[] = [];
    for (const c of (rang[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attr = c[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(attr)?.[1];
      const type = /\bt="([^"]+)"/.exec(attr)?.[1] ?? "n";
      const contenu = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(contenu)?.[1];
      let valeur = "";
      if (type === "s" && v !== undefined) valeur = partagees[Number(v)] ?? "";
      else if (type === "inlineStr") valeur = texteDe(contenu);
      else if (type === "b") valeur = v === "1" ? "oui" : "non";
      else if (v !== undefined) valeur = entites(v);
      cellules[ref ? colonne(ref) : cellules.length] = valeur;
    }
    // Les lignes vides sautées par Excel gardent leur numéro : les erreurs
    // citent la ligne telle que l'utilisateur la voit dans son tableur.
    while (lignes.length < numero - 1) lignes.push([]);
    lignes.push(Array.from(cellules, (x) => (x ?? "").trim()));
  }
  return lignes;
}

/** CSV : virgule ou point-virgule (Excel en français exporte en « ; »),
 *  guillemets doublés, retours à la ligne dans une cellule entre guillemets. */
export function litCsv(texte: string): Lignes {
  const sansBom = texte.replace(/^﻿/, "");
  const premiere = sansBom.split(/\r?\n/, 1)[0] ?? "";
  const separateur = (premiere.match(/;/g)?.length ?? 0) > (premiere.match(/,/g)?.length ?? 0) ? ";" : ",";
  const lignes: Lignes = [];
  let ligne: string[] = [];
  let cellule = "";
  let entre = false;
  for (let i = 0; i < sansBom.length; i++) {
    const c = sansBom[i];
    if (entre) {
      if (c === '"' && sansBom[i + 1] === '"') { cellule += '"'; i++; }
      else if (c === '"') entre = false;
      else cellule += c;
    } else if (c === '"') entre = true;
    else if (c === separateur) { ligne.push(cellule.trim()); cellule = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && sansBom[i + 1] === "\n") i++;
      ligne.push(cellule.trim()); lignes.push(ligne); ligne = []; cellule = "";
    } else cellule += c;
  }
  if (cellule !== "" || ligne.length > 0) { ligne.push(cellule.trim()); lignes.push(ligne); }
  return lignes;
}

/** Le bon lecteur selon le contenu (un .xlsx commence par « PK », la
 *  signature zip), pas selon le nom du fichier. */
export function litTableur(octets: Uint8Array): Lignes {
  if (octets[0] === 0x50 && octets[1] === 0x4b) return litXlsx(octets);
  return litCsv(new TextDecoder("utf-8").decode(octets));
}
