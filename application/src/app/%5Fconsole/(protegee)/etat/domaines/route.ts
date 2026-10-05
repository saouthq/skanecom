import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, versCarte } from "@/lib/console/http";
import { hoteLocal, verifierCertificat, type DonneesEtat } from "@/lib/console/etat";

/* Vérifier les certificats de tous les domaines en ligne (pas ceux en
   « .localhost ») : une requête HTTPS chacun, en même temps, 8 s au plus.
   Le résultat est noté sur chaque domaine, et tracé une fois au journal. */
export async function POST(req: Request) {
  return ecriture(req, async ({ user, ip }) => {
    const service = clientService(ip);
    const { data, error } = await service.rpc("console_etat_technique", { p_acteur: user.id });
    if (error) return versCarte("/etat", "domaines", { erreur: messageBase(error) });
    const hotes = (data as DonneesEtat).domaines.map((d) => d.hote).filter((h) => !hoteLocal(h)).slice(0, 50);
    if (hotes.length === 0) return versCarte("/etat", "domaines", { erreur: "Aucun domaine en ligne à vérifier." });
    const resultats = await Promise.all(hotes.map(verifierCertificat));
    const { error: e2 } = await service.rpc("console_noter_certificats", { p_acteur: user.id, p_resultats: resultats });
    if (e2) return versCarte("/etat", "domaines", { erreur: messageBase(e2) });
    const enErreur = resultats.filter((r) => r.statut === "erreur").length;
    const n = resultats.length;
    // Un domaine en erreur se dit en rouge : la vérification a marché, la vitrine, non.
    return versCarte("/etat", "domaines", enErreur === 0
      ? { ok: `${n > 1 ? `Les ${n} domaines ont` : "Le domaine a"} un certificat valable.` }
      : { erreur: `${n} domaine${n > 1 ? "s" : ""} vérifié${n > 1 ? "s" : ""} : ${enErreur} sans certificat valable (la raison sous chacun).` });
  });
}
