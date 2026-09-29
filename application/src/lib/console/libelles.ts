export const LIBELLES_STATUT: Record<string, string> = {
  en_preparation: "En préparation",
  active: "Ouverte",
  suspendue: "Suspendue",
  fermee: "Fermée",
};

/** Les noms des modules (plateforme.modules), pour le journal et les messages. */
export const LIBELLES_MODULES: Record<string, string> = {
  paiement_en_ligne: "Paiement en ligne",
  retrait_magasin: "Retrait en magasin",
  conseil_whatsapp: "Demander conseil (WhatsApp)",
  sav: "Service après-vente",
  comptes_pro: "Comptes professionnels",
  devis: "Demande de devis",
};

export const LIBELLES_THEME: Record<string, string> = {
  editorial: "Éditorial",
  technique: "Technique",
};

/** L'adresse publique d'un domaine. En local, les boutiques sont servies sur
 *  le même port que la console (maymar.localhost:4200) : `hoteRequete` est
 *  l'en-tête Host reçu par la console. */
export function adresseVitrine(hote: string, hoteRequete: string | null): string {
  const port = hoteRequete?.match(/:\d+$/)?.[0] ?? "";
  const local = hote.endsWith(".localhost") || hote === "localhost";
  return `${local ? "http" : "https"}://${hote}${local ? port : ""}`;
}

/** Une date de journal, à l'heure de Tunis. */
export function dateJournal(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Tunis" }).format(new Date(iso));
}
