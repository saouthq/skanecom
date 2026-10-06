import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";
import { brancherDomaine, etatDomaine, hotePlateforme, type Branchement } from "@/lib/console/domaines-cloudflare";

const ETATS: Record<Branchement["statut"], (hote: string) => string> = {
  actif: (h) => `${h} est branché : la vitrine s'ouvre à cette adresse, son certificat est émis.`,
  a_poser: (h) => `${h} n'est pas encore branché : ses enregistrements ne sont pas vus (le DNS peut prendre jusqu'à 48 heures).`,
  refuse: (h) => `${h} est refusé par Cloudflare`,
};

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const hote = String(formulaire.get("hote") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const geste = String(formulaire.get("geste") ?? "ajouter");
    const service = clientService(ip);
    const dire = (m: { ok: string } | { erreur: string }) => versCarte(`/boutiques/${slug}`, "domaines", m);
    if (geste === "principal" || geste === "retirer") {
      const { error } = await service.rpc(geste === "principal" ? "console_domaine_principal" : "console_retirer_domaine", {
        p_acteur: user.id,
        p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
        p_hote: hote,
      });
      if (error) return dire({ erreur: error.hint === "domaine" ? (error.message ?? "") : messageBase(error) });
      return dire({ ok: geste === "principal" ? `${hote} est maintenant le domaine principal : les liens et le référencement le prennent.` : `Domaine ${hote} retiré.` });
    }
    // Brancher chez Cloudflare (le nom personnalisé), ou relire où il en est.
    if (geste === "brancher" || geste === "relire") {
      const r = geste === "brancher" ? await brancherDomaine(hote) : await etatDomaine(hote);
      if (!r.ok) {
        return dire({ erreur: r.raison === "non_branche" ? "Le branchement chez Cloudflare n'est pas réglé (secret CLOUDFLARE_DOMAINES) : posez les enregistrements à la main." : `Cloudflare : ${r.raison}` });
      }
      if (!r.valeur) return dire({ erreur: `${hote} n'est pas branché chez Cloudflare : « Brancher » d'abord.` });
      const { error } = await service.rpc("console_noter_branchement", { p_acteur: user.id, p_hote: hote, p_branchement: r.valeur });
      if (error) return dire({ erreur: messageBase(error) });
      return r.valeur.statut === "actif" ? dire({ ok: ETATS.actif(hote) })
        : r.valeur.statut === "refuse" ? dire({ erreur: `${ETATS.refuse(hote)}${r.valeur.erreurs[0] ? ` — ${r.valeur.erreurs[0]}` : ""}.` })
        : dire({ ok: geste === "brancher" ? `${hote} branché chez Cloudflare : posez ses enregistrements chez le registrar, puis « Relire ».` : ETATS.a_poser(hote) });
    }
    const { error } = await service.rpc("console_ajouter_domaine", {
      p_acteur: user.id,
      p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
      p_hote: hote,
      p_principal: formulaire.get("principal") === "1",
    });
    if (error) return dire({ erreur: messageBase(error) });
    // Un domaine à lui : branché d'emblée chez Cloudflare (s'il est réglé), ses enregistrements dits.
    if (!hotePlateforme(hote)) {
      const b = await brancherDomaine(hote);
      if (b.ok) {
        await service.rpc("console_noter_branchement", { p_acteur: user.id, p_hote: hote, p_branchement: b.valeur });
        return dire({ ok: `Domaine ${hote} ajouté et branché chez Cloudflare : posez ses enregistrements chez le registrar, puis « Relire ».` });
      }
    }
    return dire({ ok: `Domaine ${hote} ajouté.` });
  });
}
