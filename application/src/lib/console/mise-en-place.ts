/* ============================================================================
   LA MISE EN PLACE D'UNE BOUTIQUE (C6) — les dix étapes que rend
   public.console_mise_en_place, dites pour Skander : ce qu'il faut faire,
   ce qu'on en sait, où le faire. Les étapes « manuelles » se cochent depuis
   la console ; les autres se constatent dans la base.
   ========================================================================== */

import { LIBELLES_THEME } from "./libelles";

export type CleEtape =
  | "recueil" | "marque" | "catalogue" | "domaine" | "branchements"
  | "legal" | "equipe" | "commande_test" | "formation" | "mise_en_ligne";

export type EtapeBrute = {
  cle: CleEtape;
  manuelle: boolean;
  fait: boolean;
  le: string | null;
  par?: string | null;
  detail?: Record<string, unknown>;
};

export type MiseEnPlace = { creee_le: string; etapes: EtapeBrute[] };

export const ETAPES_MISE_EN_PLACE: Record<CleEtape, { titre: string; aide: string }> = {
  recueil: { titre: "Recueil des éléments", aide: "Logo, couleurs, photos, fichier catalogue, conditions de livraison, transporteur habituel." },
  marque: { titre: "Marque", aide: "Gabarit, couleurs, logo et images de l'accueil." },
  catalogue: { titre: "Catalogue", aide: "Import, contrôle des prix et du stock, photos." },
  domaine: { titre: "Domaine", aide: "Le domaine du client, branché sur la vitrine." },
  branchements: { titre: "Branchements", aide: "Le livreur et le WhatsApp de confirmation, dans les réglages du backoffice." },
  legal: { titre: "Informations légales", aide: "Raison sociale, siège, RNE, matricule fiscal, courriel, dans les réglages du backoffice." },
  equipe: { titre: "Équipe", aide: "Le propriétaire invité, et ses employés." },
  commande_test: { titre: "Commande test", aide: "De bout en bout : commande, confirmation, bordereau, livraison et refus simulés." },
  formation: { titre: "Formation", aide: "Une à deux heures avec l'équipe du client." },
  mise_en_ligne: { titre: "Mise en ligne", aide: "La boutique ouverte, puis un suivi rapproché le premier mois." },
};

const LEGAUX: Record<string, string> = {
  "legal.raison_sociale": "raison sociale",
  "legal.adresse": "siège",
  "legal.identifiant_rne": "RNE",
  "legal.matricule_fiscal": "matricule fiscal",
  "legal.email": "courriel",
};

/** Ce qu'on sait d'une étape, en une ligne (ou null). */
export function detailEtape(e: EtapeBrute): string | null {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  switch (e.cle) {
    case "marque":
      return e.fait ? `Gabarit ${(LIBELLES_THEME[String(d.gabarit)] ?? "Éditorial").toLowerCase()}${d.logo ? ", avec son logo" : ", sans logo"}.` : null;
    case "catalogue": {
      const publies = Number(d.publies ?? 0);
      const sansPhoto = Number(d.sans_photo ?? 0);
      if (!Number(d.produits ?? 0)) return "Aucun produit pour l'instant.";
      return `${publies} produit${publies > 1 ? "s" : ""} en vitrine${sansPhoto ? `, dont ${sansPhoto} sans photo` : ""}.`;
    }
    case "domaine":
      return d.hote ? `${d.hote}${d.certificat === "actif" ? " · certificat actif" : " · certificat en attente"}` : "Seulement l'adresse de la plateforme.";
    case "branchements": {
      const manque = [d.transporteur ? null : "le transporteur", d.whatsapp ? null : "le WhatsApp"].filter(Boolean);
      const base = manque.length ? `Manque ${manque.join(" et ")}.` : `Livreur : ${String(d.transporteur)}.`;
      return `${base}${d.konnect ? " Paiement en ligne actif." : ""}`;
    }
    case "legal": {
      // Dans l'ordre du formulaire du backoffice (la base les rend triés par clé).
      const manquants = Object.keys(LEGAUX).filter((c) => ((d.manquants ?? []) as string[]).includes(c)).map((c) => LEGAUX[c]);
      return manquants.length ? `Manque : ${manquants.join(", ")}.` : "Complètes : les pages légales de la vitrine les reprennent.";
    }
    case "equipe": {
      const n = Number(d.membres ?? 0);
      return n ? `${n} membre${n > 1 ? "s" : ""} actif${n > 1 ? "s" : ""}.` : "Personne pour l'instant.";
    }
    case "commande_test": {
      const n = Number(d.commandes ?? 0);
      if (!n) return "Aucune commande pour l'instant.";
      const livrees = Number(d.livrees ?? 0);
      const refusees = Number(d.refusees ?? 0);
      const dont = [
        livrees ? `${livrees} livrée${livrees > 1 ? "s" : ""}` : null,
        refusees ? `${refusees} refusée${refusees > 1 ? "s" : ""}` : null,
      ].filter(Boolean);
      return `${n} commande${n > 1 ? "s" : ""} en base${dont.length ? `, dont ${dont.join(" et ")}` : ", aucune encore livrée"}.`;
    }
    default:
      return null;
  }
}

/** « J+3 » : le jour de la mise en place où l'étape a été faite. */
export function jourDe(le: string, creeeLe: string): string {
  const jours = Math.max(0, Math.floor((new Date(le).getTime() - new Date(creeeLe).getTime()) / 86_400_000));
  return `J+${jours}`;
}
