import { formateMontant } from "@/lib/prix";

/* ============================================================================
   L'EXPORT DES DONNÉES (B8) — les jeux que la base rend
   (…_gestion_export.sql), mis en colonnes pour un tableur.

   Le format est celui qu'Excel ouvre tel quel en français : point-virgule
   entre les colonnes, montants en « 189,000 », dates à l'heure de Tunis,
   UTF-8 avec BOM (les accents restent des accents), fins de ligne CRLF.
   ========================================================================== */

type Format = "texte" | "montant" | "date" | "oui_non" | "nombre";
type Colonne = { cle: string; titre: string; format?: Format };

export const EXPORTS: Record<string, { titre: string; aide: string; colonnes: Colonne[] }> = {
  commandes: {
    titre: "Commandes",
    aide: "Une ligne par commande : client, adresse, montants, étapes.",
    colonnes: [
      { cle: "numero", titre: "Numéro" }, { cle: "date", titre: "Date", format: "date" }, { cle: "statut", titre: "Statut" },
      { cle: "origine", titre: "Origine" }, { cle: "nom", titre: "Nom" }, { cle: "telephone", titre: "Téléphone" },
      { cle: "email", titre: "E-mail" }, { cle: "adresse", titre: "Adresse" }, { cle: "complement", titre: "Complément" },
      { cle: "ville", titre: "Ville" }, { cle: "gouvernorat", titre: "Gouvernorat" }, { cle: "code_postal", titre: "Code postal" },
      { cle: "zone", titre: "Zone" }, { cle: "sous_total", titre: "Sous-total", format: "montant" },
      { cle: "frais_livraison", titre: "Frais de livraison", format: "montant" }, { cle: "remise", titre: "Remise", format: "montant" },
      { cle: "total", titre: "Total", format: "montant" }, { cle: "paiement", titre: "Paiement" },
      { cle: "statut_paiement", titre: "Statut du paiement" }, { cle: "transporteur", titre: "Transporteur" },
      { cle: "suivi", titre: "Numéro de suivi" }, { cle: "refus_origine", titre: "Refus : origine" },
      { cle: "refus_commentaire", titre: "Refus : commentaire" }, { cle: "motif_annulation", titre: "Motif d'annulation" },
      { cle: "note_client", titre: "Note du client" }, { cle: "confirmee_le", titre: "Confirmée le", format: "date" },
      { cle: "expediee_le", titre: "Expédiée le", format: "date" }, { cle: "livree_le", titre: "Livrée le", format: "date" },
      { cle: "conditions_acceptees_le", titre: "Conditions acceptées le", format: "date" },
    ],
  },
  articles: {
    titre: "Articles des commandes",
    aide: "Une ligne par article commandé, pour compter ce qui se vend.",
    colonnes: [
      { cle: "numero", titre: "Commande" }, { cle: "date", titre: "Date", format: "date" }, { cle: "statut", titre: "Statut" },
      { cle: "produit", titre: "Produit" }, { cle: "declinaison", titre: "Déclinaison" }, { cle: "reference", titre: "Référence" },
      { cle: "quantite", titre: "Quantité", format: "nombre" }, { cle: "prix_unitaire", titre: "Prix unitaire", format: "montant" },
      { cle: "total", titre: "Total", format: "montant" },
    ],
  },
  clients: {
    titre: "Clients",
    aide: "Coordonnées, commandes, refus, confiance, note de l'équipe.",
    colonnes: [
      { cle: "nom", titre: "Nom" }, { cle: "telephone", titre: "Téléphone" }, { cle: "email", titre: "E-mail" },
      { cle: "compte", titre: "Compte", format: "oui_non" }, { cle: "commandes", titre: "Commandes", format: "nombre" },
      { cle: "refus", titre: "Refus", format: "nombre" }, { cle: "confiance", titre: "Confiance" },
      { cle: "depuis", titre: "Client depuis", format: "date" }, { cle: "note", titre: "Note de l'équipe" },
    ],
  },
  catalogue: {
    titre: "Catalogue",
    aide: "Une ligne par déclinaison : prix, stock, seuil d'alerte.",
    colonnes: [
      { cle: "produit", titre: "Produit" }, { cle: "adresse", titre: "Adresse" }, { cle: "en_vitrine", titre: "En vitrine", format: "oui_non" },
      { cle: "marque", titre: "Marque" }, { cle: "rayon", titre: "Rayon" }, { cle: "reference", titre: "Référence" },
      { cle: "declinaison", titre: "Déclinaison" }, { cle: "prix", titre: "Prix", format: "montant" },
      { cle: "prix_barre", titre: "Prix barré", format: "montant" }, { cle: "stock", titre: "Stock", format: "nombre" },
      { cle: "alerte_sous", titre: "Alerte sous", format: "nombre" }, { cle: "en_vente", titre: "En vente", format: "oui_non" },
      { cle: "poids_grammes", titre: "Poids (g)", format: "nombre" },
    ],
  },
  stock: {
    titre: "Journal du stock",
    aide: "Chaque réception, vente, retour, inventaire et casse.",
    colonnes: [
      { cle: "date", titre: "Date", format: "date" }, { cle: "reference", titre: "Référence" }, { cle: "produit", titre: "Produit" },
      { cle: "motif", titre: "Motif" }, { cle: "mouvement", titre: "Mouvement", format: "nombre" },
      { cle: "stock_apres", titre: "Stock après", format: "nombre" }, { cle: "commande", titre: "Commande" },
      { cle: "auteur", titre: "Auteur" }, { cle: "commentaire", titre: "Commentaire" },
    ],
  },
};

const DATE = new Intl.DateTimeFormat("fr-FR", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis",
});

function valeur(v: unknown, format: Format = "texte"): string {
  if (v === null || v === undefined || v === "") return "";
  switch (format) {
    case "montant":
      return formateMontant(Number(v));
    case "date":
      return DATE.format(new Date(String(v))).replace(",", "");
    case "oui_non":
      return v === true || v === "true" ? "oui" : "non";
    default:
      return String(v);
  }
}

/** Une cellule CSV : entre guillemets si elle contient un séparateur, un
 *  guillemet ou un retour à la ligne ; et jamais interprétée comme une
 *  formule par le tableur (=, +, -, @ en tête : injection de formule). */
function cellule(texte: string): string {
  // (un nombre, un téléphone « +216… » ou un mouvement « -2 » ne sont pas des formules)
  const sure = /^[=+\-@\t\r]/.test(texte) && !/^[-+]?\d[\d ]*([,.]\d+)?$/.test(texte) ? `'${texte}` : texte;
  return /[";\r\n]/.test(sure) ? `"${sure.replace(/"/g, '""')}"` : sure;
}

export function versCsv(quoi: string, lignes: Record<string, unknown>[]): string {
  const { colonnes } = EXPORTS[quoi];
  const tete = colonnes.map((c) => cellule(c.titre)).join(";");
  const corps = lignes.map((l) => colonnes.map((c) => cellule(valeur(l[c.cle], c.format))).join(";"));
  return "﻿" + [tete, ...corps].join("\r\n") + "\r\n";
}
