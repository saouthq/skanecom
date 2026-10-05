import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers } from "@/lib/console/http";

/* « À surveiller » : mettre un signal à plus tard (jusqu'à demain, ou pour
   une semaine), ou le reprendre. Pour toute l'équipe SkanEcom ; le journal
   le garde. On revient à l'accueil tel qu'il était (ses filtres). */
const JOUR = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" });

export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const brut = String(formulaire.get("retour") ?? "/");
    const retour = /^\/(\?[^#]*)?$/.test(brut) ? brut : "/";
    const aller = (m: { ok: string } | { erreur: string }) => {
      const u = new URL(retour, "http://x");
      for (const k of ["ok", "erreur", "carte", "ancre"]) u.searchParams.delete(k);
      for (const [k, v] of Object.entries({ ...m, carte: "vigilance", ancre: "t-vigilance" })) u.searchParams.set(k, v);
      return vers(`/${u.search}#t-vigilance`);
    };
    const cle = String(formulaire.get("cle") ?? "");
    const service = clientService(ip);
    if (formulaire.get("geste") === "reprendre") {
      const { error } = await service.rpc("console_reprendre_vigilance", { p_acteur: user.id, p_cle: cle });
      return aller(error ? { erreur: messageBase(error) } : { ok: "Le signal est de retour dans « À surveiller »." });
    }
    const jours = Number(formulaire.get("jours") ?? 0);
    const { data, error } = await service.rpc("console_reporter_vigilance", {
      p_acteur: user.id, p_cle: cle, p_niveau: String(formulaire.get("niveau") ?? ""), p_jours: jours,
    });
    if (error) return aller({ erreur: messageBase(error) });
    return aller({ ok: `Mis à plus tard : il reviendra ${JOUR.format(new Date(String(data)))}, ou plus tôt s'il s'aggrave.` });
  });
}
