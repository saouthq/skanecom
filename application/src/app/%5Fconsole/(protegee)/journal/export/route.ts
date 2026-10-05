import { acces } from "@/lib/console/session";
import { clientService } from "@/lib/console/service";
import { ipDe, vers } from "@/lib/console/http";
import { dateJournal } from "@/lib/console/libelles";
import { ACTIONS, GENRES_JOURNAL, jourValide, libelleSignal, CANAL_JOURNAL, cibleLisible, estGesteEnvois } from "@/lib/console/journal";
import { tableurCsv } from "@/lib/gestion/export";
import { SANS_FORMULE, type DonneesFormules } from "@/lib/console/formules";

/* ============================================================================
   EXPORTER LE JOURNAL — /journal/export?boutique=&genre=&du=&au=, les mêmes
   filtres que l'écran, 5 000 gestes au plus (les plus récents). L'export se
   trace lui-même. Jamais en cache : des adresses et des IP.
   ========================================================================== */

export const dynamic = "force-dynamic";

const MAXIMUM = 5000;

type LigneJournal = {
  id: number; at: string; action: string; cible: string | null; ip: string | null; acteur: string | null;
  boutique: { slug: string; nom: string } | null;
};

export async function GET(req: Request) {
  const a = await acces();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aal1") return vers("/double-authentification");
  if (a.etat !== "ok") return vers("/refuse");

  const q = new URL(req.url).searchParams;
  const service = clientService(ipDe(req));
  const { data: df } = await service.rpc("console_formules", { p_acteur: a.user.id });
  const donnees = (df ?? { boutiques: [], formules: [] }) as DonneesFormules;
  const choisie = donnees.boutiques.find((b) => b.slug === q.get("boutique")) ?? null;
  const genre = GENRES_JOURNAL.find((g) => g.cle === q.get("genre")) ?? null;
  let du = jourValide(q.get("du"));
  let au = jourValide(q.get("au"));
  if (du && au && du > au) [du, au] = [au, du];

  const { data, error } = await service.rpc("console_journal", {
    p_acteur: a.user.id, p_boutique_id: choisie?.id ?? null, p_genre: genre?.cle ?? null,
    p_limite: MAXIMUM, p_decalage: 0, p_du: du, p_au: au,
  });
  if (error) return new Response(`Journal illisible : ${error.message}`, { status: 500 });
  const j = data as { total: number; lignes: LigneJournal[] };

  const filtres = Object.fromEntries(Object.entries({ boutique: choisie?.slug, genre: genre?.cle, du, au }).filter(([, v]) => v));
  await service.rpc("console_tracer_export", { p_acteur: a.user.id, p_quoi: "journal", p_filtres: { ...filtres, lignes: j.lignes.length } });

  const noms = new Map(donnees.formules.map((f) => [f.code, f.nom]));
  const { data: dm } = await service.rpc("console_metiers", { p_acteur: a.user.id });
  const nomsMetiers = new Map(((dm ?? []) as { code: string; nom: string }[]).map((m) => [m.code, m.nom]));
  const detail = (x: LigneJournal) =>
    x.action.startsWith("note.") || x.action.startsWith("annonce.") ? ""
    : x.action === "boutique.formule" ? (x.cible ? noms.get(x.cible) ?? x.cible : SANS_FORMULE)
    : x.action.startsWith("vigilance.") ? libelleSignal(x.cible)
    : x.action === "boutique.metier" && x.cible ? nomsMetiers.get(x.cible) ?? x.cible
    : estGesteEnvois(x.action) && x.cible ? CANAL_JOURNAL[x.cible] ?? x.cible
    : x.action === "formule.quotas" && x.cible ? noms.get(x.cible) ?? x.cible
    : cibleLisible(x.cible);
  const csv = tableurCsv(
    ["Quand", "Geste", "Boutique", "Détail", "Par", "IP"],
    j.lignes.map((x) => [dateJournal(x.at), ACTIONS[x.action] ?? x.action, x.boutique?.nom ?? "Plateforme", detail(x), x.acteur ?? "", x.ip ?? ""]),
  );
  const jour = new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Tunis" }).format(new Date());
  const nom = ["journal", choisie?.slug, genre?.cle, du && `du-${du}`, au && `au-${au}`].filter(Boolean).join("-");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="skanecom-${nom}-${jour}.csv"`,
      "cache-control": "private, no-store",
      // Combien le journal en avait : au-delà de 5 000, le fichier s'arrête aux plus récents.
      "x-total": String(j.total),
    },
  });
}
