/* ============================================================================
   LES RÉSEAUX DE LA BOUTIQUE — lus dans ses réglages (contact.instagram,
   contact.facebook, contact.tiktok), tels que le commerçant les a tapés :
   « @maison.selma », « maison.selma » ou l'adresse du profil. La base en a
   vérifié la forme (migration 43) ; ici, chacun devient une adresse sûre, et
   le compte qu'on affiche.
   ========================================================================== */

export type Reseau = { reseau: "instagram" | "facebook" | "tiktok"; url: string; compte: string };

const ORDRE: Reseau["reseau"][] = ["instagram", "facebook", "tiktok"];

function lien(reseau: Reseau["reseau"], brut: string): Reseau | null {
  const v = brut.trim();
  if (!v) return null;
  if (/^https:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      const hotes = { instagram: /(^|\.)instagram\.com$/i, facebook: /(^|\.)facebook\.com$/i, tiktok: /(^|\.)tiktok\.com$/i };
      if (!hotes[reseau].test(u.hostname)) return null;
      const chemin = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
      const compte = (chemin[chemin.length - 1] ?? "").replace(/^@/, "");
      return { reseau, url: u.toString(), compte: compte ? `@${compte}` : u.hostname };
    } catch {
      return null;
    }
  }
  const compte = v.replace(/^@/, "");
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(compte)) return null;
  const url = {
    instagram: `https://www.instagram.com/${compte}/`,
    facebook: `https://www.facebook.com/${compte}`,
    tiktok: `https://www.tiktok.com/@${compte}`,
  }[reseau];
  return { reseau, url, compte: `@${compte}` };
}

export function reseauxDe(reglages: Record<string, unknown>): Reseau[] {
  return ORDRE.map((r) => {
    const brut = reglages[`contact.${r}`];
    return typeof brut === "string" ? lien(r, brut) : null;
  }).filter((r): r is Reseau => r !== null);
}
