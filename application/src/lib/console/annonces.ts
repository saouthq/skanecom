/* Les annonces de SkanEcom aux équipes des boutiques (…_notes_annonces.sql). */

export type NiveauAnnonce = "info" | "nouveaute" | "maintenance";

export const NIVEAUX_ANNONCE: Record<NiveauAnnonce, { titre: string; aide: string }> = {
  info: { titre: "Information", aide: "Un mot à toutes les équipes." },
  nouveaute: { titre: "Nouveauté", aide: "Une fonction arrive : ce qu'elle change, où la trouver." },
  maintenance: { titre: "Maintenance", aide: "Une coupure prévue : quand, combien de temps." },
};

export type AnnonceBoutique = { id: number; titre: string; texte: string; niveau: NiveauAnnonce; lien: string | null };
