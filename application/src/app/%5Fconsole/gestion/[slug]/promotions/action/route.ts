import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { millimes } from "@/lib/console/import";
import { messagePromotions } from "@/lib/gestion/promotions";

/* ============================================================================
   LES GESTES SUR LES CODES PROMO — créer ou régler (public.gestion_enregistrer_code),
   couper, réactiver, retirer (public.gestion_geste_code). Formulaires HTML
   ordinaires, réponse par une redirection 303 vers l'écran, sur le code
   concerné. La base revérifie le rôle, la forme et ce qui a déjà servi.
   ========================================================================== */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

const REUSSITES: Record<string, (code: string) => string> = {
  creer: (c) => `Code ${c} créé : il vaut au tunnel dès son premier jour.`,
  enregistrer: (c) => `Code ${c} enregistré.`,
  couper: (c) => `Code ${c} coupé : plus personne ne s'en sert. Les commandes passées gardent leur remise.`,
  reactiver: (c) => `Code ${c} réactivé.`,
  retirer: (c) => `Code ${c} retiré.`,
};

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
  const texte = (cle: string) => String(f.get(cle) ?? "").trim();
  const geste = texte("geste");
  const codeId = texte("code_id");
  // L'ancre deux fois : en fragment (le navigateur y va, sans script) et en
  // paramètre (le geste en place la lit : fetch perd le fragment).
  const retour = (m: string, ok = false, ancre = "") =>
    vers(`/gestion/${slug}/promotions?${new URLSearchParams({ ...(ok ? { ok: m } : { erreur: m }), ...(ancre ? { ancre: ancre.slice(1) } : {}) })}${ancre}`);
  if (codeId && !UUID.test(codeId)) return retour("Code inconnu.");
  const sb = await clientSession();

  if (geste === "enregistrer") {
    const type = texte("type");
    // La valeur : un pourcentage entier, ou un montant en dinars (« 20 », « 12,500 »).
    const brute = texte("valeur");
    const valeur = type === "pourcentage" ? (/^\d{1,3}$/.test(brute) ? Number(brute) : NaN) : type === "montant" ? millimes(brute) : null;
    if (type !== "livraison" && (valeur === null || Number.isNaN(valeur))) {
      return retour(type === "pourcentage" ? "La remise : un pourcentage entier, de 1 à 90." : "Le montant est illisible (ex. 20 ou 12,500).");
    }
    const minimum = millimes(texte("minimum"));
    if (minimum !== null && Number.isNaN(minimum)) return retour("Le minimum d'achat est illisible (ex. 150).");
    const limiteBrute = texte("limite").replace(/[\s  ]/g, "");
    const limite = limiteBrute === "" ? null : /^\d{1,7}$/.test(limiteBrute) ? Number(limiteBrute) : NaN;
    if (Number.isNaN(limite)) return retour("Le nombre d'utilisations : un nombre entier, ou rien pour aucune limite.");
    const debut = JOUR.test(texte("debut")) ? texte("debut") : null;
    const fin = JOUR.test(texte("fin")) ? texte("fin") : null;

    const { data, error } = await sb.rpc("gestion_enregistrer_code", {
      p_boutique_id: boutique.boutique_id,
      p_code_id: codeId || null,
      p_code: texte("code"),
      p_type: type || null,
      p_valeur: valeur,
      p_minimum: minimum ?? 0,
      p_debut: debut,
      p_fin: fin,
      p_limite: limite,
      p_une_fois: f.get("une_fois") === "1",
      p_note: texte("note") || null,
    });
    if (error) return retour(messagePromotions(error.hint, error.message), false, codeId ? `#code-${codeId}` : "#nouveau");
    const r = data as { id: string; code: string };
    return retour(REUSSITES[codeId ? "enregistrer" : "creer"](r.code), true, `#code-${r.id}`);
  }

  if (!UUID.test(codeId) || !["couper", "reactiver", "retirer"].includes(geste)) return retour("Geste inconnu.");
  const { data, error } = await sb.rpc("gestion_geste_code", { p_boutique_id: boutique.boutique_id, p_code_id: codeId, p_geste: geste });
  if (error) return retour(messagePromotions(error.hint, error.message), false, `#code-${codeId}`);
  const r = data as { code: string };
  return retour(REUSSITES[geste](r.code), true, geste === "retirer" ? "" : `#code-${codeId}`);
}
