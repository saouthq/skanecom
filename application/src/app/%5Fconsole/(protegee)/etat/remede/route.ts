import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers } from "@/lib/console/http";
import { rafraichirVitrine } from "@/lib/console/vitrine-cache";
import { envoyerCourrielsCommandes } from "@/lib/courriels/commandes";
import { envoyerFile } from "@/lib/gestion/skanfact";
import { oublierMaintenance } from "@/lib/maintenance";

/* Les gestes du dépannage (État technique → Dépannage, ou la fiche d'une
   boutique), chacun au journal :
   - « maintenance » / « rouvrir » : la page d'attente, pour une boutique ou
     (sans boutique) toute la plateforme (super-administrateur) ;
   - « cache » : toutes les pages de la vitrine se rendent de nouveau ;
   - « courriels » / « skanfact » : la file coincée d'une boutique remise à
     partir (super-administrateur), puis envoyée tout de suite. */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    // La boutique : « <id>:<adresse> » (l'adresse sert au cache de sa vitrine) ; vide : la plateforme.
    const [boutique = "", slug = ""] = String(formulaire.get("boutique") ?? "").trim().split(":");
    const geste = String(formulaire.get("geste") ?? "");
    const fiche = formulaire.get("retour") === "fiche" && slug;
    const retour = (m: Record<string, string>) => vers(fiche
      ? `/boutiques/${slug}?${new URLSearchParams({ ...m, carte: "depannage" })}#t-depannage`
      : `/etat?${new URLSearchParams({ ...m, carte: "depannage", ...(slug ? { boutique: slug } : {}) })}#t-depannage`);
    const service = clientService(ip);

    if (geste === "maintenance" || geste === "rouvrir") {
      const actif = geste === "maintenance";
      const { error } = await service.rpc("console_regler_maintenance", {
        p_acteur: user.id, p_boutique_id: boutique || null, p_actif: actif, p_message: String(formulaire.get("message") ?? ""),
      });
      if (error) return retour({ erreur: messageBase(error) });
      oublierMaintenance();
      return retour({
        ok: boutique
          ? actif ? "Vitrine en maintenance : ses clients voient la page d'attente (dans les vingt secondes). Son backoffice reste ouvert." : "Vitrine rouverte : elle sert de nouveau ses pages."
          : actif ? "Toute la plateforme est en maintenance : chaque vitrine montre la page d'attente. Les backoffices et la console restent ouverts." : "Plateforme rouverte : toutes les vitrines servent de nouveau leurs pages.",
      });
    }
    if (!boutique) return retour({ erreur: "Choisissez d'abord la boutique." });
    if (geste === "cache") {
      // La base dit l'adresse de la boutique (pas le formulaire) : c'est elle dont le cache se vide.
      const { data, error } = await service.rpc("console_tracer_cache", { p_acteur: user.id, p_boutique_id: boutique });
      if (error) return retour({ erreur: messageBase(error) });
      rafraichirVitrine(String(data));
      return retour({ ok: "Cache vidé : chaque page de la vitrine se rend de nouveau à sa prochaine visite." });
    }
    if (geste === "courriels" || geste === "skanfact") {
      const { data, error } = await service.rpc("console_relancer_file", { p_acteur: user.id, p_boutique_id: boutique, p_file: geste });
      if (error) return retour({ erreur: messageBase(error) });
      const { n, ids } = (data ?? { n: 0, ids: [] }) as { n: number; ids: number[] };
      if (!n) return retour({ ok: geste === "courriels" ? "Aucun e-mail de commande coincé : rien à relancer." : "Aucun envoi à SkanFact coincé : rien à relancer." });
      if (geste === "courriels") {
        await envoyerCourrielsCommandes(boutique);
        // Ce qu'il est advenu de chacun : parti, sans adresse (le client n'en a pas), ou encore en file.
        const { data: etats } = await service.from("courriels_commandes").select("etat").in("id", ids);
        const compte = (etat: string) => ((etats ?? []) as { etat: string }[]).filter((x) => x.etat === etat).length;
        const [partis, sansAdresse] = [compte("fait"), compte("sans_adresse")];
        const reste = n - partis - sansAdresse;
        const morceaux = [
          `${partis} parti${partis > 1 ? "s" : ""} à l'instant`,
          sansAdresse ? `${sansAdresse} sans adresse (personne à qui l'écrire)` : null,
          reste ? `${reste} encore en file, retenté${reste > 1 ? "s" : ""} au prochain passage` : null,
        ].filter(Boolean);
        return retour({ ok: `${n} e-mail${n > 1 ? "s" : ""} de commande relancé${n > 1 ? "s" : ""} : ${morceaux.join(", ")}.` });
      }
      const bilan = await envoyerFile(boutique, { max: 20, budgetMs: 8000 });
      return retour({ ok: `${n} envoi${n > 1 ? "s" : ""} relancé${n > 1 ? "s" : ""} : ${bilan.faits} arrivé${bilan.faits > 1 ? "s" : ""} dans SkanFact${bilan.refuses ? `, ${bilan.refuses} refusé${bilan.refuses > 1 ? "s" : ""}` : ""}${bilan.plus_tard ? `, ${bilan.plus_tard} pour plus tard` : ""}.` });
    }
    return retour({ erreur: "Geste inconnu." });
  });
}
