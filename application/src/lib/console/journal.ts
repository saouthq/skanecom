/* ============================================================================
   LE JOURNAL DE LA PLATEFORME — les gestes tracés dans plateforme.journal_audit
   (console et back-office), et ce qu'on en dit.
   ========================================================================== */

export const ACTIONS: Record<string, string> = {
  "boutique.creer": "Boutique créée",
  "boutique.metier": "Préréglage du métier posé",
  "boutique.statut": "Statut changé",
  "boutique.demonstration": "Cliente ou démonstration",
  "domaine.ajouter": "Domaine ajouté",
  "theme.modifier": "Marque modifiée",
  "theme.image": "Image de la marque",
  "module.activer": "Module activé",
  "module.couper": "Module coupé",
  "mise_en_place.faite": "Étape de mise en place faite",
  "mise_en_place.a_faire": "Étape de mise en place à refaire",
  "catalogue.importer": "Catalogue importé",
  "catalogue.photos": "Photos importées",
  "catalogue.photos_retirees": "Photos d'un import retirées",
  "equipe.ajouter": "Membre invité",
  "equipe.modifier": "Accès modifié",
  "equipe.lien": "Lien d'accès remis",
  "support.ouvert": "Accès support ouvert",
  "support.ferme": "Accès support fermé",
  "facturation.lier": "Reliée à son client SkanFact",
  "facturation.delier": "Déliée de son client SkanFact",
  "facturation.abonnement": "Abonnement suivi",
  "facturation.abonnement_oublie": "Abonnement plus suivi",
  "facturation.abonnement_suspendu": "Abonnement suspendu",
  "facturation.abonnement_repris": "Abonnement repris",
  "boutique.formule": "Formule changée",
  "boutique.renommer": "Boutique renommée",
  "boutique.cloner": "Configuration clonée",
  "domaine.principal": "Domaine principal changé",
  "domaine.retirer": "Domaine retiré",
  "note.ajouter": "Note de suivi",
  "note.epingler": "Note épinglée",
  "note.detacher": "Note détachée",
  "note.supprimer": "Note retirée",
  "note.rappel_fait": "Rappel fait",
  "formule.creer": "Formule créée",
  "formule.modifier": "Formule modifiée",
  "formule.supprimer": "Formule supprimée",
  "annonce.publier": "Annonce publiée",
  "annonce.arreter": "Annonce arrêtée",
  "annonce.supprimer": "Annonce supprimée",
  "administrateur.nommer": "Entrée dans l'équipe SkanEcom",
  "administrateur.role": "Rôle SkanEcom changé",
  "administrateur.retirer": "Sortie de l'équipe SkanEcom",
  "administrateur.double_auth": "Double authentification réinitialisée",
  "reglages.modifier": "Réglages modifiés (back-office)",
  "compte.mot_de_passe": "Mot de passe changé",
  "compte.deconnexion_partout": "Déconnecté de tous les appareils",
  "compte.codes_secours": "Codes de secours créés",
  "compte.code_secours": "Code de secours utilisé",
  "export.journal": "Journal exporté",
  "export.tableau": "Tableau de bord exporté",
};

/** Les genres de gestes, pour filtrer le journal (le préfixe de l'action). */
export const GENRES_JOURNAL: { cle: string; titre: string }[] = [
  { cle: "boutique", titre: "Boutiques" },
  { cle: "formule", titre: "Formules" },
  { cle: "module", titre: "Modules" },
  { cle: "domaine", titre: "Domaines" },
  { cle: "theme", titre: "Marque" },
  { cle: "catalogue", titre: "Catalogue" },
  { cle: "equipe", titre: "Équipes des boutiques" },
  { cle: "support", titre: "Accès support" },
  { cle: "facturation", titre: "Facturation" },
  { cle: "reglages", titre: "Réglages" },
  { cle: "note", titre: "Notes de suivi" },
  { cle: "annonce", titre: "Annonces" },
  { cle: "administrateur", titre: "Équipe SkanEcom" },
  { cle: "mise_en_place", titre: "Mise en place" },
  { cle: "compte", titre: "Comptes (mot de passe, codes de secours)" },
  { cle: "export", titre: "Exports" },
];

/** Un jour « 2026-10-05 » d'un formulaire, ou rien. */
export function jourValide(v: string | null | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  // (le 30 février n'existe pas : on relit le jour)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}
