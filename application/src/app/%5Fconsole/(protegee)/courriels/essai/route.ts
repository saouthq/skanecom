import { clientService } from "@/lib/console/service";
import { ecriture, versCarte } from "@/lib/console/http";
import type { CourrielsBoutique } from "@/lib/console/courriels";
import { envoyer } from "@/lib/courriels/envoi";
import { fournisseurCourant } from "@/lib/courriels/domaines";
import { courrielDEssai, MODELES_ESSAI, type ModeleEssai } from "@/lib/courriels/essai";

/* L'e-mail d'essai, depuis la page E-mails → Envoi ou l'onglet E-mails
   d'une boutique : un vrai envoi, par le même chemin que les autres (nom
   affiché, réponses, domaine de la boutique s'il est allumé), noté au
   journal des envois et compté à SkanEcom (nature « essai »). */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const retourBrut = String(formulaire.get("retour") ?? "");
    const retour = /^[a-z0-9-]{1,63}$/.test(retourBrut) && retourBrut !== "envoi" ? `/boutiques/${retourBrut}/courriels` : "/courriels/envoi";
    const dire = (m: { ok: string } | { erreur: string }) => versCarte(retour, "essai", m);
    const a = String(formulaire.get("a") ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(a)) return dire({ erreur: "Adresse illisible : écrivez par exemple vous@exemple.tn." });
    const modele = (MODELES_ESSAI.find((x) => x.cle === formulaire.get("modele"))?.cle ?? "code") as ModeleEssai;
    const boutiqueId = String(formulaire.get("boutique_id") ?? "");
    let boutique: CourrielsBoutique | null = null;
    if (boutiqueId) {
      const { data, error } = await clientService(ip).rpc("console_courriels_boutique", { p_acteur: user.id, p_boutique_id: boutiqueId });
      if (error || !data) return dire({ erreur: "Boutique introuvable." });
      boutique = data as CourrielsBoutique;
    }
    const e = await courrielDEssai(modele, boutique ? { slug: boutique.slug, nom: boutique.nom, hote: boutique.hote_principal } : null);
    const r = await envoyer({ a, nom: e.nom, ...e.courriel, boutique: e.auNomDeLaBoutique ? boutique?.id : null, nature: "essai" });
    if (!r.ok) return dire({ erreur: `L'essai n'est pas parti : ${r.raison}` });
    const { fournisseur } = fournisseurCourant();
    const ou = fournisseur === "apercu" ? " L'aperçu en ligne n'envoie rien : il est gardé, lisible dans Journal → Envois."
      : fournisseur === "relais" ? " En local, le relais le garde (.outils/emails.log)."
      : " Regardez aussi le dossier des indésirables.";
    return dire({ ok: `Essai envoyé à ${a}${r.note ? ` (${r.note})` : ""}.${ou}` });
  });
}
