import { accesEquipe, clientSession } from "@/lib/console/session";
import { formateMontant } from "@/lib/prix";
import { libelleStatut } from "@/lib/gestion/libelles";
import { telephoneLisible } from "@/lib/commande";
import type { ElementPalette } from "@/lib/gestion/palette";

/* ============================================================================
   LA RECHERCHE DE LA PALETTE (⌘K) — ce qu'on tape retrouve, en parallèle,
   les commandes (numéro, nom, téléphone), les clients et les produits
   (nom, marque, référence), par les mêmes fonctions que les listes du
   backoffice, avec la session du membre (la base revérifie ses droits).
   Rend des lignes prêtes à afficher, quelques-unes par sorte.
   ========================================================================== */

export const dynamic = "force-dynamic";

function reponse(elements: ElementPalette[], statut = 200): Response {
  return Response.json({ elements }, { status: statut, headers: { "cache-control": "private, no-store" } });
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await accesEquipe();
  if (a.etat !== "ok") return reponse([], 401);
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return reponse([], 404);
  const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (q.length < 2) return reponse([]);

  const sb = await clientSession();
  const base = `/gestion/${slug}`;
  const [commandes, clients, produits] = await Promise.all([
    sb.rpc("gestion_liste_commandes", { p_boutique_id: boutique.boutique_id, p_etape: "toutes", p_recherche: q, p_limite: 5, p_decalage: 0 }),
    sb.rpc("gestion_liste_clients", { p_boutique_id: boutique.boutique_id, p_filtre: "tous", p_recherche: q, p_limite: 4, p_decalage: 0 }),
    sb.rpc("gestion_liste_produits", { p_boutique_id: boutique.boutique_id, p_filtre: "tous", p_recherche: q, p_limite: 4, p_decalage: 0 }),
  ]);

  type C = { numero: string; statut: string; mode_livraison: string; contact_nom: string; total_millimes: number };
  type Cl = { id: string; nom: string | null; telephone: string; nb_commandes: number };
  type P = { id: string; nom: string; marque: string | null; stock_total: number };
  const elements: ElementPalette[] = [
    ...((commandes.data as { commandes?: C[] } | null)?.commandes ?? []).map((c) => ({
      groupe: "Commandes", icone: "commandes" as const, href: `${base}/commandes/${encodeURIComponent(c.numero)}`,
      titre: c.numero, detail: `${c.contact_nom} · ${libelleStatut(c.statut, c.mode_livraison)} · ${formateMontant(c.total_millimes)} TND`,
    })),
    ...((clients.data as { clients?: Cl[] } | null)?.clients ?? []).map((c) => ({
      groupe: "Clients", icone: "personne" as const, href: `${base}/clients/${c.id}`,
      titre: c.nom ?? telephoneLisible(c.telephone), detail: `${telephoneLisible(c.telephone)} · ${c.nb_commandes} commande${c.nb_commandes > 1 ? "s" : ""}`,
    })),
    ...((produits.data as { produits?: P[] } | null)?.produits ?? []).map((p) => ({
      groupe: "Produits", icone: "colis" as const, href: `${base}/produits/${p.id}`,
      titre: p.nom, detail: `${p.marque ? `${p.marque} · ` : ""}${p.stock_total} en stock`,
    })),
  ];
  return reponse(elements);
}
