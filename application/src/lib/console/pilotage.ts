import { themeDeLaBoutique } from "@/lib/theme";
import { ETAPES_MISE_EN_PLACE, type CleEtape } from "./mise-en-place";
import { SEUIL_RETARD_JOURS, joursDepuis, type SituationSkanFact } from "./skanfact";

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
  /** Son client SkanFact et la dernière situation lue (cadrage 06, migration 79) ;
   *  `echeance` : la plus ancienne des factures qui restaient à payer, et sa facture. */
  facturation: {
    client: string;
    raison_sociale: string;
    situation: SituationSkanFact | null;
    lue_le: string | null;
    echeance: string | null;
    numero: string | null;
  } | null;
};

/** Les couleurs de la vitrine : l'accent, le fond, l'encre (gabarit compris). */
export function couleursDe(l: LignePilotage): { accent: string; fond: string; encre: string } {
  const t = themeDeLaBoutique({ code: l.marque.code, couleurs: l.marque.couleurs });
  return { accent: t.couleurs.accent, fond: t.couleurs.fond, encre: t.couleurs.encre };
}

/** « depuis 5 h », « depuis 2 j », « depuis 20 min » — le nombre et son unité
 *  liés par une espace insécable : jamais « 5 » en fin de ligne et « h » dessous. */
export function depuis(iso: string, maintenant: number): string {
  const minutes = Math.max(0, Math.round((maintenant - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}\u00a0min`;
  const heures = Math.round(minutes / 60);
  if (heures < 48) return `${heures}\u00a0h`;
  return `${Math.round(heures / 24)}\u00a0j`;
}

export const titreEtape = (cle: CleEtape | null) => (cle ? ETAPES_MISE_EN_PLACE[cle]?.titre ?? cle : null);

export type Vigilance = {
  cle: string;
  niveau: "urgent" | "attention" | "info";
  /** Le genre du signal (« attente », « formule », « preparation »…) : les
   *  simples informations se regroupent par genre (lib/console/accueil.ts). */
  type: string;
  /** null : la plateforme elle-même (les e-mails refusés). */
  boutique: LignePilotage | null;
  texte: string;
  /** Dans un groupe, ce qu'on dit de la boutique à côté de son nom (« 2/10 »). */
  court?: string;
  href: string;
};

/** Le genre d'un signal, lu dans sa clé : « <boutique>:<genre>[:…] », « plateforme:<genre> ». */
const typeDe = (cle: string) => cle.split(":")[1] ?? cle;

/** Ce que rend public.console_rappels : les notes de suivi dont le rappel est venu. */
export type Rappel = { id: number; texte: string; rappel: string; boutique: { id: string; slug: string; nom: string }; auteur: string | null };

const JOUR_RAPPEL = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" });

/** Ce que rend public.console_sante pour une boutique (migration …_console_sante_tableau). */
export type Sante = {
  id: string;
  livrees_30j: number;
  refusees_30j: number;
  derniere_commande: string | null;
  sav: { n: number; depuis: string | null };
  devis: { n: number; depuis: string | null };
  avis: { n: number; depuis: string | null };
  certificats_erreur: string[];
  epuises: number;
  publies: number;
  formule: string | null;
};

/* Les seuils : un refus sur quatre à la livraison coûte déjà plus que la
   marge (aller, retour, colis immobilisé) ; on en parle à partir de cinq
   colis clos sur trente jours, pour ne pas crier sur deux commandes. */
export const SEUILS = {
  refusAttention: 0.25,
  refusUrgent: 0.4,
  refusMinimum: 5,
  joursSansCommande: 14,
  heuresSav: 48,
  heuresDevis: 24,
  joursAvis: 3,
  partEpuises: 0.5,
} as const;

/** Ce qui demande un regard, toutes boutiques confondues, le plus pressant d'abord :
 *  des commandes qui attendent (plus de 2 h : à surveiller ; plus d'un jour : urgent ;
 *  jamais celles d'une boutique de démonstration, que personne n'a à confirmer),
 *  une boutique en préparation et sa prochaine étape, un accès support ouvert,
 *  une boutique suspendue ; et, quand SkanFact est branché, une facture échue
 *  depuis plus de SEUIL_RETARD_JOURS jours (lue dans SkanFact, comptée depuis
 *  son échéance : le retard grandit sans relecture) ou une boutique ouverte
 *  sans client SkanFact. Jamais pour une démonstration. S'y ajoutent les
 *  rappels des notes de suivi venus à échéance, et les e-mails refusés de la
 *  semaine (la plateforme elle-même). */
export function vigilances(
  lignes: LignePilotage[],
  maintenant: number,
  options: { skanfact?: boolean; sante?: Sante[]; rappels?: Rappel[]; envoisRefuses?: number } = {},
): Vigilance[] {
  const out: Omit<Vigilance, "type">[] = [];
  if (options.envoisRefuses) {
    const n = options.envoisRefuses;
    out.push({
      cle: "plateforme:envois", niveau: "attention", boutique: null, href: "/journal?vue=envois&echecs=1",
      texte: `${n} e-mail${n > 1 ? "s" : ""} refusé${n > 1 ? "s" : ""} sur 7 jours : codes de connexion ou confirmations qui ne sont pas partis`,
    });
  }
  const parId = new Map(lignes.map((b) => [b.id, b]));
  const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date(maintenant));
  for (const r of options.rappels ?? []) {
    const b = parId.get(r.boutique.id);
    if (!b) continue;
    const extrait = r.texte.length > 90 ? `${r.texte.slice(0, 88).trimEnd()}…` : r.texte;
    out.push({
      cle: `${b.id}:rappel:${r.id}`, niveau: "attention", boutique: b, href: `/boutiques/${b.slug}#t-notes`,
      texte: `rappel${r.rappel < jour ? ` du ${JOUR_RAPPEL.format(new Date(`${r.rappel}T00:00:00Z`))}` : " du jour"} — « ${extrait} »`,
    });
  }
  const santes = new Map((options.sante ?? []).map((x) => [x.id, x]));
  for (const b of lignes) {
    const sa = santes.get(b.id);
    if (sa && !b.demonstration) out.push(...signesDeSante(b, sa, maintenant));
    const fa = b.facturation;
    if (fa?.echeance && !b.demonstration) {
      const jours = joursDepuis(fa.echeance, maintenant);
      if (jours > SEUIL_RETARD_JOURS) {
        out.push({
          cle: `${b.id}:facturation`, niveau: "attention", boutique: b, href: `/boutiques/${b.slug}/facturation`,
          texte: `facture${fa.numero ? ` ${fa.numero}` : ""} échue depuis ${jours} jours, non réglée dans SkanFact`,
        });
      }
    } else if (options.skanfact && !fa && !b.demonstration && b.statut === "active") {
      out.push({
        cle: `${b.id}:sans-client`, niveau: "info", boutique: b, href: `/boutiques/${b.slug}/facturation`,
        texte: "ouverte sans client SkanFact : ses factures ne se suivent pas ici",
      });
    }
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
        court: `${b.mise_en_place.faites}/${b.mise_en_place.total}${etape ? ` · ${etape.toLowerCase()}` : ""}`,
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
  return out.map((v) => ({ ...v, type: typeDe(v.cle) })).sort((a, b) => rang[a.niveau] - rang[b.niveau]);
}


/** La santé d'une boutique cliente : refus, silence, demandes qui attendent,
 *  certificat, vitrine vidée par les ruptures, formule à poser. */
function signesDeSante(b: LignePilotage, sa: Sante, maintenant: number): Omit<Vigilance, "type">[] {
  const out: Omit<Vigilance, "type">[] = [];
  // Une boutique fermée, suspendue ou en préparation ne vend pas : ses signaux d'activité n'en sont pas.
  if (b.statut !== "active") return out;
  const pousse = (cle: string, niveau: Vigilance["niveau"], texte: string, href = `/boutiques/${b.slug}`, court?: string) =>
    out.push({ cle: `${b.id}:${cle}`, niveau, boutique: b, texte, href, court });
  const clos = sa.livrees_30j + sa.refusees_30j;
  if (clos >= SEUILS.refusMinimum) {
    const taux = sa.refusees_30j / clos;
    if (taux >= SEUILS.refusAttention) {
      pousse("refus", taux >= SEUILS.refusUrgent ? "urgent" : "attention",
        `${Math.round(taux * 100)} % de refus à la livraison sur 30 jours (${sa.refusees_30j} sur ${clos} colis)`, `/tableau?boutique=${b.slug}`);
    }
  }
  {
    const derniere = sa.derniere_commande ? new Date(sa.derniere_commande).getTime() : null;
    const jours = derniere === null ? null : Math.floor((maintenant - derniere) / 86_400_000);
    const ouverteDepuis = Math.floor((maintenant - new Date(b.creee_le).getTime()) / 86_400_000);
    if (jours !== null && jours >= SEUILS.joursSansCommande) pousse("silence", "attention", `aucune commande depuis ${jours} jours`);
    else if (jours === null && ouverteDepuis >= SEUILS.joursSansCommande) pousse("silence", "attention", `ouverte depuis ${ouverteDepuis} jours, aucune commande encore`);
    if (sa.formule === null) pousse("formule", "info", "ouverte sans formule : tout lui est ouvert", `/boutiques/${b.slug}#t-formule`);
  }
  const attend = (x: { n: number; depuis: string | null }, heures: number) =>
    x.n > 0 && x.depuis !== null && (maintenant - new Date(x.depuis).getTime()) / 3_600_000 >= heures;
  if (attend(sa.sav, SEUILS.heuresSav)) {
    pousse("sav", "attention", `${sa.sav.n} demande${sa.sav.n > 1 ? "s" : ""} de SAV sans réponse, la plus ancienne depuis ${depuis(sa.sav.depuis!, maintenant)}`);
  }
  if (attend(sa.devis, SEUILS.heuresDevis)) {
    pousse("devis", "attention", `${sa.devis.n} devis à chiffrer, le plus ancien depuis ${depuis(sa.devis.depuis!, maintenant)}`);
  }
  if (attend(sa.avis, SEUILS.joursAvis * 24)) {
    pousse("avis", "info", `${sa.avis.n} avis à relire avant publication, le plus ancien depuis ${depuis(sa.avis.depuis!, maintenant)}`,
      `/boutiques/${b.slug}`, `${sa.avis.n} avis, depuis ${depuis(sa.avis.depuis!, maintenant)}`);
  }
  for (const hote of sa.certificats_erreur) {
    pousse(`certificat:${hote}`, "urgent", `certificat en erreur sur ${hote} : les visiteurs voient un avertissement`, `/boutiques/${b.slug}#t-domaines`);
  }
  if (sa.publies > 0 && sa.epuises > 0 && sa.epuises / sa.publies >= SEUILS.partEpuises) {
    pousse("epuises", "attention", `${sa.epuises} produit${sa.epuises > 1 ? "s" : ""} épuisé${sa.epuises > 1 ? "s" : ""} sur ${sa.publies} en vitrine`);
  }
  return out;
}
