import { t } from "@/lib/i18n";
import { numeroLisible } from "@/lib/legal";
import { rendre, type Courriel, type Marque } from "./modele";

/* ============================================================================
   L'E-MAIL D'UNE DEMANDE DE CONTACT (réglage vitrine.formulaire_contact) —
   au propriétaire et aux administrateurs de la boutique, aux couleurs de la
   boutique : qui écrit, comment lui répondre, ce qu'il dit, d'où ; le bouton
   ouvre les demandes au backoffice. La demande, elle, est déjà en base :
   un e-mail manqué ne perd rien.
   ========================================================================== */

export type Demande = {
  numero: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  sujet: string | null;
  message: string;
  produit: string | null;
};

export function courrielDemande(m: Marque, d: Demande, lienDemandes: string | null): Courriel {
  const tc = t.courrielDemande;
  return rendre(m, {
    sujet: tc.sujet(d.numero, d.nom),
    apercu: tc.apercu(d.sujet),
    titre: tc.titre,
    paragraphes: [tc.texte(d.nom)],
    encarts: [
      { titre: tc.encartContact, lignes: [d.nom, d.telephone ? numeroLisible(d.telephone) : null, d.email].filter((x): x is string => Boolean(x)) },
      {
        titre: tc.encartMessage,
        lignes: [d.sujet, d.produit ? tc.aPropos(d.produit) : null, ...d.message.split(/\n+/)].filter((x): x is string => Boolean(x && x.trim())),
      },
    ],
    bouton: lienDemandes ? { libelle: tc.bouton, url: lienDemandes } : undefined,
    notes: [],
    raison: tc.raison,
  });
}
