import { acces } from "@/lib/console/session";
import { clientService } from "@/lib/console/service";
import { ipDe, vers } from "@/lib/console/http";
import { LIBELLES_STATUT } from "@/lib/console/libelles";
import { tableurCsv } from "@/lib/gestion/export";
import { formateMontant } from "@/lib/prix";
import { SANS_FORMULE } from "@/lib/console/formules";
import { filtreBoutiques, lisFiltres, trieBoutiques } from "@/lib/console/accueil";
import { chargeAccueil } from "@/lib/console/accueil-serveur";
import { titreEtape } from "@/lib/console/pilotage";

/* ============================================================================
   EXPORTER LA LISTE DES BOUTIQUES — /export/boutiques?<les filtres de
   l'accueil> : ce que montre l'accueil, dans son ordre, une ligne par
   boutique. L'export se trace.
   ========================================================================== */

export const dynamic = "force-dynamic";

const jour = (iso: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Tunis" }).format(new Date(iso));

export async function GET(req: Request) {
  const a = await acces();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aal1") return vers("/double-authentification");
  if (a.etat !== "ok") return vers("/refuse");

  const { boutiques, formules, signaux } = await chargeAccueil(a.user.id);
  const f = lisFiltres(Object.fromEntries(new URL(req.url).searchParams), formules.formules.map((x) => x.code));
  const noms = new Map(formules.formules.map((x) => [x.code, x.nom]));
  const codeFormuleDe = new Map(formules.boutiques.map((x) => [x.id, x.formule]));
  const lignes = trieBoutiques(filtreBoutiques(boutiques, f, codeFormuleDe), f.tri, signaux);
  const filtres = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  await clientService(ipDe(req)).rpc("console_tracer_export", { p_acteur: a.user.id, p_quoi: "boutiques", p_filtres: filtres });

  const csv = tableurCsv(
    ["Boutique", "Identifiant", "Domaine", "Statut", "Démonstration", "Formule", "Créée le", "Mise en place", "Prochaine étape",
     "À confirmer", "Commandes 7 jours", "Encaissé 7 jours (TND)", "Produits", "En vitrine", "Équipe"],
    lignes.map((b) => {
      const code = codeFormuleDe.get(b.id);
      return [
        b.nom, b.slug, b.hote ?? "", LIBELLES_STATUT[b.statut] ?? b.statut, b.demonstration ? "oui" : "non",
        code ? noms.get(code) ?? code : SANS_FORMULE, jour(b.creee_le),
        `${b.mise_en_place.faites}/${b.mise_en_place.total}`, titreEtape(b.mise_en_place.prochaine) ?? "",
        String(b.commandes.a_confirmer), String(b.commandes.semaine), formateMontant(b.commandes.encaisse_semaine),
        String(b.produits), String(b.publies), String(b.equipe),
      ];
    }),
  );
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date());
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="skanecom-boutiques-${date}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
