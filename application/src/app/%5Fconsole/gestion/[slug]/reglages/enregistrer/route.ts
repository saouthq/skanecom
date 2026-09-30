import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { millimes } from "@/lib/console/import";
import { grammesSaisis, libelleTranche, messageReglages, valeursDe, type EtatReglages } from "@/lib/gestion/reglages";

/* ============================================================================
   ENREGISTRER LES RÉGLAGES — une section à la fois (ses seuls champs), une
   zone, une tranche de poids, ou le rattachement des gouvernorats.
   Formulaires HTML ordinaires, réponse par une redirection 303 vers l'écran,
   à la hauteur de la section.
   La base revérifie le rôle et chaque valeur (…_gestion_reglages.sql).
   ========================================================================== */

export const dynamic = "force-dynamic";

/** « 3 » → 3 ; vide → null ; illisible → NaN. */
function jours(texte: string): number | null {
  if (!texte.trim()) return null;
  const n = Number.parseInt(texte, 10);
  return Number.isFinite(n) ? n : Number.NaN;
}

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
  const section = texte("section");
  const ecran = `/gestion/${slug}/reglages`;
  const retour = (ancre: string) => (m: string, ok = false) =>
    vers(`${ecran}?${new URLSearchParams(ok ? { ok: m } : { erreur: m })}#${ancre}`);
  const b = boutique.boutique_id;
  const sb = await clientSession();

  if (section === "zone") {
    const r = retour("t-zones");
    const frais = millimes(texte("frais"));
    const [min, max] = [jours(texte("delai_min")), jours(texte("delai_max"))];
    if (frais === null || Number.isNaN(frais)) return r("Tarif illisible : écrivez par exemple 8,000.");
    if (Number.isNaN(min) || Number.isNaN(max)) return r("Délai illisible : un nombre de jours.");
    const { error } = await sb.rpc("gestion_enregistrer_zone", {
      p_boutique_id: b, p_zone_id: texte("zone_id") || null, p_nom: texte("nom"), p_frais: frais,
      p_delai_min: min, p_delai_max: max, p_actif: texte("zone_id") ? f.get("actif") === "1" : true,
    });
    if (error) return r(messageReglages(error.hint, error.message));
    return r(texte("zone_id") ? `Zone « ${texte("nom")} » enregistrée.` : `Zone « ${texte("nom")} » ajoutée : rattachez-lui ses gouvernorats.`, true);
  }

  if (section === "zone_supprimer") {
    const r = retour("t-zones");
    const { data, error } = await sb.rpc("gestion_supprimer_zone", { p_boutique_id: b, p_zone_id: texte("zone_id") });
    if (error) return r(messageReglages(error.hint, error.message));
    const n = Number(data ?? 0);
    return r(n ? `Zone supprimée : ${n} gouvernorat${n > 1 ? "s" : ""} au tarif fixe.` : "Zone supprimée.", true);
  }

  if (section === "tranche") {
    const r = retour("t-poids");
    const poids = grammesSaisis(texte("jusqu_a"));
    const supplement = millimes(texte("supplement"));
    if (Number.isNaN(poids)) return r("Poids illisible : écrivez par exemple 5 ou 2,5 (en kg).");
    if (supplement === null || Number.isNaN(supplement)) return r("Supplément illisible : écrivez par exemple 3,000 (0 pour aucun).");
    const { error } = await sb.rpc("gestion_enregistrer_tranche", {
      p_boutique_id: b, p_id: texte("tranche_id") || null, p_jusqu_a_grammes: poids, p_supplement: supplement,
    });
    if (error) return r(messageReglages(error.hint, error.message));
    const nom = libelleTranche(poids);
    return r(texte("tranche_id") ? `Tranche « ${nom} » enregistrée.` : `Tranche « ${nom} » ajoutée.`, true);
  }

  if (section === "tranche_supprimer") {
    const r = retour("t-poids");
    const { error } = await sb.rpc("gestion_supprimer_tranche", { p_boutique_id: b, p_id: texte("tranche_id") });
    if (error) return r(messageReglages(error.hint, error.message));
    return r("Tranche supprimée.", true);
  }

  if (section === "gouvernorats") {
    const r = retour("t-gouvernorats");
    const affectations: Record<string, string | null> = {};
    for (const [cle, valeur] of f.entries()) {
      if (cle.startsWith("g.")) affectations[cle.slice(2)] = String(valeur) || null;
    }
    const { data, error } = await sb.rpc("gestion_rattacher_gouvernorats", { p_boutique_id: b, p_affectations: affectations });
    if (error) return r(messageReglages(error.hint, error.message));
    const n = Number(data ?? 0);
    return r(n ? `${n} gouvernorat${n > 1 ? "s" : ""} rattaché${n > 1 ? "s" : ""} à ${n > 1 ? "leur" : "sa"} nouvelle zone.` : "Rien n'a changé.", true);
  }

  // Une section de réglages : seuls ses champs, seuls ceux d'un module actif.
  const r = retour(`t-${section}`);
  const { data: etat } = await sb.rpc("gestion_reglages", { p_boutique_id: b });
  const actifs = new Map(((etat as EtatReglages | null)?.reglages ?? []).map((x) => [x.cle, x.module_actif && x.modifiable]));
  const valeurs = valeursDe(section, f, (cle) => actifs.get(cle) === true);
  if (typeof valeurs === "string") return r(valeurs);
  const { data, error } = await sb.rpc("gestion_enregistrer_reglages", { p_boutique_id: b, p_valeurs: valeurs });
  if (error) return r(messageReglages(error.hint, error.message));
  return r(Number(data) ? "Réglages enregistrés. La boutique en tient compte dans les cinq minutes." : "Rien n'a changé.", true);
}
