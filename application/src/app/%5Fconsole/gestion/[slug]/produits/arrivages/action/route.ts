import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { rafraichirVitrine } from "@/lib/console/vitrine-cache";
import { messageArrivage, jourArrivage, type ReceptionArrivage } from "@/lib/gestion/arrivages";

/* ============================================================================
   LES GESTES SUR LES ARRIVAGES — annoncer ou changer
   (public.gestion_enregistrer_arrivage), réceptionner
   (public.gestion_recevoir_arrivage : les quantités reçues, `q:<id>`),
   annuler (public.gestion_annuler_arrivage). Formulaires HTML ordinaires,
   réponse par une redirection 303 vers l'écran, sur l'arrivage concerné.
   La base revérifie le rôle, les déclinaisons et les quantités. Chaque
   geste réussi renouvelle la vitrine : la précommande y paraît (ou s'en va)
   tout de suite, le stock reçu aussi.
   ========================================================================== */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  const id = texte("arrivage_id");
  const base = `/gestion/${slug}/produits/arrivages`;
  // L'ancre deux fois : en fragment (le navigateur y va, sans script) et en
  // paramètre (le geste en place la lit : fetch perd le fragment).
  const retour = (m: string, ok: boolean, page = base, ancre = "") =>
    vers(`${page}?${new URLSearchParams({ ...(ok ? { ok: m } : { erreur: m }), ...(ancre ? { ancre } : {}) })}${ancre ? `#${ancre}` : ""}`);
  if (id && !UUID.test(id)) return retour("Arrivage inconnu.", false);
  const lignes = () => {
    const l: { variante_id: string; quantite: string }[] = [];
    for (const [cle, brut] of f.entries()) {
      if (!cle.startsWith("q:")) continue;
      const quantite = String(brut).replace(/\s/g, "");
      if (quantite === "" || quantite === "0") continue;
      l.push({ variante_id: cle.slice(2), quantite });
    }
    return l;
  };
  const sb = await clientSession();

  if (geste === "enregistrer") {
    const page = id ? `${base}/${id}` : `${base}/nouveau`;
    const date = texte("date_prevue");
    if (!DATE.test(date)) return retour("La date prévue est illisible.", false, page);
    const { data, error } = await sb.rpc("gestion_enregistrer_arrivage", {
      p_boutique_id: boutique.boutique_id,
      p_arrivage_id: id || null,
      p_nom: texte("nom"),
      p_date_prevue: date,
      p_lignes: lignes(),
      p_note: texte("note") || null,
    });
    if (error) return retour(messageArrivage(error.hint, error.message), false, page);
    const r = data as { id: string; nom: string };
    rafraichirVitrine(slug);
    return retour(
      id ? `« ${r.nom} » enregistré, prévu le ${jourArrivage(date)}.`
         : `« ${r.nom} » est annoncé pour le ${jourArrivage(date)}. Ses pièces épuisées se précommandent dès maintenant, si le réglage est allumé.`,
      true, base, `arrivage-${r.id}`);
  }

  if (!UUID.test(id)) return retour("Arrivage inconnu.", false);

  if (geste === "recevoir") {
    const { data, error } = await sb.rpc("gestion_recevoir_arrivage", {
      p_boutique_id: boutique.boutique_id, p_arrivage_id: id, p_lignes: lignes(),
    });
    if (error) return retour(messageArrivage(error.hint, error.message), false, base, `arrivage-${id}`);
    const r = data as ReceptionArrivage;
    rafraichirVitrine(slug);
    const servies = r.servies.length
      ? ` ${r.servies.length} précommande${r.servies.length > 1 ? "s servies" : " servie"} (${r.servies.join(", ")}) : ${r.servies.length > 1 ? "elles passent" : "elle passe"} « À préparer ».`
      : "";
    const attente = r.en_attente ? ` ${r.en_attente} commande${r.en_attente > 1 ? "s attendent" : " attend"} encore.` : "";
    return retour(`« ${r.nom} » reçu : ${r.pieces} pièce${r.pieces > 1 ? "s" : ""} au stock.${servies}${attente}`, true);
  }

  if (geste === "annuler") {
    const { data, error } = await sb.rpc("gestion_annuler_arrivage", { p_boutique_id: boutique.boutique_id, p_arrivage_id: id });
    if (error) return retour(messageArrivage(error.hint, error.message), false, base, `arrivage-${id}`);
    const r = data as { nom: string; en_attente: number };
    rafraichirVitrine(slug);
    return retour(
      `« ${r.nom} » annulé : plus rien ne s'y précommande.${r.en_attente ? ` ${r.en_attente} commande${r.en_attente > 1 ? "s l'attendaient" : " l'attendait"} : prévenez les clients.` : ""}`,
      true);
  }

  return retour("Geste inconnu.", false);
}
