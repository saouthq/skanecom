/* ============================================================================
   LA RÉDACTION (module redaction) — « Rédiger la description » sur la fiche
   d'un produit : un brouillon écrit par un modèle de langue de Workers AI (la
   liaison AI du Worker, cloudflare.config.ts), à partir de ce que la fiche
   sait déjà. Le brouillon remplit le champ ; le commerçant relit, corrige,
   enregistre — ou revient à son texte.

   Le modèle ne reçoit que des faits : le nom, le rayon, la marque, les
   déclinaisons, les caractéristiques, et ce que le commerçant a déjà écrit
   (ses notes). Il a pour consigne de ne rien inventer (ni matière, ni mesure,
   ni garantie qu'on ne lui donne), et d'écrire dans le ton des boutiques :
   vouvoiement, phrases courtes, ni point d'exclamation, ni superlatif, ni
   prix.

   En local, la liaison n'a pas de simulateur (Workers AI n'existe qu'en
   ligne) : un brouillon d'essai, composé des seuls faits et dit tel, permet
   de vérifier le geste entier — pas le modèle.
   ========================================================================== */

/** Un modèle de Workers AI qui écrit bien le français. */
export const MODELE_REDACTION = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export type Faits = {
  nom: string;
  rayon: string | null;
  marque: string | null;
  /** Les déclinaisons : « Taille » → Cabine 55 cm, Moyenne 65 cm… */
  declinaisons: { axe: string; valeurs: string[] }[];
  /** La fiche technique remplie : « Poids » → « 3,2 kg ». */
  caracteristiques: { libelle: string; valeur: string }[];
  /** Ce que le commerçant a déjà écrit dans le champ : des notes à reprendre. */
  notes: string;
};

export const CONSIGNES = [
  "Vous rédigez la description d'un produit pour sa fiche, sur une boutique en ligne tunisienne.",
  "Règles strictes :",
  "- en français, au vouvoiement, en phrases courtes ;",
  "- aucun point d'exclamation, aucun superlatif (meilleur, incroyable, exceptionnel, parfait…), aucune formule publicitaire, aucun prix, aucune promotion ;",
  "- n'inventez rien : n'employez que les faits donnés ; un fait absent (matière, dimension, poids, garantie, origine) ne se mentionne pas ;",
  "- reprenez les notes du commerçant quand il y en a : ce sont des faits ;",
  "- un ou deux courts paragraphes qui disent à quoi sert la pièce et pour qui, puis, s'il y a des déclinaisons ou des caractéristiques, une liste de lignes commençant par « - » ;",
  "- ni titre, ni mise en forme (pas de #, pas de **), ni guillemets autour du texte ;",
  "- entre 60 et 150 mots.",
  "Répondez par la description seule.",
].join("\n");

/** La demande : les faits, un par ligne. */
export function demande(f: Faits): string {
  const lignes = [`Produit : ${f.nom}`];
  if (f.rayon) lignes.push(`Rayon : ${f.rayon}`);
  if (f.marque) lignes.push(`Marque : ${f.marque}`);
  for (const d of f.declinaisons) if (d.valeurs.length) lignes.push(`${d.axe} proposées : ${d.valeurs.join(", ")}`);
  for (const c of f.caracteristiques) lignes.push(`${c.libelle} : ${c.valeur}`);
  if (f.notes.trim()) lignes.push(`Notes du commerçant : ${f.notes.trim()}`);
  return lignes.join("\n");
}

/** Le texte rendu, propre : sans mise en forme, sans point d'exclamation, sans guillemets d'enveloppe. */
export function nettoie(brut: string): string {
  return brut
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*(?:description\s*:)\s*/i, "")
    .replace(/\*\*|__|^#{1,6}\s*/gm, "")
    .replace(/^\s*[•*]\s+/gm, "- ")
    .replace(/\s*!+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^["«»“”]+\s*|\s*["«»“”]+$/g, "")
    .slice(0, 2000)
    .trim();
}

/** Le brouillon d'essai, en local : les faits seuls, mis en phrases simples. */
export function brouillonEssai(f: Faits): string {
  const ou = [f.marque ? `de ${f.marque}` : null, f.rayon ? `au rayon ${f.rayon.toLowerCase()}` : null].filter(Boolean).join(", ");
  const tete = `${f.nom}${ou ? `, ${ou}` : ""}.${f.notes.trim() ? ` ${f.notes.trim().replace(/\.?$/, ".")}` : ""}`;
  const liste = [
    ...f.declinaisons.filter((d) => d.valeurs.length).map((d) => `- ${d.axe} : ${d.valeurs.join(", ")}`),
    ...f.caracteristiques.map((c) => `- ${c.libelle} : ${c.valeur}`),
  ];
  return [`[Brouillon d'essai, sans modèle de langue : en local, la rédaction n'existe qu'en ligne.]`, tete, liste.join("\n")]
    .filter(Boolean)
    .join("\n\n");
}

type Ai = { run(modele: string, entree: Record<string, unknown>): Promise<unknown> };

/** Le brouillon : `essai` dit qu'il ne vient pas du modèle (en local). */
export async function rediger(f: Faits, local: boolean): Promise<{ texte: string; essai: boolean }> {
  const { env } = await import("cloudflare:workers");
  const ai = (env as { AI?: Ai }).AI;
  try {
    if (!ai) throw new Error("la liaison AI manque au Worker (cloudflare.config.ts)");
    const sortie = await ai.run(MODELE_REDACTION, {
      messages: [
        { role: "system", content: CONSIGNES },
        { role: "user", content: demande(f) },
      ],
      max_tokens: 420,
      temperature: 0.4,
    });
    const brut = typeof sortie === "string" ? sortie : String((sortie as { response?: unknown })?.response ?? "");
    const texte = nettoie(brut);
    if (texte.length < 40) throw new Error("le modèle n'a rien rendu d'utilisable");
    return { texte, essai: false };
  } catch (e) {
    if (local) return { texte: brouillonEssai(f), essai: true };
    throw new Error(`Rédaction : ${e instanceof Error ? e.message : String(e)}`);
  }
}
