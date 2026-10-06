import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";
import type { CourrielsBoutique } from "@/lib/console/courriels";
import { ajouterDomaine, fournisseurCourant, verifierDomaine } from "@/lib/courriels/domaines";

/* Le domaine d'envoi d'une boutique : l'ajouter chez le fournisseur (qui
   répond par les enregistrements DNS), le vérifier, l'allumer, le couper,
   le retirer. Le fournisseur s'appelle d'ici (sa clé est un secret du
   Worker) ; la base garde ce qu'il répond, refuse d'allumer un domaine
   non vérifié et trace (public.console_*_domaine_envoi). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}/courriels`;
  const dire = (m: { ok: string } | { erreur: string }) => versCarte(retour, "domaine", m);
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const service = clientService(ip);
    const boutiqueId = String(formulaire.get("boutique_id") ?? "");
    const geste = String(formulaire.get("geste") ?? "");

    if (geste === "ajouter") {
      const domaine = String(formulaire.get("domaine") ?? "").trim().toLowerCase()
        .replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0].replace(/\.$/, "");
      const locale = String(formulaire.get("adresse_locale") ?? "").trim().toLowerCase() || "commandes";
      if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domaine)) return dire({ erreur: "Domaine illisible : écrivez par exemple maymar.tn." });
      if (!/^[a-z0-9]([a-z0-9._-]{0,38}[a-z0-9])?$/.test(locale)) {
        return dire({ erreur: "L'adresse avant l'arobase : des lettres, des chiffres, un point ou un tiret (par exemple commandes)." });
      }
      const r = await ajouterDomaine(domaine);
      if (!r.ok) return dire({ erreur: r.raison });
      const { error } = await service.rpc("console_poser_domaine_envoi", {
        p_acteur: user.id, p_boutique_id: boutiqueId, p_domaine: domaine, p_adresse_locale: locale,
        p_fournisseur: fournisseurCourant().fournisseur, p_ref: r.valeur.ref, p_statut: r.valeur.statut, p_enregistrements: r.valeur.enregistrements,
      });
      if (error) return dire({ erreur: messageBase(error) });
      return dire({ ok: `${domaine} ajouté : posez ses ${r.valeur.enregistrements.filter((e) => !e.conseille).length} enregistrements DNS ci-dessous, puis « Vérifier maintenant ».` });
    }

    if (geste === "verifier") {
      const { data } = await service.rpc("console_courriels_boutique", { p_acteur: user.id, p_boutique_id: boutiqueId });
      const b = data as CourrielsBoutique | null;
      if (!b?.domaine) return dire({ erreur: "Aucun domaine à vérifier." });
      const r = await verifierDomaine(b.ref_fournisseur, b.domaine);
      if (!r.ok) return dire({ erreur: r.raison });
      const { data: v, error } = await service.rpc("console_noter_verification_domaine", {
        p_acteur: user.id, p_boutique_id: boutiqueId, p_statut: r.valeur.statut, p_enregistrements: r.valeur.enregistrements,
      });
      if (error) return dire({ erreur: messageBase(error) });
      const n = v as { statut: string; coupe: boolean };
      const manquent = r.valeur.enregistrements.filter((e) => !e.conseille && e.etat !== "ok" && !e.vu).length;
      if (n.statut === "verifie") return dire({ ok: b.domaine_actif ? `${b.domaine} est toujours vérifié.` : `${b.domaine} est vérifié : vous pouvez l'allumer.` });
      if (n.coupe) return dire({ erreur: `${b.domaine} n'est plus vérifié : coupé, les e-mails repartent de SkanEcom.` });
      if (n.statut === "echec") return dire({ erreur: `Le fournisseur refuse ${b.domaine} : vérifiez les enregistrements, puis recommencez.` });
      return dire({ ok: `Pas encore vérifié${manquent ? ` : ${manquent} enregistrement${manquent > 1 ? "s" : ""} pas encore vu${manquent > 1 ? "s" : ""}` : ""}. Le DNS peut prendre jusqu'à 48 heures.` });
    }

    if (geste === "allumer" || geste === "couper") {
      const { data, error } = await service.rpc("console_activer_domaine_envoi", { p_acteur: user.id, p_boutique_id: boutiqueId, p_actif: geste === "allumer" });
      if (error) return dire({ erreur: messageBase(error) });
      if (data === false) return dire({ ok: "Rien n'a changé." });
      return dire({ ok: geste === "allumer" ? "Allumé : ses e-mails partent maintenant de son domaine." : "Coupé : ses e-mails repartent de l'adresse de SkanEcom." });
    }

    if (geste === "retirer") {
      const { data, error } = await service.rpc("console_retirer_domaine_envoi", { p_acteur: user.id, p_boutique_id: boutiqueId });
      if (error) return dire({ erreur: messageBase(error) });
      return dire({ ok: data ? `${data} retiré : ses e-mails repartent de l'adresse de SkanEcom.` : "Rien à retirer." });
    }
    return dire({ erreur: "Geste inconnu." });
  });
}
