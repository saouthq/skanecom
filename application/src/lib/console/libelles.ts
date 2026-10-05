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
  avis: "Avis clients",
  promotions: "Promotions",
  skanfact: "Facturation SkanFact",
};

export const LIBELLES_THEME: Record<string, string> = {
  editorial: "Éditorial",
  technique: "Technique",
  bento: "Bento",
  immersif: "Immersif",
  commerce: "Commerce",
  monoproduit: "Monoproduit",
};

/** L'adresse publique d'un domaine. En local, les boutiques sont servies sur
 *  le même port que la console (maymar.localhost:4200) : `hoteRequete` est
 *  l'en-tête Host reçu par la console. */
export function adresseVitrine(hote: string, hoteRequete: string | null): string {
  const port = hoteRequete?.match(/:\d+$/)?.[0] ?? "";
  const local = hote.endsWith(".localhost") || hote === "localhost";
  return `${local ? "http" : "https"}://${hote}${local ? port : ""}`;
}

/** « de Maymar », « d'Outillage Pro » : la préposition devant un nom de
 *  boutique, élidée devant une voyelle (le h est laissé tel quel : une
 *  marque en h aspiré ne s'élide pas). */
export function deNom(nom: string): string {
  return /^[aeiouyàâäéèêëîïôöùûüœæ]/i.test(nom.trim()) ? `d'${nom}` : `de ${nom}`;
}

/** Le jour de Tunis (« 2026-10-05 »), décalé de quelques jours au besoin. */
export function jourTunis(decalage = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date(Date.now() + decalage * 86_400_000));
}

/** Un jour sans heure (« 2026-10-12 ») dit court : « 12 oct. ». */
export function jourCourt(jour: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${jour.slice(0, 10)}T00:00:00Z`));
}

/** Une date de journal, à l'heure de Tunis. */
export function dateJournal(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Tunis" }).format(new Date(iso));
}
