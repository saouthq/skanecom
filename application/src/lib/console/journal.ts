/* ============================================================================
   LE JOURNAL DE LA PLATEFORME — les gestes tracés dans plateforme.journal_audit
   (console et back-office), et ce qu'on en dit.
   ========================================================================== */

import { SANS_FORMULE } from "./formules";
import { REGLES, type Emplacement } from "./images-marque";
import { LIBELLES_MODULES, LIBELLES_STATUT } from "./libelles";
import { ETAPES_MISE_EN_PLACE, type CleEtape } from "./mise-en-place";
import { MODES_SUPPORT, type ModeSupport } from "./support";

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
  "boutique.droits": "Droits ajustés (formule sur mesure)",
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
  "plateforme.alertes": "Alertes de la surveillance : réglage changé",
  "plateforme.erreurs_reglees": "Erreurs de l'application marquées réglées",
  "plateforme.conditions_brouillon": "Conditions de service : brouillon enregistré",
  "plateforme.conditions_publiees": "Conditions de service : version publiée",
  "boutique.conditions_acceptees": "Conditions de service acceptées par le propriétaire",
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
  "rayon.creer": "Rayon créé", "rayon.modifier": "Rayon modifié", "rayon.ordonner": "Rayons réordonnés",
  "rayon.image": "Image d'un rayon", "rayon.retirer": "Rayon retiré",
  "apparence.publier": "Apparence de la vitrine publiée",
  "page.creer": "Page créée", "page.modifier": "Page modifiée", "page.ordonner": "Pages réordonnées", "page.retirer": "Page retirée",
  "arrivage.annoncer": "Arrivage annoncé", "arrivage.modifier": "Arrivage modifié", "arrivage.annuler": "Arrivage annulé", "arrivage.recevoir": "Arrivage reçu",
  "avis.publier": "Avis publié", "avis.ecarter": "Avis écarté", "avis.repondre": "Réponse à un avis", "avis.retirer_photo": "Photo d'un avis retirée",
  "clients.compte_pro": "Compte pro d'un client", "clients.confiance": "Confiance accordée à un client",
  "code_promo.creer": "Code promo créé", "code_promo.modifier": "Code promo modifié", "code_promo.retirer": "Code promo retiré",
  "code_promo.couper": "Code promo coupé", "code_promo.reactiver": "Code promo réactivé",
  "soldes.lancer": "Soldes lancés", "soldes.terminer": "Soldes terminés",
  "lot.creer": "Pack créé", "lot.modifier": "Pack modifié", "lot.retirer": "Pack retiré",
  "lot.couper": "Pack retiré de la vente", "lot.rallumer": "Pack remis en vente",
  "panier.relance": "Panier abandonné relancé", "panier.ignore": "Panier abandonné laissé",
  "alerte_retour.prevenue": "Clients prévenus du retour en stock", "alerte_retour.annulee": "Demandes de retour en stock closes",
  "commande.facturation": "Facturation d'une commande corrigée",
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
  { cle: "rayon", titre: "Rayons" },
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
  { cle: "panier", titre: "Paniers abandonnés" },
  { cle: "alerte_retour", titre: "Retours en stock" },
  { cle: "commande", titre: "Commandes" },
];

/** Le nom d'un geste ; un geste sans nom (ajouté depuis) se lit quand même,
 *  sans son code : « code_promo.couper » → « Code promo : couper ». */
export function libelleAction(action: string): string {
  if (ACTIONS[action]) return ACTIONS[action];
  const [genre, geste = ""] = action.split(".");
  const titre = GENRES_JOURNAL.find((g) => g.cle === genre)?.titre ?? genre.replace(/_/g, " ");
  return `${titre.charAt(0).toUpperCase()}${titre.slice(1)}${geste ? ` : ${geste.replace(/_/g, " ")}` : ""}`;
}

/** Une tranche de poids, comme le backoffice la dit (la base la trace en grammes). */
function tranchePoids(c: string): string {
  if (!/^\d+$/.test(c)) return c === "au-delà" ? "Au-delà de la dernière tranche" : c;
  const g = Number(c);
  return `Jusqu'à ${g >= 1000 ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(g / 1000)} kg` : `${g} g`}`;
}

/** Le canal d'un geste sur les envois (crédit, forfait du fournisseur), au journal. */
export const CANAL_JOURNAL: Record<string, string> = { email: "E-mails", sms: "SMS" };
/** Le détail d'une ligne, sans identifiant technique (le numéro d'une page retirée ne dit rien). */
export const cibleLisible = (c: string | null) => (c && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(c) ? c : "");
export const estGesteEnvois = (action: string) => action.startsWith("boutique.credit_envois") || action === "plateforme.forfait_envoi";

/** Le détail d'une ligne du journal, dit comme à l'écran (jamais un code) :
 *  le même au journal de la plateforme, à celui d'une boutique et à l'export.
 *  `noms` : les formules et les métiers par leur code, quand la page les a. */
export function detailJournal(action: string, cible: string | null, noms: { formules?: Map<string, string>; metiers?: Map<string, string> } = {}): string {
  // (une apparence publiée porte « apparence » pour cible : il ne dit rien de plus que le geste)
  if (action.startsWith("note.") || action.startsWith("annonce.") || action.startsWith("catalogue.photos") || action.startsWith("apparence.")) return "";
  if (action === "boutique.formule") return cible ? noms.formules?.get(cible) ?? cible : SANS_FORMULE;
  if (action.startsWith("vigilance.")) return libelleSignal(cible);
  if (!cible) return "";
  if (action === "formule.quotas") return noms.formules?.get(cible) ?? cible;
  if (action === "boutique.metier") return noms.metiers?.get(cible) ?? cible;
  if (action === "boutique.statut") return LIBELLES_STATUT[cible] ?? cible;
  if (action === "theme.image") return REGLES[cible as Emplacement]?.titre ?? cible;
  if (action.startsWith("module.")) return LIBELLES_MODULES[cible] ?? cible;
  if (action.startsWith("mise_en_place.")) return ETAPES_MISE_EN_PLACE[cible as CleEtape]?.titre ?? cible;
  if (action.startsWith("support.")) return MODES_SUPPORT[cible as ModeSupport]?.titre ?? cible;
  if (action.startsWith("reglages.tranche_poids")) return tranchePoids(cible);
  if (estGesteEnvois(action)) return CANAL_JOURNAL[cible] ?? cible;
  return cibleLisible(cible);
}

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
  erreurs: "Erreurs de l'application",
};
export function libelleSignal(cle: string | null): string {
  if (!cle) return "";
  const [, genre = "", detail] = cle.split(":");
  if (genre === "certificat" && detail) return `Certificat de ${detail}`;
  return SIGNAUX[genre] ?? genre;
}
