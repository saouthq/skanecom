import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine } from "@/lib/console/http";
import { PEUT_MODIFIER, type FicheProduit, type FicheTechnique } from "@/lib/gestion/catalogue";
import { rediger, type Faits } from "@/lib/gestion/redaction";

/* ============================================================================
   RÉDIGER LA DESCRIPTION (module redaction) — le bouton de la fiche
   (components/console/RedigerDescription.tsx) envoie ce que le champ contient
   (les notes du commerçant) ; la réponse est un brouillon, en JSON. Rien
   n'est enregistré ici : le brouillon remplit le champ, « Enregistrer la
   fiche » fait le reste. Les faits sont relus en base, pas pris au client.
   ========================================================================== */

export const dynamic = "force-dynamic";

const PRIVE = { "cache-control": "private, no-store" };
const refus = (erreur: string, status: number) => Response.json({ ok: false, erreur }, { status, headers: PRIVE });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  if (!memeOrigine(req)) return refus("Origine refusée.", 403);
  const { slug, id } = await params;
  const a = await accesEquipe();
  if (a.etat !== "ok") return refus("Votre session a expiré : reconnectez-vous.", 401);
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique || !/^[0-9a-f-]{36}$/.test(id)) return refus("Produit introuvable.", 404);
  if (!PEUT_MODIFIER.includes(boutique.role)) return refus("Votre rôle dans l'équipe ne permet pas de modifier la fiche.", 403);

  const sb = await clientSession();
  const ids = { p_boutique_id: boutique.boutique_id };
  const [{ data: etat }, { data: produit }, { data: technique }] = await Promise.all([
    sb.rpc("gestion_redaction_etat", ids),
    sb.rpc("gestion_produit", { ...ids, p_produit_id: id }),
    sb.rpc("gestion_fiche_technique", { ...ids, p_produit_id: id }),
  ]);
  if (!(etat as { actif?: boolean } | null)?.actif) return refus("La rédaction n'est pas ouverte pour votre boutique.", 403);
  if (!produit) return refus("Produit introuvable.", 404);
  const f = produit as FicheProduit;

  const corps = (await req.json().catch(() => ({}))) as { notes?: unknown };
  const notes = typeof corps.notes === "string" ? corps.notes.slice(0, 2000) : "";
  const faits: Faits = {
    nom: f.nom,
    rayon: f.categories.find((c) => c.id === f.categorie_id)?.nom ?? null,
    // La marque qui porte le nom de la boutique ne dit rien de plus (« Valise…, de Maymar »).
    marque: f.marque && f.marque.trim().toLowerCase() !== boutique.nom.trim().toLowerCase() ? f.marque : null,
    declinaisons: f.axes.map((x) => ({ axe: x.label, valeurs: x.valeurs })),
    caracteristiques: ((technique as FicheTechnique | null)?.attributs ?? [])
      .filter((l) => l.valeur !== null && l.valeur !== "")
      .map((l) => ({ libelle: l.label, valeur: `${l.type === "nombre" ? l.valeur!.replace(".", ",") : l.valeur}${l.unite ? ` ${l.unite}` : ""}` })),
    notes,
  };

  // En local (console.localhost), Workers AI n'existe pas : un brouillon d'essai, dit tel.
  const local = /(^|\.)localhost(:\d+)?$/.test(req.headers.get("host") ?? "");
  try {
    const { texte, essai } = await rediger(faits, local);
    return Response.json({ ok: true, texte, essai }, { headers: PRIVE });
  } catch (e) {
    console.error(e);
    return refus("La rédaction n'a pas abouti. Réessayez dans un instant ; votre texte n'a pas changé.", 502);
  }
}
