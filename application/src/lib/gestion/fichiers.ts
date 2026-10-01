import { urlFichier } from "@/lib/photos";

/* ============================================================================
   LE DÉPÔT DES FICHIERS — photos des produits, côté serveur.

   Production : le bucket R2 lié au Worker (liaison FICHIERS,
   cloudflare.config.ts), servi au public par son domaine
   (NEXT_PUBLIC_FICHIERS_URL).
   Local : le relais (outils/relais-rest.mjs) tient lieu de R2 — PUT et DELETE
   sur la même adresse publique, avec la clé de service comme clé de dépôt.
   On le reconnaît comme next.config.ts : l'adresse des fichiers est locale.

   La base a le dernier mot sur le chemin (dossier de la boutique,
   private.valide_chemin) ; ici, on vérifie ce que contient le fichier.
   ========================================================================== */

type R2 = {
  put(cle: string, corps: ArrayBuffer, options: { httpMetadata: { contentType: string; cacheControl: string } }): Promise<unknown>;
  delete(cle: string): Promise<void>;
};

/** Poids maximal d'une photo reçue (le navigateur les réduit d'ordinaire bien avant). */
export const POIDS_MAX = 10 * 1024 * 1024;

/** Le type d'une image d'après ses premiers octets — jamais d'après son nom
 *  ni d'après ce que le navigateur annonce. */
export function typeImage(o: Uint8Array): { type: string; extension: string } | null {
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return { type: "image/jpeg", extension: "jpg" };
  if (o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) return { type: "image/png", extension: "png" };
  const ascii = (debut: number, fin: number) => String.fromCharCode(...o.subarray(debut, fin));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { type: "image/webp", extension: "webp" };
  return null;
}

/** Largeur et hauteur d'une image PNG, JPEG ou WebP, lues dans son en-tête
 *  (le fichier n'est pas décodé). `null` si l'en-tête est illisible. */
export function dimensionsImage(o: Uint8Array): { largeur: number; hauteur: number } | null {
  const lu = new DataView(o.buffer, o.byteOffset, o.byteLength);
  const dans = (fin: number) => fin <= o.byteLength;
  const genre = typeImage(o);
  if (!genre) return null;
  if (genre.type === "image/png") {
    // Signature (8), longueur (4), « IHDR » (4), largeur, hauteur.
    return dans(24) ? { largeur: lu.getUint32(16), hauteur: lu.getUint32(20) } : null;
  }
  if (genre.type === "image/webp") {
    if (!dans(30)) return null;
    const bloc = String.fromCharCode(...o.subarray(12, 16));
    if (bloc === "VP8 ") return { largeur: lu.getUint16(26, true) & 0x3fff, hauteur: lu.getUint16(28, true) & 0x3fff };
    if (bloc === "VP8L") {
      const b = lu.getUint32(21, true);
      return { largeur: (b & 0x3fff) + 1, hauteur: ((b >> 14) & 0x3fff) + 1 };
    }
    if (bloc === "VP8X") {
      const l = o[24] | (o[25] << 8) | (o[26] << 16);
      const h = o[27] | (o[28] << 8) | (o[29] << 16);
      return { largeur: l + 1, hauteur: h + 1 };
    }
    return null;
  }
  // JPEG : on parcourt les segments jusqu'à l'en-tête de trame (SOF0 à SOF15,
  // sauf DHT C4, JPG C8 et DAC CC) : longueur, précision, hauteur, largeur.
  let i = 2;
  while (dans(i + 9)) {
    if (o[i] !== 0xff) return null;
    const marqueur = o[i + 1];
    if (marqueur === 0xff) { i += 1; continue; }
    if (marqueur === 0xd8 || (marqueur >= 0xd0 && marqueur <= 0xd7) || marqueur === 0x01) { i += 2; continue; }
    if (marqueur === 0xd9 || marqueur === 0xda) return null;
    if (marqueur >= 0xc0 && marqueur <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marqueur)) {
      return { largeur: lu.getUint16(i + 7), hauteur: lu.getUint16(i + 5) };
    }
    i += 2 + lu.getUint16(i + 2);
  }
  return null;
}

/** La même image sans ses métadonnées (EXIF, XMP, textes) : le lieu de la
 *  prise de vue, l'appareil, la date. Sans rien réencoder — on retire les
 *  segments (JPEG) ou les blocs (PNG, WebP) qui les portent. Le navigateur
 *  les a d'ordinaire déjà ôtées en réduisant la photo ; ceci vaut pour un
 *  envoi qui ne serait pas passé par lui. Illisible : l'image telle quelle. */
export function sansMetadonnees(o: Uint8Array): Uint8Array {
  const genre = typeImage(o);
  const lu = new DataView(o.buffer, o.byteOffset, o.byteLength);
  const ascii = (debut: number, fin: number) => String.fromCharCode(...o.subarray(debut, fin));
  try {
    if (genre?.type === "image/jpeg") {
      const morceaux: Uint8Array[] = [o.subarray(0, 2)];
      let i = 2;
      while (i + 4 <= o.byteLength && o[i] === 0xff) {
        const marqueur = o[i + 1];
        if (marqueur === 0xda) break; // le début de l'image : tout le reste est gardé tel quel
        const longueur = lu.getUint16(i + 2);
        // APP1 (EXIF, XMP), APP13 (IPTC), COM (commentaire) : retirés.
        if (![0xe1, 0xed, 0xfe].includes(marqueur)) morceaux.push(o.subarray(i, i + 2 + longueur));
        i += 2 + longueur;
      }
      morceaux.push(o.subarray(i));
      return concatene(morceaux);
    }
    if (genre?.type === "image/png") {
      const morceaux: Uint8Array[] = [o.subarray(0, 8)];
      let i = 8;
      while (i + 12 <= o.byteLength) {
        const longueur = lu.getUint32(i);
        const bloc = ascii(i + 4, i + 8);
        if (!["eXIf", "tEXt", "iTXt", "zTXt", "tIME"].includes(bloc)) morceaux.push(o.subarray(i, i + 12 + longueur));
        i += 12 + longueur;
      }
      return concatene(morceaux);
    }
    if (genre?.type === "image/webp") {
      const morceaux: Uint8Array[] = [];
      let i = 12;
      while (i + 8 <= o.byteLength) {
        const bloc = ascii(i, i + 4);
        const longueur = lu.getUint32(i + 4, true);
        const fin = Math.min(o.byteLength, i + 8 + longueur + (longueur & 1));
        if (bloc === "VP8X") {
          const copie = o.slice(i, fin);
          copie[8] &= ~(0x08 | 0x04); // les drapeaux EXIF et XMP
          morceaux.push(copie);
        } else if (bloc !== "EXIF" && bloc !== "XMP ") {
          morceaux.push(o.subarray(i, fin));
        }
        i = fin;
      }
      const corps = concatene(morceaux);
      const tete = new Uint8Array(12);
      tete.set(o.subarray(0, 12));
      new DataView(tete.buffer).setUint32(4, corps.byteLength + 4, true);
      return concatene([tete, corps]);
    }
  } catch {
    return o;
  }
  return o;
}

function concatene(morceaux: Uint8Array[]): Uint8Array {
  const tout = new Uint8Array(morceaux.reduce((n, m) => n + m.byteLength, 0));
  let i = 0;
  for (const m of morceaux) { tout.set(m, i); i += m.byteLength; }
  return tout;
}

function depotLocal(): string | null {
  const base = process.env.NEXT_PUBLIC_FICHIERS_URL;
  if (!base) return null;
  return ["127.0.0.1", "localhost"].includes(new URL(base).hostname) ? base : null;
}

async function bucket(): Promise<R2> {
  const { env } = await import("cloudflare:workers");
  const r2 = env.FICHIERS as R2 | undefined;
  if (!r2) throw new Error("Dépôt de fichiers : la liaison R2 FICHIERS manque au Worker (cloudflare.config.ts)");
  return r2;
}

function cleLocale(): string {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cle) throw new Error("Dépôt local : SUPABASE_SERVICE_ROLE_KEY manque (application/.dev.vars)");
  return cle;
}

/** Dépose un fichier. Ses noms sont uniques : il ne change jamais, on le
 *  garde un an en cache. */
export async function deposerFichier(chemin: string, corps: ArrayBuffer, type: string): Promise<void> {
  if (depotLocal()) {
    const r = await fetch(urlFichier(chemin), {
      method: "PUT",
      headers: { "content-type": type, "x-depot-cle": cleLocale() },
      body: corps,
    });
    if (!r.ok) throw new Error(`Dépôt local refusé (${r.status})`);
    return;
  }
  await (await bucket()).put(chemin, corps, {
    httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" },
  });
}

/** Retire un fichier ; sans erreur s'il n'y est déjà plus. */
export async function retirerFichier(chemin: string): Promise<void> {
  if (depotLocal()) {
    const r = await fetch(urlFichier(chemin), { method: "DELETE", headers: { "x-depot-cle": cleLocale() } });
    if (!r.ok && r.status !== 404) throw new Error(`Retrait local refusé (${r.status})`);
    return;
  }
  await (await bucket()).delete(chemin);
}
