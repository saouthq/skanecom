import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";

/* Fermer, pour soi, une annonce de SkanEcom (public.gestion_fermer_annonce),
   puis revenir à la page où on la lisait. */
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { slug } = await params;
  const a = await accesEquipe();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aucune") return vers("/refuse");
  if (a.etat === "aal1") return vers("/double-authentification");
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });

  const f = await req.formData();
  const base = `/gestion/${slug}`;
  // La page où on la lisait (même origine : le Referer est envoyé).
  let demande = base;
  try {
    const r = new URL(req.headers.get("referer") ?? "");
    demande = `${r.pathname}${r.search}`;
  } catch { /* sans Referer : l'accueil du back-office */ }
  // Seulement une page de ce back-office : jamais une adresse venue d'ailleurs.
  const retour = demande === base || demande.startsWith(`${base}/`) || demande.startsWith(`${base}?`) ? demande : base;
  const sb = await clientSession();
  await sb.rpc("gestion_fermer_annonce", { p_boutique_id: boutique.boutique_id, p_annonce_id: Number(f.get("annonce_id") ?? 0) });
  return vers(retour);
}
