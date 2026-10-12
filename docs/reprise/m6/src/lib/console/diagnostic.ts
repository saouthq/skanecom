import type { Releve } from "./surveillance";

/* ============================================================================
   LE DIAGNOSTIC D'UNE BOUTIQUE (public.console_diagnostic) — chaque point :
   ce qui a été vu, s'il bloque la vente, est à regarder, ou va bien ; et
   s'il cloche, quoi faire, avec le lien du geste dans la console.
   ========================================================================== */

export type DonneesDiagnostic = {
  boutique: { id: string; slug: string; nom: string; statut: string; demonstration: boolean; suspension_motif: string | null };
  domaine: { hote: string; type: string; statut: string; verifie_le: string | null; erreur: string | null } | null;
  domaines: number;
  maintenance: { depuis: string; message: string | null } | null;
  maintenance_plateforme: boolean;
  conditions: { publiee: number | null; acceptee: number | null };
  erreurs_24h: number;
  derniere_erreur: { message: string; surface: string; le: string } | null;
  pannes: number;
  surveillance: { ok: boolean; detail: string | null; duree_ms: number | null; le: string } | null;
  courriels: { dus: number; retentes: number; refuses_7j: number; sans_adresse_7j: number; derniere_erreur: string | null; destinataires: number;
    domaine_envoi: { domaine: string; statut: string; actif: boolean } | null };
  skanfact: { etat: string | null; dus: number; refuses: number };
  catalogue: { publies: number; en_stock: number };
  livraison: { zones: number; site_vitrine: boolean };
  paiement: { module: boolean; actif: boolean; compte: boolean };
  commandes: { derniere: string | null; sept_jours: number };
  le: string;
};
export type Constat = {
  cle: string; titre: string; niveau: "ok" | "attention" | "panne" | "neutre";
  vu: string; faire?: string; lien?: { href: string; libelle: string };
};

const fois = (n: number, un: string, plusieurs: string) => `${n.toLocaleString("fr-FR")} ${n > 1 ? plusieurs : un}`;
const jours = (iso: string, maintenant: number) => Math.floor((maintenant - new Date(iso).getTime()) / 86_400_000);
const date = (iso: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Tunis" }).format(new Date(iso));

export function constats(d: DonneesDiagnostic, essai: Releve | null, maintenant: number): Constat[] {
  const fiche = `/boutiques/${d.boutique.slug}`;
  const out: Constat[] = [];

  // 1. La vitrine, essayée à l'instant.
  if (d.maintenance || d.maintenance_plateforme) {
    out.push({ cle: "vitrine", titre: "Sa vitrine", niveau: "attention",
      vu: d.maintenance ? `En maintenance depuis le ${date(d.maintenance.depuis)}${d.maintenance.message ? ` (« ${d.maintenance.message} »)` : ""} : ses clients voient la page d'attente.`
        : "Toute la plateforme est en maintenance : ses clients voient la page d'attente.",
      faire: "La rouvrir dès que l'intervention est finie.", lien: { href: d.maintenance ? `${fiche}#t-depannage` : "/etat#t-depannage", libelle: "Dépannage" } });
  } else if (!d.domaine) {
    out.push({ cle: "vitrine", titre: "Sa vitrine", niveau: "panne", vu: "Aucune adresse : la vitrine n'est servie nulle part.",
      faire: "Lui donner une adresse (un domaine).", lien: { href: `${fiche}#t-domaines`, libelle: "Domaines" } });
  } else if (!essai) {
    out.push({ cle: "vitrine", titre: "Sa vitrine", niveau: "neutre", vu: `${d.domaine.hote} : une adresse locale, que ce poste ne peut pas ouvrir.` });
  } else if (!essai.ok) {
    out.push({ cle: "vitrine", titre: "Sa vitrine", niveau: "panne", vu: `${d.domaine.hote} : ${essai.detail ?? "ne répond pas"}.`,
      faire: "Regarder ses erreurs de l'application ; le temps de corriger, la mettre en maintenance ; une page qui ne se met pas à jour : vider son cache.",
      lien: { href: `/etat?erreurs=${d.boutique.slug}#t-erreurs`, libelle: "Ses erreurs" } });
  } else {
    out.push({ cle: "vitrine", titre: "Sa vitrine", niveau: essai.lent ? "attention" : "ok",
      vu: `${d.domaine.hote} répond${essai.statut_http ? ` ${essai.statut_http}` : ""} en ${(essai.duree_ms ?? 0).toLocaleString("fr-FR")} ms${essai.lent ? " : lente" : ""}.`,
      ...(essai.lent ? { faire: "Une lenteur passagère se refait au prochain passage ; si elle dure, regarder la base (État technique)." } : {}) });
  }

  // 2. Son adresse et son certificat.
  if (d.domaine && d.domaine.type !== "local") {
    if (d.domaine.statut === "erreur") {
      out.push({ cle: "certificat", titre: "Son certificat", niveau: "panne", vu: `${d.domaine.hote} : ${d.domaine.erreur ?? "le certificat n'est pas valable"}.`,
        faire: "Vérifier que le domaine pointe vers SkanEcom chez son registraire, puis revérifier.", lien: { href: `${fiche}#t-domaines`, libelle: "Domaines" } });
    } else if (d.domaine.statut === "en_attente") {
      out.push({ cle: "certificat", titre: "Son certificat", niveau: "attention", vu: `${d.domaine.hote} : jamais vérifié.`,
        faire: "Lancer la vérification des certificats.", lien: { href: "/etat#t-domaines", libelle: "Vérifier" } });
    } else {
      out.push({ cle: "certificat", titre: "Son certificat", niveau: "ok", vu: `${d.domaine.hote} : valable${d.domaine.verifie_le ? `, vérifié le ${date(d.domaine.verifie_le)}` : ""}.` });
    }
  }

  // 3. Son statut, ses conditions de service.
  if (d.boutique.statut !== "active") {
    out.push({ cle: "statut", titre: "Son statut", niveau: "panne",
      vu: d.boutique.statut === "suspendue" ? "Suspendue : sa vitrine n'est plus servie." : `« ${d.boutique.statut} » : sa vitrine n'est pas servie.`,
      faire: "La rouvrir depuis l'en-tête de sa fiche, si le motif est levé.", lien: { href: fiche, libelle: "Sa fiche" } });
  } else {
    out.push({ cle: "statut", titre: "Son statut", niveau: "ok", vu: d.boutique.demonstration ? "Ouverte (boutique de démonstration)." : "Ouverte." });
  }
  if (d.conditions.publiee && (d.conditions.acceptee ?? 0) < d.conditions.publiee) {
    out.push({ cle: "conditions", titre: "Ses conditions de service", niveau: "attention",
      vu: d.conditions.acceptee ? `Acceptées en version ${d.conditions.acceptee} ; la version ${d.conditions.publiee} attend.` : `La version ${d.conditions.publiee} n'est pas encore acceptée.`,
      faire: "Son backoffice le demande au propriétaire à chaque ouverture ; le lui rappeler.", lien: { href: "/conditions", libelle: "Conditions" } });
  }

  // 4. Ses erreurs et ses pannes.
  if (d.pannes) {
    out.push({ cle: "pannes", titre: "Ses pannes", niveau: "panne", vu: `${fois(d.pannes, "panne ouverte", "pannes ouvertes")} par la surveillance.`,
      faire: "Lire l'incident (quoi, depuis quand) dans les alertes de l'État technique.", lien: { href: "/etat#t-alertes", libelle: "Les incidents" } });
  }
  if (d.erreurs_24h) {
    out.push({ cle: "erreurs", titre: "Ses erreurs", niveau: "attention",
      vu: `${fois(d.erreurs_24h, "fois", "fois")} ces 24 heures${d.derniere_erreur ? ` ; la dernière : « ${d.derniere_erreur.message} » (${d.derniere_erreur.surface})` : ""}.`,
      faire: "Ouvrir la pile ; corrigée, la marquer réglée.", lien: { href: `/etat?erreurs=${d.boutique.slug}#t-erreurs`, libelle: "Ses erreurs" } });
  } else {
    out.push({ cle: "erreurs", titre: "Ses erreurs", niveau: "ok", vu: "Aucune erreur ces 24 heures." });
  }

  // 5. Ses e-mails.
  const c = d.courriels;
  if (!c.destinataires) {
    out.push({ cle: "equipe", titre: "Qui reçoit ses e-mails", niveau: "panne", vu: "Aucun propriétaire ni administrateur actif avec une adresse : personne n'est prévenu des commandes.",
      faire: "Inviter le propriétaire dans son équipe.", lien: { href: `${fiche}/equipe`, libelle: "Équipe" } });
  }
  if (c.retentes || c.refuses_7j) {
    out.push({ cle: "courriels", titre: "Ses e-mails de commande", niveau: "attention",
      vu: [c.retentes ? fois(c.retentes, "e-mail retenté", "e-mails retentés") : null, c.refuses_7j ? `${fois(c.refuses_7j, "abandonné", "abandonnés")} sur 7 jours` : null].filter(Boolean).join(", ")
        + (c.derniere_erreur ? ` — « ${c.derniere_erreur} »` : "") + ".",
      faire: "Une fois la cause réglée (fournisseur, adresse), les relancer.", lien: { href: `${fiche}#t-depannage`, libelle: "Relancer" } });
  } else {
    out.push({ cle: "courriels", titre: "Ses e-mails de commande", niveau: "ok", vu: c.dus ? `${fois(c.dus, "e-mail", "e-mails")} en route, rien de coincé.` : "Rien de coincé." });
  }
  if (c.domaine_envoi && c.domaine_envoi.statut !== "verifie") {
    out.push({ cle: "domaine_envoi", titre: "Son domaine d'envoi", niveau: "attention", vu: `${c.domaine_envoi.domaine} : pas encore vérifié chez le fournisseur ; ses e-mails partent de l'adresse de SkanEcom.`,
      faire: "Poser les enregistrements DNS, puis revérifier.", lien: { href: `${fiche}/courriels`, libelle: "E-mails" } });
  }

  // 6. SkanFact.
  if (d.skanfact.etat === "connectee" && d.skanfact.refuses) {
    out.push({ cle: "skanfact", titre: "Ses envois à SkanFact", niveau: "attention", vu: `${fois(d.skanfact.refuses, "envoi refusé", "envois refusés")} par SkanFact.`,
      faire: "Le commerçant les corrige dans son backoffice (Facturation SkanFact) ; une fois corrigés, les relancer.", lien: { href: `${fiche}#t-depannage`, libelle: "Relancer" } });
  } else if (d.skanfact.etat === "coupee") {
    out.push({ cle: "skanfact", titre: "Ses envois à SkanFact", niveau: "attention", vu: "SkanFact est coupé : ses factures ne partent plus.", faire: "Le commerçant reconnecte SkanFact depuis son backoffice." });
  }

  // 7. Ce qu'il faut pour vendre : catalogue, livraison, paiement.
  if (!d.catalogue.publies) {
    out.push({ cle: "catalogue", titre: "Son catalogue", niveau: "panne", vu: "Rien de publié : la vitrine est vide.", faire: "Importer le catalogue, ou publier ses produits au backoffice.", lien: { href: `${fiche}/import`, libelle: "Catalogue" } });
  } else if (!d.catalogue.en_stock && !d.livraison.site_vitrine) {
    out.push({ cle: "catalogue", titre: "Son catalogue", niveau: "panne", vu: `${fois(d.catalogue.publies, "produit publié", "produits publiés")}, aucun en stock : personne ne peut commander.`, faire: "Recevoir un arrivage au backoffice." });
  } else {
    out.push({ cle: "catalogue", titre: "Son catalogue", niveau: "ok", vu: `${fois(d.catalogue.publies, "produit publié", "produits publiés")}, ${d.catalogue.en_stock.toLocaleString("fr-FR")} en stock.` });
  }
  if (d.livraison.site_vitrine) {
    out.push({ cle: "livraison", titre: "Sa livraison", niveau: "neutre", vu: "Site vitrine : pas de commande en ligne, donc pas de livraison." });
  } else if (!d.livraison.zones) {
    out.push({ cle: "livraison", titre: "Sa livraison", niveau: "panne", vu: "Aucune zone de livraison active : le tunnel ne peut pas aller au bout.", faire: "Ouvrir au moins une zone dans les réglages de livraison de son backoffice." });
  } else {
    out.push({ cle: "livraison", titre: "Sa livraison", niveau: "ok", vu: `${fois(d.livraison.zones, "zone active", "zones actives")}.` });
  }
  if (d.paiement.module && d.paiement.actif && !d.paiement.compte) {
    out.push({ cle: "paiement", titre: "Son paiement en ligne", niveau: "attention", vu: "Konnect est allumé, sans compte branché : le paiement par carte ne peut pas aboutir.", faire: "Brancher le compte Konnect du commerçant, ou couper le réglage." });
  } else {
    out.push({ cle: "paiement", titre: "Son paiement", niveau: "neutre", vu: d.paiement.module && d.paiement.actif ? "À la livraison, et par carte (Konnect)." : "À la livraison." });
  }

  // 8. Ses commandes.
  if (!d.commandes.derniere) {
    out.push({ cle: "commandes", titre: "Ses commandes", niveau: "neutre", vu: "Aucune commande encore." });
  } else {
    const j = jours(d.commandes.derniere, maintenant);
    out.push({ cle: "commandes", titre: "Ses commandes", niveau: j > 14 && !d.boutique.demonstration ? "attention" : "ok",
      vu: `${fois(d.commandes.sept_jours, "commande", "commandes")} ces 7 jours ; la dernière le ${date(d.commandes.derniere)}.`,
      ...(j > 14 && !d.boutique.demonstration ? { faire: "Plus de deux semaines sans commande : appeler le commerçant (ses notes de suivi)." } : {}) });
  }
  // Ce qui bloque d'abord, puis ce qui est à regarder.
  const rang = { panne: 0, attention: 1, neutre: 2, ok: 3 } as const;
  return out.sort((a, b) => rang[a.niveau] - rang[b.niveau]);
}
