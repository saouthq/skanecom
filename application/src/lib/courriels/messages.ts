import type { Cadre } from "@/lib/boutique";
import { numeroLisible } from "@/lib/legal";
import { t } from "@/lib/i18n";
import { urlFichier } from "@/lib/photos";
import { rendre, type Courriel, type Marque } from "./modele";

/* ============================================================================
   LES E-MAILS, UN PAR GESTE — le code de connexion de l'acheteur (au nom de
   la boutique), l'invitation et le mot de passe de l'équipe (au nom de la
   plateforme, ou de la boutique pour son équipe), la nouvelle adresse.
   La marque vient du thème de la boutique : ses couleurs, son gabarit.
   ========================================================================== */

/** La plateforme, quand c'est elle qui écrit (la console, ses administrateurs). */
export const MARQUE_PLATEFORME: Marque = {
  nom: t.courriels.plateforme,
  site: null,
  couleurs: {
    fond: "#F4F3F0", surface: "#FFFFFF", surface2: "#F4F3F0", filet: "#E6E3DC",
    encre: "#1C1B19", encreDoux: "#5F5B53", accent: "#1C1B19",
  },
  bouton: { fond: "#1C1B19", texte: "#FFFFFF" },
  angle: 10,
  titres: "sans",
  capitales: false,
  contact: null,
};

/** Le logo en image, s'il en est une qu'une messagerie affiche (jamais un SVG). */
function logoEnImage(cadre: Cadre): Marque["logo"] {
  const logo = cadre.theme.logo;
  if (!logo || !/\.(png|jpe?g|gif)$/i.test(logo.chemin)) return null;
  return { url: urlFichier(logo.chemin), ratio: logo.ratio };
}

/** La marque d'une boutique, lue dans son thème et ses réglages. */
export function marqueDeBoutique(cadre: Cadre, site: string | null): Marque {
  const c = cadre.theme.couleurs;
  const technique = cadre.theme.code === "technique";
  const angle = Number.parseInt(cadre.theme.angles.carte, 10);
  const telephone = typeof cadre.reglages["contact.telephone"] === "string" ? String(cadre.reglages["contact.telephone"]) : "";
  const whatsapp = cadre.whatsapp ?? "";
  const contact = [
    telephone ? `Téléphone ${numeroLisible(telephone)}` : null,
    whatsapp && whatsapp !== telephone ? `WhatsApp ${numeroLisible(whatsapp)}` : null,
  ].filter(Boolean).join(" · ");
  return {
    nom: cadre.boutique.nom,
    site,
    logo: logoEnImage(cadre),
    couleurs: {
      fond: c.fond, surface: c.surface, surface2: c.surface_2, filet: c.filet,
      encre: c.encre, encreDoux: c.encre_doux, accent: c.accent,
    },
    // L'accent du gabarit technique se lit en fond (jaune, texte encre), jamais
    // en texte ; celui de l'éditorial, en retenue : le bouton est à l'encre.
    bouton: technique ? { fond: c.accent, texte: c.encre } : { fond: c.encre, texte: c.surface },
    angle: Number.isFinite(angle) ? angle : 0,
    titres: technique ? "sans" : "serif",
    capitales: technique,
    contact: contact || null,
  };
}

export function courrielCode(m: Marque, code: string, pourEquipe = false): Courriel {
  const c = t.courriels;
  return rendre(m, {
    sujet: c.code.sujet(m.nom),
    apercu: c.code.apercu(code),
    titre: c.code.titre,
    paragraphes: [c.code.texte(m.nom)],
    code,
    codeLegende: c.code.legende,
    notes: [c.code.consigne, c.ignorer],
    raison: pourEquipe ? c.raisonEquipe(m.nom) : c.raisonAcheteur(m.nom),
    propulse: m === MARQUE_PLATEFORME ? undefined : c.propulse,
  });
}

export function courrielInvitation(m: Marque, lien: string): Courriel {
  const c = t.courriels;
  return rendre(m, {
    sujet: c.invitation.sujet(m.nom),
    apercu: c.invitation.apercu,
    titre: c.invitation.titre(m.nom),
    paragraphes: [c.invitation.texte],
    bouton: { libelle: c.invitation.bouton, url: lien },
    lienSecours: c.lienSecours,
    notes: [c.lienUnique, c.ignorer],
    raison: c.raisonEquipe(m.nom),
  });
}

export function courrielMotDePasse(m: Marque, lien: string): Courriel {
  const c = t.courriels;
  return rendre(m, {
    sujet: c.motDePasse.sujet(m.nom),
    apercu: c.motDePasse.apercu,
    titre: c.motDePasse.titre,
    paragraphes: [c.motDePasse.texte],
    bouton: { libelle: c.motDePasse.bouton, url: lien },
    lienSecours: c.lienSecours,
    notes: [c.lienUnique, c.ignorer],
    raison: c.raisonEquipe(m.nom),
  });
}

/** La lettre d'information : confirmer l'inscription (le lien, qui désinscrit aussi). */
export function courrielLettre(m: Marque, lien: string): Courriel {
  const c = t.courriels.lettre;
  return rendre(m, {
    sujet: c.sujet(m.nom),
    apercu: c.apercu,
    titre: c.titre,
    paragraphes: [c.texte(m.nom)],
    bouton: { libelle: c.bouton, url: lien },
    lienSecours: t.courriels.lienSecours,
    notes: [c.validite, c.desinscrire, c.ignorer],
    raison: c.raison(m.nom),
    propulse: t.courriels.propulse,
  });
}

/** Déjà inscrit : l'e-mail le dit, sans lien (la vitrine, elle, répond comme
 *  à une première inscription : on n'y apprend pas qui est inscrit). */
export function courrielLettreDeja(m: Marque): Courriel {
  const c = t.courriels.lettre;
  return rendre(m, {
    sujet: c.dejaSujet(m.nom),
    apercu: c.dejaApercu,
    titre: c.dejaTitre,
    paragraphes: [c.dejaTexte(m.nom)],
    notes: [c.ignorer],
    raison: c.raison(m.nom),
    propulse: t.courriels.propulse,
  });
}

export function courrielChangementEmail(m: Marque, code: string, pourEquipe = false): Courriel {
  const c = t.courriels;
  return rendre(m, {
    sujet: c.changementEmail.sujet(m.nom),
    apercu: c.changementEmail.apercu(code),
    titre: c.changementEmail.titre,
    paragraphes: [c.changementEmail.texte],
    code,
    codeLegende: c.changementEmail.legende,
    notes: [c.ignorer],
    raison: pourEquipe ? c.raisonEquipe(m.nom) : c.raisonAcheteur(m.nom),
    propulse: m === MARQUE_PLATEFORME ? undefined : c.propulse,
  });
}
