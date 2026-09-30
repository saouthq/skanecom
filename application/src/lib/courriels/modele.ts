/* ============================================================================
   LES E-MAILS — une seule mise en page, habillée aux couleurs de qui écrit :
   la boutique (l'acheteur reçoit un e-mail de Maymar, pas de SkanEcom) ou la
   plateforme (l'équipe, la console).

   Écrits pour les messageries, pas pour un navigateur : des tableaux, des
   styles en ligne, des polices de repli sûres, une feuille courte pour le
   téléphone (les messageries qui l'ignorent gardent la mise en page large,
   qui se resserre d'elle-même). En tête, le logo de la boutique s'il existe
   en image (PNG, JPEG — Gmail et Outlook bloquent le SVG), sinon son nom
   composé ; un filet à sa couleur d'accent ferme le haut de la carte.
   Clair seulement (color-scheme) : une messagerie en mode sombre n'inverse
   pas les couleurs de la marque. Toujours une version texte.

   Deux pièges des styles en ligne, tenus ici : les noms de police entre
   apostrophes (des guillemets fermeraient l'attribut style : toute la
   police serait perdue), et aucune couleur calculée par le client
   (color-mix n'existe pas dans les messageries : les teintes sont mêlées ici).

   Rien de ce qui vient de l'extérieur n'entre sans être échappé : le nom de
   la boutique, l'adresse, le lien.
   ========================================================================== */

export type Marque = {
  nom: string;
  /** L'adresse de la boutique (ou de la console), sans chemin : le logo et le pied y renvoient. */
  site: string | null;
  /** Le logo en image (PNG ou JPEG, adresse publique), et sa proportion largeur / hauteur. */
  logo?: { url: string; ratio: number } | null;
  couleurs: { fond: string; surface: string; surface2: string; filet: string; encre: string; encreDoux: string; accent: string };
  /** Le bouton : l'encre pleine (éditorial) ou l'accent en fond, texte encre (technique). */
  bouton: { fond: string; texte: string };
  angle: number;
  titres: "serif" | "sans";
  /** Le nom en capitales (gabarit technique). */
  capitales: boolean;
  /** Une ligne de contact en pied : téléphone, WhatsApp. */
  contact: string | null;
};

export type Contenu = {
  sujet: string;
  /** Le texte qu'affiche la liste des messages, sous le sujet. */
  apercu: string;
  titre: string;
  paragraphes: string[];
  code?: string;
  /** Sous le code : sa durée de vie, sa règle (« il ne sert qu'une fois »). */
  codeLegende?: string;
  bouton?: { libelle: string; url: string };
  /** Sous le bouton : « le bouton ne s'ouvre pas ? » et l'adresse en clair. */
  lienSecours?: string;
  /** Sous le code ou le bouton : la consigne, la sécurité. */
  notes: string[];
  raison: string;
  propulse?: string;
};

export type Courriel = { sujet: string; html: string; texte: string };

const ECHAPPE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const echappe = (x: string) => x.replace(/[&<>"']/g, (c) => ECHAPPE[c]);

/* Apostrophes seulement : ces piles vont dans des attributs style="…". */
export const PILES = {
  serif: "Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', serif",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  chiffres: "'SF Mono', ui-monospace, Menlo, Consolas, 'Liberation Mono', monospace",
};

/** Seules les adresses web passent dans un lien ou une image. */
function lienSur(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Une couleur « #RGB » ou « #RRGGBB » en canaux, sinon rien. */
function canaux(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** `part` de la couleur a mêlée à b (0 : b, 1 : a) ; b si l'une est illisible. */
export function melange(a: string, b: string, part: number): string {
  const x = canaux(a);
  const y = canaux(b);
  if (!x || !y) return b;
  return `#${x.map((v, i) => Math.round(v * part + y[i] * (1 - part)).toString(16).padStart(2, "0")).join("")}`;
}

export function rendre(m: Marque, c: Contenu): Courriel {
  const k = m.couleurs;
  const r = Math.max(0, Math.min(16, m.angle));
  const texte = PILES.sans;
  const titres = m.titres === "serif" ? PILES.serif : PILES.sans;
  const lien = c.bouton ? lienSur(c.bouton.url) : null;
  const site = m.site ? lienSur(m.site) : null;
  const logo = m.logo ? lienSur(m.logo.url) : null;
  const teinte = melange(k.accent, k.surface, 0.08);
  const bordTeinte = melange(k.accent, k.surface, 0.28);

  /* L'en-tête : le logo (hauteur fixe, largeur d'après sa proportion), ou le nom. */
  const nom = echappe(m.capitales ? m.nom.toLocaleUpperCase("fr") : m.nom);
  const hauteurLogo = 30;
  const largeurLogo = m.logo ? Math.round(Math.min(220, hauteurLogo * Math.max(0.5, Math.min(8, m.logo.ratio)))) : 0;
  const signe = logo
    ? `<img src="${echappe(logo)}" width="${largeurLogo}" height="${hauteurLogo}" alt="${echappe(m.nom)}" style="display:block;margin:0 auto;border:0;outline:none;width:${largeurLogo}px;height:${hauteurLogo}px;">`
    : `<span style="font:${m.titres === "serif" ? "400 28px/1.1" : "800 21px/1.1"} ${titres};letter-spacing:${m.capitales ? "2px" : "-0.2px"};color:${k.encre};">${nom}</span>`;
  const entete = site ? `<a href="${echappe(site)}" style="text-decoration:none;color:${k.encre};">${signe}</a>` : signe;

  const paragraphe = (x: string) =>
    `<p style="margin:0 0 16px;font:400 16px/1.65 ${texte};color:${k.encreDoux};">${echappe(x)}</p>`;

  const code = c.code
    ? `<tr><td class="c-marge" style="padding:12px 44px 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
          <tr><td align="center" style="padding:24px 12px;border-radius:${r}px;background:${teinte};border:1px solid ${bordTeinte};">
            <span class="c-code" style="font:700 38px/1.1 ${PILES.chiffres};letter-spacing:12px;color:${k.encre};padding-left:12px;">${echappe(c.code)}</span>
            ${c.codeLegende ? `<p style="margin:12px 0 0;font:500 13px/1.4 ${texte};color:${k.encreDoux};">${echappe(c.codeLegende)}</p>` : ""}
          </td></tr>
        </table>
      </td></tr>`
    : "";

  const bouton = lien && c.bouton
    ? `<tr><td class="c-marge" style="padding:12px 44px 4px;">
        <table role="presentation" class="c-bouton" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" style="border-radius:${r}px;background:${m.bouton.fond};">
            <a href="${echappe(lien)}" style="display:block;padding:16px 30px;border-radius:${r}px;font:600 16px/1 ${texte};color:${m.bouton.texte};text-decoration:none;">${echappe(c.bouton.libelle)}&nbsp;&rarr;</a>
          </td>
        </tr></table>
      </td></tr>`
    : "";

  const secours = lien && c.lienSecours
    ? `<tr><td class="c-marge" style="padding:16px 44px 0;">
        <p style="margin:0 0 4px;font:400 13px/1.55 ${texte};color:${k.encreDoux};">${echappe(c.lienSecours)}</p>
        <p style="margin:0;font:400 13px/1.55 ${texte};word-break:break-all;"><a href="${echappe(lien)}" style="color:${k.encreDoux};">${echappe(lien)}</a></p>
      </td></tr>`
    : "";

  const notes = c.notes.length
    ? `<tr><td class="c-marge" style="padding:24px 44px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding-top:20px;border-top:1px solid ${k.filet};">${c.notes
            .map((n) => `<p style="margin:0 0 10px;font:400 14px/1.6 ${texte};color:${k.encreDoux};">${echappe(n)}</p>`)
            .join("")}</td>
        </tr></table>
      </td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<meta name="x-apple-disable-message-reformatting">
<title>${echappe(c.sujet)}</title>
<style>
  @media (max-width: 520px) {
    .c-marge { padding-left: 24px !important; padding-right: 24px !important; }
    .c-titre { font-size: ${m.titres === "serif" ? "28px" : "23px"} !important; }
    .c-code { font-size: 32px !important; letter-spacing: 8px !important; padding-left: 8px !important; }
    .c-bouton { width: 100% !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${k.fond};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${echappe(c.apercu)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${k.fond};">
  <tr><td align="center" style="padding:36px 12px 44px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
      <tr><td align="center" style="padding:0 8px 28px;">${entete}</td></tr>
      <tr><td style="background:${k.surface};border:1px solid ${k.filet};border-top:3px solid ${k.accent};border-radius:${r}px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td class="c-marge" style="padding:44px 44px 8px;">
            <h1 class="c-titre" style="margin:0 0 18px;font:${m.titres === "serif" ? "400 32px/1.15" : "800 26px/1.2"} ${titres};letter-spacing:${m.titres === "serif" ? "-0.3px" : "-0.2px"};color:${k.encre};">${echappe(c.titre)}</h1>
            ${c.paragraphes.map(paragraphe).join("")}
          </td></tr>
          ${code}${bouton}${secours}${notes}
          <tr><td style="padding:0 0 36px;font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>
      </td></tr>
      <tr><td align="center" class="c-marge" style="padding:28px 28px 0;">
        <p style="margin:0 0 6px;font:600 13px/1.5 ${texte};color:${k.encre};">${site ? `<a href="${echappe(site)}" style="color:${k.encre};text-decoration:none;">${echappe(m.nom)}</a>` : echappe(m.nom)}</p>
        ${m.contact ? `<p style="margin:0 0 14px;font:400 13px/1.55 ${texte};color:${k.encreDoux};">${echappe(m.contact)}</p>` : ""}
        <p style="margin:0 0 6px;font:400 12px/1.6 ${texte};color:${k.encreDoux};">${echappe(c.raison)}</p>
        ${c.propulse ? `<p style="margin:10px 0 0;font:400 11px/1.6 ${texte};letter-spacing:0.2px;color:${melange(k.encreDoux, k.fond, 0.75)};">${echappe(c.propulse)}</p>` : ""}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const lignes = [
    m.nom,
    "",
    c.titre,
    "",
    ...c.paragraphes.flatMap((x) => [x, ""]),
    ...(c.code ? [c.code, ...(c.codeLegende ? [c.codeLegende] : []), ""] : []),
    ...(lien && c.bouton ? [`${c.bouton.libelle} : ${lien}`, ""] : []),
    ...c.notes.flatMap((x) => [x, ""]),
    "—",
    ...(m.contact ? [m.contact] : []),
    c.raison,
    ...(c.propulse ? [c.propulse] : []),
  ];
  return { sujet: c.sujet, html, texte: lignes.join("\n") };
}
