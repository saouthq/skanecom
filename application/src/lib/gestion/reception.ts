/* ============================================================================
   LA RÉCEPTION D'UN ARRIVAGE — ce que rend public.gestion_reception_catalogue,
   et les mots des refus de public.gestion_reception (…_reception_arrivage.sql).
   ========================================================================== */

export type DeclinaisonReception = { id: string; sku: string; libelle: string | null; stock: number; seuil: number | null };
export type ProduitReception = {
  id: string;
  nom: string;
  marque: string | null;
  publie: boolean;
  image: string | null;
  variantes: DeclinaisonReception[];
};

const MESSAGES: Record<string, string> = {
  role: "Seuls le propriétaire, l'administrateur et la préparation reçoivent la marchandise.",
  lignes: "Indiquez au moins une quantité reçue.",
  quantite: "Une quantité est illisible : un nombre entier de pièces, de 1 à 100 000.",
  variante: "Une déclinaison a été retirée de la vente entre-temps : la liste est à jour.",
  double: "Une déclinaison apparaît deux fois.",
  commentaire: "La note est trop longue (300 caractères).",
};

export function messageReception(indice: string | undefined, message: string): string {
  return (indice && MESSAGES[indice]) || message || "La réception a échoué.";
}
