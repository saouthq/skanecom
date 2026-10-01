import { chargeCadre } from "@/lib/boutique";
import { supabase } from "@/lib/supabase";
import { ipDe } from "@/lib/console/http";

/* Une page vue de la vitrine (components/MesureAudience.tsx, réglage
   vitrine.statistiques). L'adresse IP et le navigateur ne servent qu'à
   calculer, ici, une clé — leur empreinte — que la base sale du sel du
   jour (public.compter_vue) : ni l'une ni l'autre n'est gardée. Les robots
   (moteurs, aperçus de liens) ne comptent pas. Réponse vide, toujours. */

export const dynamic = "force-dynamic";

const ROBOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|embedly|lighthouse|pingdom|uptime|monitor|curl|wget|python|httpclient/i;

const rien = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

async function empreinte(texte: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(h)].map((o) => o.toString(16).padStart(2, "0")).join("");
}

function appareilDe(ua: string): "telephone" | "tablette" | "ordinateur" {
  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(ua)) return "tablette";
  if (/mobi|iphone|ipod|android|windows phone|opera mini/i.test(ua)) return "telephone";
  return "ordinateur";
}

export async function POST(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || ROBOTS.test(ua)) return rien();
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre?.statistiques) return rien();
  const corps = (await req.json().catch(() => null)) as { chemin?: unknown; source?: unknown } | null;
  const chemin = typeof corps?.chemin === "string" ? corps.chemin.slice(0, 300) : "";
  if (!chemin.startsWith("/")) return rien();
  // La source : le nom de domaine du site d'où l'on vient — jamais la boutique elle-même.
  let source: string | null = null;
  if (typeof corps?.source === "string" && corps.source) {
    try {
      const hote = new URL(corps.source).hostname.toLowerCase();
      if (hote && hote !== (req.headers.get("host") ?? "").split(":")[0].toLowerCase()) source = hote.slice(0, 120);
    } catch {
      // une source illisible ne compte pas
    }
  }
  const cle = await empreinte(`${ipDe(req) ?? "?"}|${ua}`);
  const { error } = await supabase.rpc("compter_vue", {
    p_boutique_id: cadre.boutique.id, p_cle: cle, p_chemin: chemin, p_source: source, p_appareil: appareilDe(ua),
  });
  if (error) console.error(`compter_vue (${boutique}) : ${error.message}`);
  return rien();
}
