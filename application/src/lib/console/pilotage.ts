import { themeDeLaBoutique } from "@/lib/theme";
import { ETAPES_MISE_EN_PLACE, type CleEtape } from "./mise-en-place";

/* ============================================================================
   LE POSTE DE PILOTAGE (accueil de la console) — ce que rend
   public.console_pilotage, et ce qu'on en dit : la couleur de chaque
   boutique, ce qui attend, ce qui est « à surveiller ».
   ========================================================================== */

export type LignePilotage = {
  id: string;
  slug: string;
  nom: string;
  statut: "active" | "en_preparation" | "suspendue" | string;
  /** Montrée aux prospects, pas une cliente (migration 78). */
  demonstration: boolean;
  creee_le: string;
  hote: string | null;
  marque: {
    code: string | null;
    couleurs: Record<string, string>;
    logo_chemin: string | null;
    logo_mode: "masque" | "image" | null;
    logo_ratio: number | null;
    monogramme_chemin: string | null;
    image: string | null;
  };
  mise_en_place: { faites: number; total: number; prochaine: CleEtape | null };
  commandes: { a_confirmer: number; attente_depuis: string | null; semaine: number; encaisse_semaine: number };
  /** Les commandes reçues chaque jour, du plus ancien (J-6) à aujourd'hui. */
  jours: number[];
  produits: number;
  publies: number;
  equipe: number;
  support: { jusqua: string; role: "lecture" | "admin" } | null;
};

/** Les couleurs de la vitrine : l'accent, le fond, l'encre (gabarit compris). */
export function couleursDe(l: LignePilotage): { accent: string; fond: string; encre: string } {
  const t = themeDeLaBoutique({ code: l.marque.code, couleurs: l.marque.couleurs });
  return { accent: t.couleurs.accent, fond: t.couleurs.fond, encre: t.couleurs.encre };
}

/** « depuis 5 h », « depuis 2 j », « depuis 20 min ». */
export function depuis(iso: string, maintenant: number): string {
  const minutes = Math.max(0, Math.round((maintenant - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 48) return `${heures} h`;
  return `${Math.round(heures / 24)} j`;
}

export const titreEtape = (cle: CleEtape | null) => (cle ? ETAPES_MISE_EN_PLACE[cle]?.titre ?? cle : null);

export type Vigilance = {
  cle: string;
  niveau: "urgent" | "attention" | "info";
  boutique: LignePilotage;
  texte: string;
  href: string;
};

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" });

/** Ce qui demande un regard, toutes boutiques confondues, le plus pressant d'abord :
 *  des commandes qui attendent (plus de 2 h : à surveiller ; plus d'un jour : urgent ;
 *  jamais celles d'une boutique de démonstration, que personne n'a à confirmer),
 *  une boutique en préparation et sa prochaine étape, un accès support ouvert,
 *  une boutique suspendue. */
export function vigilances(lignes: LignePilotage[], maintenant: number): Vigilance[] {
  const out: Vigilance[] = [];
  for (const b of lignes) {
    const c = b.commandes;
    if (c.a_confirmer > 0 && c.attente_depuis && !b.demonstration) {
      const heures = (maintenant - new Date(c.attente_depuis).getTime()) / 3_600_000;
      if (heures >= 2) {
        out.push({
          cle: `${b.id}:attente`, niveau: heures >= 24 ? "urgent" : "attention", boutique: b, href: `/boutiques/${b.slug}`,
          texte: `${c.a_confirmer} commande${c.a_confirmer > 1 ? "s" : ""} à confirmer, la plus ancienne depuis ${depuis(c.attente_depuis, maintenant)}`,
        });
      }
    }
    if (b.statut === "en_preparation") {
      const etape = titreEtape(b.mise_en_place.prochaine);
      out.push({
        cle: `${b.id}:preparation`, niveau: "info", boutique: b, href: `/boutiques/${b.slug}#t-mise-en-place`,
        texte: `en préparation, ${b.mise_en_place.faites} étapes sur ${b.mise_en_place.total}${etape ? ` · prochaine : ${etape.toLowerCase()}` : ""}`,
      });
    }
    if (b.support) {
      out.push({
        cle: `${b.id}:support`, niveau: "attention", boutique: b, href: `/boutiques/${b.slug}/support`,
        texte: `accès support ouvert (${b.support.role === "admin" ? "agir" : "regarder"}) jusqu'à ${HEURE.format(new Date(b.support.jusqua))}`,
      });
    }
    if (b.statut === "suspendue") {
      out.push({ cle: `${b.id}:suspendue`, niveau: "info", boutique: b, href: `/boutiques/${b.slug}`, texte: "suspendue : sa vitrine est fermée" });
    }
  }
  const rang = { urgent: 0, attention: 1, info: 2 } as const;
  return out.sort((a, b) => rang[a.niveau] - rang[b.niveau]);
}
