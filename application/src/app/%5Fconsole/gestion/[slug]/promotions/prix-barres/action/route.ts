import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { messagePrixBarres, pluriel } from "@/lib/gestion/promotions";

/* ============================================================================
   LES GESTES SUR LES PRIX BARRÉS — voir ce que ça change (retour sur l'écran
   avec l'aperçu), lancer (public.gestion_lancer_soldes, et le réglage des prix
   barrés si on l'a demandé), terminer (public.gestion_terminer_soldes).
   Formulaires HTML ordinaires, réponse par une redirection 303 vers l'écran,
   sur l'opération concernée. La base revérifie le rôle, le module et le rayon.
   ========================================================================== */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
  // L'ancre deux fois : en fragment (le navigateur y va, sans script) et en
  // paramètre (le geste en place la lit : fetch perd le fragment).
  const retour = (champs: Record<string, string>, ancre = "") =>
    vers(`/gestion/${slug}/promotions/prix-barres?${new URLSearchParams({ ...champs, ...(ancre ? { ancre } : {}) })}${ancre ? `#${ancre}` : ""}`);
  const nom = texte("nom").replace(/\s+/g, " ").slice(0, 60);
  const rayon = texte("rayon");
  const remise = texte("remise").replace(/\s|%/g, "");
  if (rayon && !UUID.test(rayon)) return retour({ erreur: "Ce rayon n'existe pas dans cette boutique." }, "nouvelle");
  const saisie = { nom, rayon, remise };

  if (geste === "apercu" || geste === "lancer") {
    if (nom.length < 2) return retour({ ...saisie, erreur: "Donnez un nom à l'opération (« Promo de la rentrée »)." }, "nouvelle");
    if (!/^\d{1,2}$/.test(remise) || Number(remise) < 5 || Number(remise) > 90) {
      return retour({ nom, rayon, erreur: "La remise : un pourcentage entier, de 5 à 90." }, "nouvelle");
    }
  }
  // L'aperçu : la page le calcule d'après l'adresse, rien ne change encore.
  if (geste === "apercu") return retour(saisie, "apercu");

  const sb = await clientSession();
  if (geste === "lancer") {
    const { data, error } = await sb.rpc("gestion_lancer_soldes", {
      p_boutique_id: boutique.boutique_id, p_nom: nom, p_categorie_id: rayon || null, p_pourcentage: Number(remise),
    });
    if (error) return retour({ ...saisie, erreur: messagePrixBarres(error.hint, error.message) }, "apercu");
    const r = data as { id: string; nom: string; declinaisons: number };
    let suite = "La vitrine les montre d'ici cinq minutes ; le panier et la commande les appliquent déjà.";
    if (f.get("afficher") === "1") {
      const reglage = await sb.rpc("gestion_enregistrer_reglages", {
        p_boutique_id: boutique.boutique_id, p_valeurs: { "catalogue.afficher_prix_barres": true },
      });
      suite = reglage.error
        ? `Les prix barrés restent masqués sur la vitrine (${reglage.error.message}) : Réglages, Vitrine et contact.`
        : "La vitrine affiche maintenant les prix barrés, d'ici cinq minutes ; le panier et la commande appliquent déjà les nouveaux prix.";
    }
    return retour({ ok: `« ${r.nom} » lancée : ${pluriel(r.declinaisons, "déclinaison")} à −${remise}\u00a0%. ${suite}` }, `op-${r.id}`);
  }

  const soldeId = texte("solde_id");
  if (geste !== "terminer" || !UUID.test(soldeId)) return retour({ erreur: "Geste inconnu." });
  const { data, error } = await sb.rpc("gestion_terminer_soldes", { p_boutique_id: boutique.boutique_id, p_solde_id: soldeId });
  if (error) return retour({ erreur: messagePrixBarres(error.hint, error.message) }, `op-${soldeId}`);
  const r = data as { nom: string; rendues: number; gardees: number };
  const gardees = r.gardees > 0
    ? ` ${pluriel(r.gardees, "déclinaison garde", "déclinaisons gardent")} le prix saisi à la main pendant l'opération.`
    : "";
  return retour({ ok: `« ${r.nom} » terminée : ${pluriel(r.rendues, "prix rendu", "prix rendus")}.${gardees}` }, `op-${soldeId}`);
}
