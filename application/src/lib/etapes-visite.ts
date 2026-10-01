/* Les étapes de l'entonnoir des visites qu'une page signale elle-même,
   faute d'une adresse qui les dise : la page de vente (structure
   Monoproduit) montre le produit et ouvre la commande sur l'accueil
   (components/MesureAudience.tsx, migration 72). */
export const ETAPE_VISITE = "skanecom:etape";
export type EtapeVisite = "fiche" | "commande";

export function signaleEtape(etape: EtapeVisite): void {
  window.dispatchEvent(new CustomEvent<EtapeVisite>(ETAPE_VISITE, { detail: etape }));
}
