import { clientService } from "@/lib/console/service";
import { boutiqueDe } from "@/lib/console/equipe-serveur";
import {
  PERIODES, changerContrat, configSkanFact, contratsDuClient, creerContrat, jourLisible, montant, objetLisible, prixHT, type ContratSkanFact,
} from "@/lib/console/skanfact";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

/* L'ABONNEMENT D'UNE BOUTIQUE (brique 130 de SkanFact) — un contrat de
   « Facturation récurrente » au nom de son client SkanFact :
   · creer      : le contrat créé par l'API (objet, prix HT, TVA, période,
                  première facture, « Émise seule ») ;
   · reprendre-contrat : un contrat déjà fait à l'écran de SkanFact, suivi ;
   · suspendre, reprendre : comme le bouton de l'écran ;
   · oublier    : la console ne le suit plus (dans SkanFact, il continue).
   Le client vient du lien en base, jamais du formulaire ; la base revérifie
   l'administrateur et trace chaque geste. */

const PRIX = /^\d{1,9}(\.\d{1,3})?$/;
const TAUX = ["19", "13", "7", "0"];

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}/facturation`;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const boutique = await boutiqueDe(slug);
    if (!boutique) return vers("/");
    const config = configSkanFact();
    if (!config) return versAvecErreur(retour, "SkanFact n'est pas branché sur cette console.");
    const service = clientService(ip);
    const { data } = await service.rpc("console_facturation", { p_boutique_id: boutique.id });
    const lien = (data as { lien: { client: string; contrat: string | null } | null } | null)?.lien;
    if (!lien) return versAvecErreur(retour, "Reliez d'abord la boutique à son client SkanFact.");
    const geste = String(formulaire.get("geste") ?? "");
    const ok = (message: string) => vers(`${retour}?${new URLSearchParams({ ok: message })}#t-fa-abonnement`);
    const garder = async (contrat: string | null, objet: string | null) =>
      (await service.rpc("console_garder_contrat", { p_acteur: user.id, p_boutique_id: boutique.id, p_contrat: contrat, p_objet: objet })).error;

    if (geste === "creer") {
      const objet = String(formulaire.get("objet") ?? "").trim();
      const designation = String(formulaire.get("designation") ?? "").trim();
      const saisi = String(formulaire.get("prix") ?? "").trim().replace(",", ".").replace(/\s/g, "");
      const tva = String(formulaire.get("tva") ?? "");
      const periode = String(formulaire.get("periode") ?? "") as ContratSkanFact["periode"];
      const prochaine = String(formulaire.get("prochaine") ?? "");
      const emettreSeul = formulaire.get("emettre_seul") === "1";
      const valeurs = { objet, designation, prix: String(formulaire.get("prix") ?? ""), tva, periode, prochaine, emettre_seul: emettreSeul ? "1" : "0" };
      const refus = (m: string) => vers(`${retour}?${new URLSearchParams({ ...valeurs, erreur: m })}#t-fa-abonnement`);
      if (!objet || objet.length > 300) return refus("L'objet des factures est attendu (300 caractères au plus).");
      if (!designation || designation.length > 300) return refus("La désignation de la ligne est attendue.");
      if (!PRIX.test(saisi) || !/[1-9]/.test(saisi)) return refus("Le prix HT s'écrit en dinars, au millime au plus (par exemple 75 ou 75,500).");
      const prix = prixHT(saisi);
      if (!TAUX.includes(tva)) return refus("Choisissez le taux de TVA.");
      if (!(periode in PERIODES)) return refus("Choisissez la période.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(prochaine)) return refus("La date de la première facture est attendue.");
      const r = await creerContrat(config, {
        client: lien.client, objet, periode, prochaine, emettreSeul,
        lignes: [{ designation, quantite: "1", prixUnitaire: prix, tauxTva: tva }],
      });
      if (!r.ok) {
        return refus(r.statut === 0
          ? "SkanFact n'a pas répondu : vérifiez dans la liste ci-dessous si le contrat a été créé avant d'en refaire un."
          : `${r.raison}.`);
      }
      const e = await garder(r.donnees.id, objet);
      if (e) return refus(`Le contrat est créé dans SkanFact, mais la console n'a pas pu le garder : ${messageBase(e)}`);
      return ok(`Abonnement créé dans SkanFact : ${montant(prix)} HT ${PERIODES[periode]}, première facture le ${jourLisible(prochaine)}${emettreSeul ? ", émise par SkanFact" : ""}.`);
    }

    if (geste === "reprendre-contrat") {
      const contrat = String(formulaire.get("contrat") ?? "");
      const r = await contratsDuClient(config, lien.client);
      if (!r.ok) return versAvecErreur(retour, `${r.raison}.`);
      const k = r.donnees.find((x) => x.id === contrat);
      if (!k) return versAvecErreur(retour, "Ce contrat n'est pas un contrat de ce client dans SkanFact.");
      const e = await garder(k.id, k.objet);
      if (e) return versAvecErreur(retour, messageBase(e));
      return ok(`La console suit maintenant le contrat « ${objetLisible(k.objet)} ».`);
    }

    if (geste === "oublier") {
      const e = await garder(null, null);
      if (e) return versAvecErreur(retour, messageBase(e));
      return ok("La console ne suit plus ce contrat ; dans SkanFact, il continue tel quel.");
    }

    if (geste === "suspendre" || geste === "reprendre") {
      if (!lien.contrat) return versAvecErreur(retour, "La boutique n'a pas d'abonnement suivi.");
      const r = await changerContrat(config, lien.contrat, geste);
      if (!r.ok) return versAvecErreur(retour, r.statut === 404 ? "Ce contrat n'existe plus dans SkanFact." : `${r.raison}.`);
      await service.rpc("console_noter_abonnement", {
        p_acteur: user.id, p_boutique_id: boutique.id, p_geste: geste === "suspendre" ? "suspendu" : "repris", p_objet: r.donnees.objet,
      });
      return ok(geste === "suspendre"
        ? "Abonnement suspendu : SkanFact n'émet plus ses factures jusqu'à sa reprise."
        : `Abonnement repris : prochaine facture le ${jourLisible(r.donnees.prochaine)} (les échéances passées pendant la suspension ne sont pas facturées).`);
    }

    return versAvecErreur(retour, "Geste inconnu.");
  });
}
