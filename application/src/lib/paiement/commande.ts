import { clientService } from "@/lib/console/service";
import { dechiffrer } from "@/lib/gestion/chiffre";
import { lirePaiement, ouvrirPaiement, type ModeKonnect } from "./konnect";

/* Le paiement en ligne d'une commande, côté serveur : l'ouvrir chez Konnect
   juste après la commande (ou sur « Réessayer »), le relire quand Konnect
   prévient ou quand l'acheteur revient. La clé de la boutique se déchiffre
   ici, le temps d'un appel ; la base garde ce que Konnect a répondu
   (migration …_konnect). */

/** Le contexte du chiffrement : la clé d'une boutique ne se déchiffre pas pour une autre. */
export const contexteKonnect = (boutiqueId: string) => `konnect:${boutiqueId}`;

type Preparation = {
  commande_id: string; numero: string; total_millimes: number;
  contact: { nom: string; telephone: string; email: string | null };
  wallet_id: string; cle_chiffree: string; mode: ModeKonnect; cod_actif: boolean;
};

export type Ouvert = { ok: true; adresse: string } | { ok: false; raison: string; codPossible: boolean };

export async function ouvrirPourCommande(o: { boutiqueId: string; nomBoutique: string; numero: string; jeton: string; origine: string }): Promise<Ouvert> {
  const service = clientService();
  const { data } = await service.rpc("konnect_preparer", { p_boutique_id: o.boutiqueId, p_numero: o.numero, p_jeton: o.jeton });
  const d = data as Preparation | null;
  if (!d) return { ok: false, raison: "Cette commande ne se paie pas en ligne.", codPossible: true };
  const cle = await dechiffrer(d.cle_chiffree, contexteKonnect(o.boutiqueId));
  const r = cle
    ? await ouvrirPaiement({
        mode: d.mode, cle, wallet: d.wallet_id, montantMillimes: d.total_millimes, numero: d.numero,
        description: `Commande ${d.numero} — ${o.nomBoutique}`, contact: d.contact,
        webhook: `${o.origine}/paiement/konnect`, retour: `${o.origine}/commande/merci?paiement=retour`,
      })
    : { ok: false as const, raison: "La clé Konnect de la boutique est illisible." };
  if (!r.ok) {
    // Konnect ne répond pas : à la livraison si la boutique le prend (D14) ;
    // sinon la commande attend un nouvel essai de paiement.
    if (!d.cod_actif) await service.rpc("konnect_a_reessayer", { p_commande_id: d.commande_id });
    console.error(`Konnect (${o.boutiqueId}, ${d.numero}) : ${r.raison}`);
    return { ok: false, raison: r.raison, codPossible: d.cod_actif };
  }
  const { error } = await service.rpc("konnect_ouvert", {
    p_commande_id: d.commande_id, p_reference: r.valeur.reference, p_adresse: r.valeur.adresse, p_montant: d.total_millimes, p_mode: d.mode,
  });
  if (error) return { ok: false, raison: "Le paiement n'a pas pu être noté.", codPossible: d.cod_actif };
  return { ok: true, adresse: r.valeur.adresse };
}

type Paiement = { reference: string; boutique_id: string; commande_id: string; numero: string; statut: string; mode: ModeKonnect; cle_chiffree: string | null };

/** Relire un paiement chez Konnect et le noter ; rend son état (paye, en_attente, echoue). */
export async function relirePaiement(reference: string, boutiqueId?: string): Promise<{ statut: string; numero: string } | null> {
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(reference)) return null;
  const service = clientService();
  const { data } = await service.rpc("konnect_paiement", { p_reference: reference });
  const p = data as Paiement | null;
  if (!p || (boutiqueId && p.boutique_id !== boutiqueId)) return null;
  if (p.statut === "paye" || !p.cle_chiffree) return { statut: p.statut, numero: p.numero };
  const cle = await dechiffrer(p.cle_chiffree, contexteKonnect(p.boutique_id));
  if (!cle) return { statut: p.statut, numero: p.numero };
  const r = await lirePaiement(p.mode, cle, reference);
  if (!r.ok) return { statut: p.statut, numero: p.numero };
  const { data: n } = await service.rpc("konnect_noter", {
    p_reference: reference, p_statut: r.valeur.etat, p_montant_paye: r.valeur.payeMillimes, p_details: r.valeur.brut,
  });
  return { statut: (n as { statut: string } | null)?.statut ?? p.statut, numero: p.numero };
}
