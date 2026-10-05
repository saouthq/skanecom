import { acces } from "@/lib/console/session";
import { clientService } from "@/lib/console/service";
import { ipDe, vers } from "@/lib/console/http";
import { LIBELLES_STATUT } from "@/lib/console/libelles";
import { tableurCsv } from "@/lib/gestion/export";
import { formateMontant } from "@/lib/prix";
import { SANS_FORMULE, type DonneesFormules } from "@/lib/console/formules";

/* ============================================================================
   EXPORTER LE TABLEAU DE BORD — /tableau/export?jours=30[&demos=1] : une
   ligne par boutique sur la période, les chiffres de l'écran et ceux de la
   période d'avant. L'export se trace.
   ========================================================================== */

export const dynamic = "force-dynamic";

const PERIODES = [7, 30, 90];
/** « 2026-09-06 » → « 06/09/2026 », comme les autres exports. */
const jour = (iso: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

type LigneTableau = {
  id: string; slug: string; nom: string; statut: string; demonstration: boolean; formule: string | null;
  recues: number; livrees: number; refusees: number; chiffre: number;
  precedent: { recues: number; chiffre: number };
};

export async function GET(req: Request) {
  const a = await acces();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aal1") return vers("/double-authentification");
  if (a.etat !== "ok") return vers("/refuse");

  const q = new URL(req.url).searchParams;
  const jours = PERIODES.find((j) => String(j) === q.get("jours")) ?? 30;
  const avecDemos = q.get("demos") === "1";
  const service = clientService(ipDe(req));
  const [{ data, error }, { data: df }] = await Promise.all([
    service.rpc("console_tableau", { p_acteur: a.user.id, p_jours: jours }),
    service.rpc("console_formules", { p_acteur: a.user.id }),
  ]);
  if (error) return new Response(`Tableau illisible : ${error.message}`, { status: 500 });
  const t = data as { du: string; au: string; boutiques: LigneTableau[] };
  const noms = new Map(((df ?? { formules: [] }) as DonneesFormules).formules.map((f) => [f.code, f.nom]));
  const lignes = avecDemos ? t.boutiques : t.boutiques.filter((b) => !b.demonstration);
  await service.rpc("console_tracer_export", { p_acteur: a.user.id, p_quoi: "tableau", p_filtres: { jours, ...(avecDemos ? { demos: true } : {}) } });

  const pct = (n: number | null) => (n === null ? "" : `${Math.round(n * 100)} %`);
  const csv = tableurCsv(
    ["Boutique", "Adresse", "Statut", "Formule", "Démonstration", "Du", "Au", "Reçues", "Livrées", "Refusées", "Taux de refus",
     "Chiffre livré (TND)", "Panier moyen (TND)", "Reçues avant", "Chiffre avant (TND)"],
    lignes.map((b) => [
      b.nom, b.slug, LIBELLES_STATUT[b.statut] ?? b.statut, b.formule ? noms.get(b.formule) ?? b.formule : SANS_FORMULE,
      b.demonstration ? "oui" : "non", jour(t.du), jour(t.au),
      String(b.recues), String(b.livrees), String(b.refusees),
      pct(b.refusees + b.livrees > 0 ? b.refusees / (b.refusees + b.livrees) : null),
      formateMontant(b.chiffre), b.livrees ? formateMontant(Math.round(b.chiffre / b.livrees)) : "",
      String(b.precedent.recues), formateMontant(b.precedent.chiffre),
    ]),
  );
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="skanecom-tableau-${jours}-jours-${t.au}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
