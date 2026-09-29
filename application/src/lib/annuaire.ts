import instantane from "../annuaire.genere.json";

/* ============================================================================
   L'ANNUAIRE — quel domaine mène à quelle boutique.

   Trois sources, dans cet ordre :
   1. l'INSTANTANÉ embarqué au déploiement (outils/annuaire.mjs) : aucune
      requête, il répond même quand la base est en panne. C'est ce qui garde
      les pages en cache joignables pendant une panne ;
   2. la MÉMOIRE du Worker : les réponses de la base, gardées 5 minutes, et
      gardées au-delà si la base ne répond plus ;
   3. la BASE (public.resoudre_domaine), pour un domaine ajouté depuis le
      dernier déploiement.
   Plus tard, un annuaire dans Workers KV remplacera l'instantané
   (docs/cadrage/02-infrastructure.md §2) : même rôle, sans redéploiement.
   ========================================================================== */

export type Resolution =
  | { etat: "boutique"; slug: string }
  | { etat: "fermee" }
  | { etat: "inconnu" }
  | { etat: "injoignable" };

type Entree = { resolution: Resolution; expire: number };

const DUREE_CONNU = 5 * 60_000;
const DUREE_INCONNU = 60_000;
// Une boutique fermée est souvent une boutique EN PRÉPARATION, qu'on va
// ouvrir depuis la console : on la redemande vite, pour qu'elle apparaisse
// dans les secondes qui suivent l'ouverture, pas cinq minutes plus tard.
const DUREE_FERMEE = 10_000;
const memoire = new Map<string, Entree>();
const ANNUAIRE = instantane as Record<string, string>;

/** Le domaine d'une requête, sans port ni point final, en minuscules. */
export function hoteDe(entete: string | null): string {
  return (entete ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

async function demandeALaBase(hote: string): Promise<Resolution> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const reponse = await fetch(`${url}/rest/v1/rpc/resoudre_domaine`, {
    method: "POST",
    headers: { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json" },
    body: JSON.stringify({ p_hote: hote }),
    signal: AbortSignal.timeout(1500),
  });
  if (!reponse.ok) throw new Error(`resoudre_domaine : HTTP ${reponse.status}`);
  const [ligne] = (await reponse.json()) as { slug: string; statut: string }[];
  if (!ligne) return { etat: "inconnu" };
  return ligne.statut === "active" ? { etat: "boutique", slug: ligne.slug } : { etat: "fermee" };
}

export async function resoudre(hote: string): Promise<Resolution> {
  const slug = ANNUAIRE[hote];
  if (slug) return { etat: "boutique", slug };

  const connu = memoire.get(hote);
  if (connu && connu.expire > Date.now()) return connu.resolution;

  try {
    const resolution = await demandeALaBase(hote);
    memoire.set(hote, {
      resolution,
      expire: Date.now() + (resolution.etat === "inconnu" ? DUREE_INCONNU : resolution.etat === "fermee" ? DUREE_FERMEE : DUREE_CONNU),
    });
    return resolution;
  } catch {
    // Base injoignable : la dernière réponse connue reste valable.
    return connu?.resolution ?? { etat: "injoignable" };
  }
}
