import { STRUCTURES } from "@/lib/theme";
import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { messageMetier } from "@/lib/console/metiers";
import { acheterDomaine, adresseProvisoire, brancherDomaine, hotePlateforme, verifierAchat } from "@/lib/console/domaines-cloudflare";

const NOM_DOMAINE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip, roleAdmin }) => {
    const valeurs = {
      nom: String(formulaire.get("nom") ?? "").trim(),
      slug: String(formulaire.get("slug") ?? "").trim().toLowerCase(),
      hote: String(formulaire.get("hote") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
      theme: (STRUCTURES as string[]).includes(String(formulaire.get("theme"))) ? String(formulaire.get("theme")) : "editorial",
      metier: String(formulaire.get("metier") ?? "").trim(),
      demonstration: formulaire.get("demonstration") === "1" ? "1" : "",
      formule: String(formulaire.get("formule") ?? "").trim(),
      modele: String(formulaire.get("modele") ?? "").trim(),
      contact_nom: String(formulaire.get("contact_nom") ?? "").trim().slice(0, 120),
      contact_telephone: String(formulaire.get("contact_telephone") ?? "").trim().slice(0, 20),
      prospect: /^[0-9a-f-]{36}$/.test(String(formulaire.get("prospect") ?? "")) ? String(formulaire.get("prospect")) : "",
      domaine_mode: ["sien", "provisoire", "acheter"].includes(String(formulaire.get("domaine_mode"))) ? String(formulaire.get("domaine_mode")) : "sien",
      achat: String(formulaire.get("achat") ?? "").trim().toLowerCase(),
    };
    // Un refus qui tient au domaine ramène à son étape, la saisie gardée.
    const auDomaine = (message: string) => versAvecErreur("/nouvelle-boutique", message, { ...valeurs, etape: "domaine" });
    // Le domaine : le sien, l'adresse provisoire de la plateforme, ou un achat.
    let hote = valeurs.hote;
    let type: "personnalise" | "sous_domaine" = "personnalise";
    if (valeurs.domaine_mode === "provisoire") {
      const a = adresseProvisoire(valeurs.slug);
      if (!a) return auDomaine("Aucune adresse provisoire n'est réglée sur la plateforme : donnez son domaine.");
      hote = a;
      type = "sous_domaine";
    }
    if (valeurs.domaine_mode === "acheter") {
      if (roleAdmin !== "super_admin") return auDomaine("Un achat de domaine est réservé au super-administrateur.");
      if (!NOM_DOMAINE.test(valeurs.achat)) return auDomaine("Le domaine à acheter est illisible.");
      if (formulaire.get("achat_confirme") !== "1") return auDomaine(`Confirmez l'achat de ${valeurs.achat}, avec son prix.`);
      // Juste avant : toujours libre, au prix confirmé.
      const v = await verifierAchat([valeurs.achat]);
      const d = v.ok ? v.valeur[0] : null;
      if (!v.ok) return auDomaine(`La vérification de ${valeurs.achat} n'a pas abouti : ${v.raison}. Rien n'est acheté.`);
      if (!d?.achetable) return auDomaine(`${valeurs.achat} : ${d?.raison ?? "pas à vendre"}. Rien n'est acheté.`);
      const prix = `${d.prix ?? ""} ${d.devise ?? ""}`.trim();
      if (prix !== String(formulaire.get("achat_prix") ?? "").trim()) {
        return auDomaine(`Le prix de ${valeurs.achat} a changé (${prix} au lieu de ${formulaire.get("achat_prix")}) : vérifiez-le de nouveau. Rien n'est acheté.`);
      }
      hote = valeurs.achat;
    }
    const service = clientService(ip);
    const { data: id, error } = await service.rpc("console_creer_boutique", {
      p_acteur: user.id,
      p_slug: valeurs.slug,
      p_nom: valeurs.nom,
      p_hote: hote,
      p_theme: valeurs.theme,
      p_type: type,
    });
    if (error) return error.hint === "hote" ? auDomaine(messageBase(error)) : versAvecErreur("/nouvelle-boutique", messageBase(error), valeurs);
    // L'achat, une fois la boutique créée (un identifiant pris n'achète rien) ;
    // puis le branchement chez Cloudflare. Un échec ne défait pas la boutique : sa fiche le dit.
    if (valeurs.domaine_mode === "acheter") {
      const a = await acheterDomaine(hote);
      if (!a.ok) {
        return vers(`/boutiques/${valeurs.slug}?${new URLSearchParams({ erreur: `Boutique créée ; l'achat de ${hote} n'a pas abouti : ${a.raison}. Le domaine reste noté : achetez-le ou retirez-le.`, carte: "domaines" })}#t-domaines`);
      }
      const { error: en } = await service.rpc("console_noter_achat", { p_acteur: user.id, p_boutique_id: id as string, p_nom: hote, p_prix: String(formulaire.get("achat_prix") ?? "") });
      if (en) {
        return vers(`/boutiques/${valeurs.slug}?${new URLSearchParams({ erreur: `Boutique créée et ${hote} acheté ; l'achat n'a pas pu être noté au journal : ${messageBase(en)}`, carte: "domaines" })}#t-domaines`);
      }
    }
    if (type === "personnalise" && !hotePlateforme(hote)) {
      const b = await brancherDomaine(hote);
      if (b.ok) await service.rpc("console_noter_branchement", { p_acteur: user.id, p_hote: hote, p_branchement: b.valeur });
    }
    // La personne à appeler, notée dès la création : la carte « Le client » de sa fiche.
    if (valeurs.contact_nom || valeurs.contact_telephone) {
      const { error: ec } = await service.rpc("console_enregistrer_contact", {
        p_acteur: user.id, p_boutique_id: id as string, p_contact: { nom: valeurs.contact_nom, telephone: valeurs.contact_telephone },
      });
      if (ec) {
        return vers(`/boutiques/${valeurs.slug}?${new URLSearchParams({ erreur: `Boutique créée ; la personne à appeler n'a pas été notée : ${ec.message}`, carte: "client" })}#t-client`);
      }
    }
    // Créée pour un prospect : il passe « gagné », sa boutique rattachée (un échec ne défait pas la création).
    if (valeurs.prospect) {
      await service.rpc("console_lier_prospect", { p_acteur: user.id, p_id: valeurs.prospect, p_boutique_id: id as string });
    }
    // La formule vendue : avant le métier, qui pose des réglages (éteints, à la lecture, s'ils sont hors formule).
    if (valeurs.formule) {
      const { error: ef } = await service.rpc("console_changer_formule", { p_acteur: user.id, p_boutique_id: id as string, p_formule: valeurs.formule });
      if (ef) return versAvecErreur(`/boutiques/${valeurs.slug}`, messageBase(ef));
    }
    if (valeurs.demonstration) {
      const { error: ed } = await service.rpc("console_marquer_demonstration", { p_acteur: user.id, p_boutique_id: id as string, p_demonstration: true });
      if (ed) return versAvecErreur(`/boutiques/${valeurs.slug}`, messageBase(ed));
    }
    // Les modules cochés : activés tout de suite ; hors de sa formule, ils lui sont d'abord ouverts (un écart tracé).
    for (const code of formulaire.getAll("module").map(String).filter((m) => /^[a-z_]{2,40}$/.test(m))) {
      await service.rpc("console_ouvrir_droit", { p_acteur: user.id, p_boutique_id: id as string, p_droit: `module.${code}`, p_ouvert: true });
      const { error: emod } = await service.rpc("console_changer_module", { p_acteur: user.id, p_boutique_id: id as string, p_module: code, p_actif: true });
      if (emod) return versAvecErreur(`/boutiques/${valeurs.slug}/modules`, `Boutique créée ; un module n'a pas pu s'activer : ${messageBase(emod)}`);
    }
    // À partir d'une boutique : sa configuration (apparence, réglages,
    // livraison, rayons), à la place du métier.
    if (valeurs.modele) {
      const { data: source } = await service.rpc("console_boutique", { p_slug: valeurs.modele });
      const sourceId = (source as { boutique?: { id: string; nom: string } } | null)?.boutique?.id;
      const sourceNom = (source as { boutique?: { nom: string } } | null)?.boutique?.nom ?? valeurs.modele;
      if (!sourceId) return versAvecErreur(`/boutiques/${valeurs.slug}`, "La boutique modèle est introuvable : la nouvelle est créée, vide.");
      const { error: ec } = await service.rpc("console_cloner_configuration", { p_acteur: user.id, p_source: sourceId, p_cible: id as string });
      if (ec) return versAvecErreur(`/boutiques/${valeurs.slug}`, messageBase(ec));
      return vers(`/boutiques/${valeurs.slug}?${new URLSearchParams({ cree: "1", modele: sourceNom })}`);
    }
    // Le métier : ses rayons, ses caractéristiques, sa palette (le gabarit
    // aussi). La boutique, vide, l'accepte toujours ; un refus est dit sur sa fiche.
    if (valeurs.metier) {
      const { error: em } = await service.rpc("console_appliquer_metier", { p_acteur: user.id, p_boutique_id: id as string, p_metier: valeurs.metier });
      if (em) return versAvecErreur(`/boutiques/${valeurs.slug}`, messageMetier(em.hint, em.message));
      return vers(`/boutiques/${valeurs.slug}?cree=1&metier=1`);
    }
    return vers(`/boutiques/${valeurs.slug}?cree=1`);
  });
}
