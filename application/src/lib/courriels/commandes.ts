import { cadre as chargeCadre } from "@/lib/boutique";
import { clientService } from "@/lib/console/service";
import { t } from "@/lib/i18n";
import { formatePrix } from "@/lib/prix";
import { numeroLisible } from "@/lib/legal";
import { envoyer } from "./envoi";
import { marqueDeBoutique } from "./messages";
import { rendre, type Contenu, type Courriel, type Marque } from "./modele";

/* ============================================================================
   LES E-MAILS DE COMMANDE (migration …_courriels_commandes) — au client à
   chaque étape de sa commande, à l'équipe à chaque commande de la vitrine,
   si la boutique l'a réglé (coupé par défaut). La base met chaque e-mail
   dans une file ; on la vide ici : après la commande, après un geste du
   backoffice, à l'ouverture du backoffice. Chaque e-mail est écrit au
   moment de partir, la commande telle qu'elle est, aux couleurs de la
   boutique ; un envoi manqué est retenté.
   ========================================================================== */

export type EvenementCommande = "recue" | "confirmee" | "expediee" | "livree" | "annulee" | "equipe";

/** Ce que la file rend pour un e-mail (courriels_commandes_file). */
export type CourrielDu = {
  id: number;
  evenement: EvenementCommande;
  a: string[];
  boutique: { id: string; slug: string; nom: string };
  commande: {
    numero: string; statut: string; origine: string; mode_paiement: string; mode_livraison: string | null;
    contact_nom: string; contact_telephone: string;
    livraison: { ligne1: string | null; ligne2: string | null; ville: string | null; gouvernorat: string | null; code_postal: string | null };
    sous_total_millimes: number; frais_livraison_millimes: number; remise_millimes: number; total_millimes: number;
    code_promo: string | null; transporteur: string | null; numero_suivi: string | null; motif_annulation: string | null; cree_le: string;
  };
  lignes: { nom: string; detail: string | null; quantite: number; total_millimes: number; lot: string | null; precommande: boolean }[];
};

const tc = () => t.courriels.commande;

/** L'adresse d'un hôte (« maymar.tn », « maymar.localhost » en local). */
export function adresseHote(hote: string | null | undefined): string | null {
  const h = (hote ?? "").trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(h)) return null;
  return h === "localhost" || h.endsWith(".localhost") ? `http://${h}:${process.env.PORT || "4200"}` : `https://${h}`;
}

/** Le récapitulatif : les lignes, puis sous-total, livraison, remise, total. */
function recapitulatif(e: CourrielDu): Contenu["recapitulatif"] {
  const c = e.commande;
  const retrait = c.mode_livraison === "retrait";
  const totaux: NonNullable<Contenu["recapitulatif"]>["totaux"] = [
    { libelle: tc().sousTotal, montant: formatePrix(c.sous_total_millimes) },
    { libelle: retrait ? tc().retrait : tc().livraison, montant: c.frais_livraison_millimes > 0 ? formatePrix(c.frais_livraison_millimes) : tc().livraisonOfferte },
  ];
  if (c.remise_millimes > 0) totaux.push({ libelle: tc().remise(c.code_promo), montant: `− ${formatePrix(c.remise_millimes)}` });
  totaux.push({ libelle: tc().total, montant: formatePrix(c.total_millimes), fort: true });
  return {
    lignes: e.lignes.map((l) => ({
      nom: l.nom,
      detail: [l.detail, l.lot, l.precommande ? tc().precommande : null].filter(Boolean).join(" · ") || null,
      quantite: l.quantite,
      montant: formatePrix(l.total_millimes),
    })),
    totaux,
  };
}

/** Les encarts : où elle va (ou le retrait), comment on la paie, le colis. */
function encarts(e: CourrielDu): NonNullable<Contenu["encarts"]> {
  const c = e.commande;
  const retrait = c.mode_livraison === "retrait";
  const total = formatePrix(c.total_millimes);
  const sortie: NonNullable<Contenu["encarts"]> = [];
  if (!retrait) {
    const l = c.livraison;
    sortie.push({
      titre: tc().encartLivraison,
      // « Tunis, Tunis » : la ville et le gouvernorat, une fois s'ils se confondent.
      lignes: [c.contact_nom, [l.ligne1, l.ligne2].filter(Boolean).join(", "),
        [[l.code_postal, l.ville].filter(Boolean).join(" "), l.gouvernorat && l.gouvernorat.toLowerCase() !== (l.ville ?? "").trim().toLowerCase() ? l.gouvernorat : null].filter(Boolean).join(", "),
        numeroLisible(c.contact_telephone)]
        .filter((x): x is string => Boolean(x && x.trim())),
    });
  } else {
    sortie.push({ titre: tc().encartRetrait, lignes: [c.contact_nom, numeroLisible(c.contact_telephone)] });
  }
  if (e.evenement !== "annulee" && e.evenement !== "livree") {
    sortie.push({ titre: tc().encartPaiement, lignes: [c.mode_paiement === "cod" ? (retrait ? tc().paiementCodRetrait(total) : tc().paiementCod(total)) : tc().paiementEnLigne] });
  }
  if (e.evenement === "expediee" && !retrait && (c.transporteur || c.numero_suivi)) {
    sortie.push({ titre: tc().encartColis, lignes: [tc().colis(c.transporteur, c.numero_suivi)] });
  }
  return sortie;
}

/** L'e-mail d'une étape, au client ; ou celui de l'équipe. */
export function courrielCommande(m: Marque, e: CourrielDu, liens: { site: string | null; console: string | null }): Courriel {
  const c = e.commande;
  const n = c.numero;
  const marque = m.nom;
  const retrait = c.mode_livraison === "retrait";
  const total = formatePrix(c.total_millimes);

  if (e.evenement === "equipe") {
    const qui = [c.contact_nom, c.livraison.ville].filter(Boolean).join(", ");
    return rendre(m, {
      sujet: tc().equipe.sujet(n, total),
      apercu: tc().equipe.apercu(qui),
      titre: tc().equipe.titre,
      paragraphes: [tc().equipe.texte(qui)],
      recapitulatif: recapitulatif(e),
      encarts: encarts(e),
      bouton: liens.console ? { libelle: tc().equipe.bouton, url: `${liens.console}/gestion/${e.boutique.slug}/commandes/${encodeURIComponent(n)}` } : undefined,
      notes: [],
      raison: tc().equipe.raison,
    });
  }

  // Un compte (la vitrine) : « Mes commandes » ; une commande saisie par l'équipe : le suivi par numéro.
  const avecCompte = c.origine !== "manuelle";
  const bouton = liens.site
    ? { libelle: avecCompte ? tc().boutonCompte : tc().boutonSuivi, url: `${liens.site}${avecCompte ? "/compte" : "/suivi"}` }
    : undefined;
  const commun = {
    recapitulatif: recapitulatif(e),
    encarts: encarts(e),
    bouton,
    notes: avecCompte ? [] : [tc().suiviNote(n)],
    raison: tc().raison(marque),
    propulse: t.courriels.propulse,
  };
  switch (e.evenement) {
    case "recue":
      return rendre(m, { sujet: tc().recue.sujet(n, marque), apercu: tc().recue.apercu, titre: tc().recue.titre, paragraphes: [tc().recue.texte(n)], ...commun });
    case "confirmee":
      return rendre(m, { sujet: tc().confirmee.sujet(n, marque), apercu: tc().confirmee.apercu, titre: tc().confirmee.titre, paragraphes: [tc().confirmee.texte(n, retrait)], ...commun });
    case "expediee":
      return rendre(m, {
        sujet: tc().expediee.sujet(n, marque, retrait), apercu: tc().expediee.apercu(retrait), titre: tc().expediee.titre(retrait),
        paragraphes: [tc().expediee.texte(n, retrait)], ...commun,
      });
    case "livree":
      return rendre(m, { sujet: tc().livree.sujet(n, marque), apercu: tc().livree.apercu, titre: tc().livree.titre, paragraphes: [tc().livree.texte(n)], ...commun, recapitulatif: undefined });
    case "annulee":
      return rendre(m, {
        sujet: tc().annulee.sujet(n, marque), apercu: tc().annulee.apercu, titre: tc().annulee.titre,
        paragraphes: [tc().annulee.texte(n), ...(c.motif_annulation ? [tc().annulee.motif(c.motif_annulation)] : [])],
        ...commun, bouton: undefined,
      });
  }
}

/** Vide la file (d'une boutique, ou de toutes) : rend le nombre d'e-mails partis.
 *  Ne lève jamais : un envoi manqué reste dans la file, retenté plus tard. */
export async function envoyerCourrielsCommandes(boutiqueId?: string | null): Promise<number> {
  const service = clientService();
  const { data, error } = await service.rpc("courriels_commandes_file", { p_boutique_id: boutiqueId ?? null, p_limite: 10 });
  if (error || !Array.isArray(data)) return 0;
  const console = adresseHote(process.env.NEXT_PUBLIC_CONSOLE_HOTE);
  const marques = new Map<string, { marque: Marque; site: string | null }>();
  let partis = 0;
  for (const e of data as CourrielDu[]) {
    try {
      let m = marques.get(e.boutique.slug);
      if (!m) {
        const c = await chargeCadre(e.boutique.slug);
        const site = adresseHote(c.boutique.hote_principal);
        m = { marque: marqueDeBoutique(c, site), site };
        marques.set(e.boutique.slug, m);
      }
      const courriel = courrielCommande(m.marque, e, { site: m.site, console });
      let ok = true;
      let raison: string | null = null;
      for (const a of e.a) {
        const r = await envoyer({ a, nom: e.boutique.nom, sujet: courriel.sujet, html: courriel.html, texte: courriel.texte });
        if (!r.ok) { ok = false; raison = r.raison; }
      }
      await service.rpc("courriels_commandes_noter", { p_id: e.id, p_ok: ok, p_erreur: raison });
      if (ok) partis += 1;
    } catch (err) {
      await service.rpc("courriels_commandes_noter", { p_id: e.id, p_ok: false, p_erreur: String(err).slice(0, 300) });
    }
  }
  return partis;
}
