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
  "domaine.certificats_verifies": "Certificats des domaines vérifiés",
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
  "export.boutiques": "Liste des boutiques exportée",
  "boutique.contact": "Coordonnées du client",
  "administrateur.double_auth_exigee": "Double authentification de l'équipe SkanEcom : réglage changé",
  "boutique.double_auth_exigee": "Double authentification de l'équipe de la boutique : réglage changé",
  "prospect.creer": "Prospect ajouté",
  "prospect.modifier": "Prospect modifié",
  "prospect.etape": "Prospect : étape changée",
  "prospect.gagne": "Prospect gagné (boutique créée)",
  "prospect.retirer": "Prospect retiré",
  "boutique.quotas": "Quotas d'envoi de la boutique",
  "boutique.credit_envois": "Crédit d'envois du mois",
  "boutique.credit_envois_retire": "Crédit d'envois retiré",
  "formule.quotas": "Quotas d'envoi de la formule",
  "plateforme.forfait_envoi": "Forfait du fournisseur d'envois",
  "boutique.courriels": "E-mails de la boutique : nom affiché, réponses",
  "boutique.domaine_envoi": "Domaine d'envoi des e-mails",
  "boutique.domaine_branche": "Domaine branché chez Cloudflare",
  "boutique.domaine_achete": "Domaine acheté",
  "plateforme.courriels": "E-mails de l'équipe : adresse de réponse",
  "konnect.brancher": "Compte Konnect branché (paiement en ligne)",
  "konnect.retirer": "Compte Konnect retiré",
  // Les gestes des back-offices (tracés par la boutique elle-même)
  "accueil.modifier": "Accueil de la vitrine modifié",
  "apparence.publier": "Apparence de la vitrine publiée",
  "page.creer": "Page créée", "page.modifier": "Page modifiée", "page.ordonner": "Pages réordonnées", "page.retirer": "Page retirée",
  "arrivage.annoncer": "Arrivage annoncé", "arrivage.modifier": "Arrivage modifié", "arrivage.annuler": "Arrivage annulé", "arrivage.recevoir": "Arrivage reçu",
  "avis.publier": "Avis publié", "avis.ecarter": "Avis écarté", "avis.repondre": "Réponse à un avis", "avis.retirer_photo": "Photo d'un avis retirée",
  "clients.compte_pro": "Compte pro d'un client", "clients.confiance": "Confiance accordée à un client",
  "code_promo.creer": "Code promo créé", "code_promo.modifier": "Code promo modifié", "code_promo.retirer": "Code promo retiré",
  "soldes.lancer": "Soldes lancés", "soldes.terminer": "Soldes terminés",
  "lot.creer": "Pack créé", "lot.modifier": "Pack modifié", "lot.retirer": "Pack retiré",
  "devis.envoyer": "Devis envoyé", "devis.annuler": "Devis annulé",
  "objectif.fixer": "Objectif du mois fixé",
  "lettre.retirer": "Inscrit à la lettre retiré",
  "export.commandes": "Commandes exportées", "export.lettre": "Inscrits à la lettre exportés",
  "reglages.zone": "Zone de livraison", "reglages.zone_supprimee": "Zone de livraison supprimée", "reglages.gouvernorats": "Gouvernorats livrés",
  "reglages.tranche_poids": "Tranche de poids", "reglages.tranche_poids_supprimee": "Tranche de poids supprimée",
  "vigilance.reportee": "Signal mis à plus tard",
  "vigilance.reprise": "Signal repris",
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
  { cle: "vigilance", titre: "À surveiller (mis à plus tard)" },
  { cle: "prospect", titre: "Prospects" },
  { cle: "plateforme", titre: "Plateforme (fournisseurs, e-mails)" },
  { cle: "page", titre: "Pages de la vitrine" },
  { cle: "apparence", titre: "Apparence de la vitrine" },
  { cle: "accueil", titre: "Accueil de la vitrine" },
  { cle: "avis", titre: "Avis clients" },
  { cle: "code_promo", titre: "Codes promo" },
  { cle: "soldes", titre: "Soldes" },
  { cle: "lot", titre: "Packs" },
  { cle: "arrivage", titre: "Arrivages" },
  { cle: "devis", titre: "Devis" },
  { cle: "clients", titre: "Clients" },
  { cle: "objectif", titre: "Objectif du mois" },
  { cle: "lettre", titre: "Lettre d'information" },
  { cle: "konnect", titre: "Paiement en ligne (Konnect)" },
];

/** Le canal d'un geste sur les envois (crédit, forfait du fournisseur), au journal. */
export const CANAL_JOURNAL: Record<string, string> = { email: "E-mails", sms: "SMS" };
/** Le détail d'une ligne, sans identifiant technique (le numéro d'une page retirée ne dit rien). */
export const cibleLisible = (c: string | null) => (c && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(c) ? c : "");
export const estGesteEnvois = (action: string) => action.startsWith("boutique.credit_envois") || action === "plateforme.forfait_envoi";

/** Un jour « 2026-10-05 » d'un formulaire, ou rien. */
export function jourValide(v: string | null | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  // (le 30 février n'existe pas : on relit le jour)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

/** Ce qu'un signal d'« À surveiller » mis à plus tard ou repris désigne
 *  (sa clé : « <boutique>:<genre>[:<détail>] »), lisible au journal. */
const SIGNAUX: Record<string, string> = {
  attente: "Commandes à confirmer", refus: "Refus à la livraison", silence: "Aucune commande récente",
  formule: "Ouverte sans formule", sav: "SAV sans réponse", devis: "Devis à chiffrer", avis: "Avis à relire",
  epuises: "Produits épuisés", facturation: "Facture en retard", "sans-client": "Sans client SkanFact",
  preparation: "Mise en place à finir", support: "Accès support ouvert", suspendue: "Boutique suspendue",
  rappel: "Rappel d'une note", "quota-email": "Quota d'e-mails", "quota-sms": "Quota de SMS",
  "forfait-email": "Forfait d'e-mails du fournisseur", "forfait-sms": "Forfait de SMS du fournisseur",
};
export function libelleSignal(cle: string | null): string {
  if (!cle) return "";
  const [, genre = "", detail] = cle.split(":");
  if (genre === "certificat" && detail) return `Certificat de ${detail}`;
  return SIGNAUX[genre] ?? genre;
}
