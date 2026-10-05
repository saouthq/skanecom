import { getRequestExecutionContext } from "vinext/shims/request-context";
import { clientService } from "@/lib/console/service";
import { adresseSkanFact, secretPartenaire } from "@/lib/console/skanfact";
import { dechiffrer } from "./chiffre";
import { envoyerCourrielsCommandes } from "@/lib/courriels/commandes";

/* ============================================================================
   LA FILE DES ENVOIS VERS LE SKANFACT DU COMMERÇANT (module « Facturation
   SkanFact », docs/boutique.md de SkanFact, B1 à B4 ; migration 81).

   La base met chaque envoi dans la file (une commande confirmée ou livrée,
   un paiement à la livraison, un retour) ; ce fichier les fait partir, au
   serveur, avec la clé de la boutique (gardée chiffrée, déchiffrée ici le
   temps des appels) :
   · B1 la facture : les lignes figées de la commande en prix TTC au millime,
     au taux de TVA que le commerçant a choisi ; la remise (un code promo)
     répartie sur les lignes au millime près — SkanFact n'a pas de champ de
     remise : une ligne dont la quantité ne divise pas son prix remisé se
     coupe en deux (même article, deux prix qui diffèrent d'un millime) ; la
     livraison, une ligne à son taux ; l'encaissement s'il est fait ;
     totalAttendu, le total payé : SkanFact refuse une facture qui ne le
     ferait pas, sans prendre de numéro ;
   · B3 le paiement à la livraison ;
   · B4 le retour : toute la commande (refusée, annulée), ou l'article
     remboursé au SAV, avec l'argent rendu.
   Ce qui part se limite au contrat : le client (nom, ref, e-mail,
   téléphone, adresse, matricule), les lignes, les paiements. Rien d'autre.

   Fiabilité : le corps est figé au premier essai (skanfact_prendre) ; une
   erreur réseau, un 429 ou un 5xx le remettent dans la file, renvoyé plus
   tard À L'IDENTIQUE (SkanFact rend le même résultat, jamais un doublon) ;
   un refus (400, 403, 404, 409) ne se renvoie pas : sa phrase attend le
   commerçant, qui corrige et clique « Réessayer » ; un 401 coupe la
   connexion (la boutique se reconnecte, la file attend).
   ========================================================================== */

type Ligne = { id: string; designation: string; code: string | null; quantite: number; prix: number; total: number };

type Commande = {
  id: string; numero: string; statut: string; mode_paiement: string; statut_paiement: string;
  client_id: string | null; nom: string; telephone: string | null; email: string | null; adresse: string;
  matricule: string | null; raison_sociale: string | null; frais: number; remise: number; total: number;
};

type Corps = Record<string, unknown>;

type EnvoiFile = {
  id: string; genre: "facture" | "paiement" | "retour"; cle: string; corps: Corps | null; essais: number; motif: string | null;
  facture: { etat: string; corps: Corps | null } | null; paiement_a_part: boolean;
  commande: Commande; lignes: Ligne[]; sav_ligne: string | null;
};

type File = {
  connexion: { entreprise: string; cle_chiffree: string; tva_produits: string; tva_livraison: string };
  jour: string;
  envois: EnvoiFile[];
};

export type LigneSkanFact = { designation: string; code?: string; quantite: string; prixUnitaireTTC: string; tauxTva: string };

/** Des millimes en texte décimal (« 29.900 »), sans nombre à virgule. */
export const texte = (millimes: number) => `${Math.trunc(millimes / 1000)}.${String(Math.abs(millimes % 1000)).padStart(3, "0")}`;

/** Les lignes de la facture : la remise répartie au millime près, la livraison à part ; `sources` dit de quelle ligne de la commande vient chacune. */
export function lignesDeFacture(
  source: { id?: string; designation: string; code: string | null; quantite: number; total: number }[],
  remise: number, frais: number, tvaProduits: string, tvaLivraison: string,
): { lignes: LigneSkanFact[]; sources: (string | null)[]; total: number } | { erreur: string } {
  const somme = source.reduce((s, l) => s + l.total, 0);
  if (!source.length) return { erreur: "La commande n'a pas de ligne" };
  if (remise > somme) return { erreur: "La remise dépasse le montant des articles" };
  // La remise, au prorata de chaque ligne ; les millimes qui restent vont aux plus grandes parts perdues.
  const parts = source.map((l, i) => {
    const exact = somme ? (remise * l.total) / somme : 0;
    return { i, r: Math.floor(exact), reste: exact - Math.floor(exact) };
  });
  let manque = remise - parts.reduce((s, p) => s + p.r, 0);
  for (const p of [...parts].sort((a, b) => b.reste - a.reste || source[b.i].total - source[a.i].total)) {
    if (manque <= 0) break;
    if (p.r < source[p.i].total) { p.r += 1; manque -= 1; }
  }
  const sortie: LigneSkanFact[] = [];
  const sources: (string | null)[] = [];
  source.forEach((l, i) => {
    const net = l.total - parts[i].r;
    const base = Math.floor(net / l.quantite);
    const plus = net - base * l.quantite; // ce nombre d'unités coûte un millime de plus
    const ligne = (quantite: number, prix: number) => {
      sortie.push({
        designation: l.designation.slice(0, 300), ...(l.code ? { code: l.code.slice(0, 60) } : {}),
        quantite: String(quantite), prixUnitaireTTC: texte(prix), tauxTva: tvaProduits,
      });
      sources.push(l.id ?? null);
    };
    if (l.quantite - plus > 0) ligne(l.quantite - plus, base);
    if (plus > 0) ligne(plus, base + 1);
  });
  if (frais > 0) {
    sortie.push({ designation: "Livraison", quantite: "1", prixUnitaireTTC: texte(frais), tauxTva: tvaLivraison });
    sources.push(null);
  }
  return { lignes: sortie, sources, total: somme - remise + frais };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Le client, tel que le contrat le permet : nom, ref, e-mail, téléphone, adresse, matricule. Rien d'autre. */
function client(c: Commande) {
  return {
    nom: (c.raison_sociale ?? c.nom).slice(0, 300),
    ...(c.client_id ? { ref: c.client_id } : {}),
    ...(c.email && EMAIL.test(c.email) ? { email: c.email.slice(0, 300) } : {}),
    ...(c.telephone ? { telephone: c.telephone.slice(0, 40) } : {}),
    ...(c.adresse ? { adresse: c.adresse.slice(0, 1000) } : {}),
    ...(c.matricule ? { matricule: c.matricule.slice(0, 40) } : {}),
  };
}

const modeDe = (c: Commande) => (c.mode_paiement === "cod" ? "especes" : "en_ligne");

type Construit = { corps: Corps } | { erreur: string } | { rien: true };

/** Le corps d'un envoi, la première fois qu'il part (ensuite, c'est le corps figé). */
export function construire(e: EnvoiFile, f: Pick<File, "connexion" | "jour">, factureFaite: Corps | null): Construit {
  const c = e.commande;
  if (e.genre === "facture") {
    const l = lignesDeFacture(e.lignes, c.remise, c.frais, f.connexion.tva_produits, f.connexion.tva_livraison);
    if ("erreur" in l) return { erreur: l.erreur };
    if (l.total !== c.total) return { erreur: `Les lignes font ${texte(l.total)} TND et la commande ${texte(c.total)} TND` };
    // L'encaissement, s'il est fait — et qu'il ne part pas à part (B3, le paiement à la livraison).
    const paye = c.statut_paiement === "paye" && !e.paiement_a_part && c.total > 0;
    return {
      corps: {
        reference: c.numero, date: f.jour, client: client(c), lignes: l.lignes, timbre: false,
        ...(paye ? { paiement: { id: "commande", mode: modeDe(c), montant: texte(c.total), date: f.jour, reference: "" } } : {}),
        totalAttendu: texte(c.total),
      },
    };
  }
  if (e.genre === "paiement") {
    if (c.total <= 0) return { rien: true };
    return { corps: { id: e.cle, mode: "especes", montant: texte(c.total), date: f.jour, reference: "" } };
  }
  // Un retour : celui de l'article remboursé au SAV, ou toute la commande.
  const facture = factureFaite ?? {};
  if (e.sav_ligne) {
    // L'article tel qu'il a été facturé (son prix remisé, son taux) : une unité rendue, et l'argent.
    const plan = lignesDeFacture(e.lignes, c.remise, c.frais, f.connexion.tva_produits, f.connexion.tva_livraison);
    const facturees = Array.isArray(facture.lignes) ? (facture.lignes as LigneSkanFact[]) : [];
    const i = "erreur" in plan ? -1 : plan.sources.indexOf(e.sav_ligne);
    const ligne = i >= 0 ? (facturees[i] ?? ("erreur" in plan ? undefined : plan.lignes[i])) : undefined;
    if (!ligne) return { erreur: "L'article remboursé n'est pas sur la facture de la commande" };
    const prix = ligne.prixUnitaireTTC;
    const paye = c.statut_paiement === "paye" && Number(prix) > 0;
    return {
      corps: {
        id: e.cle, date: f.jour, motif: e.motif ?? "Retour", timbre: false,
        lignes: [{ ...ligne, quantite: "1" }],
        ...(paye ? { remboursement: { mode: modeDe(c), montant: prix, reference: "" } } : {}),
        totalAttendu: prix,
      },
    };
  }
  // Toute la commande, telle qu'elle a été facturée ; jamais payée (refusée, annulée) : rien à rendre en argent.
  return { corps: { id: e.cle, date: f.jour, motif: e.motif ?? "Retour", timbre: facture.timbre === true } };
}

type Resultat =
  | { resultat: "fait"; reponse: Corps }
  | { resultat: "refuse" | "plus_tard"; erreur: string }
  | { resultat: "coupee"; erreur: string };

const DELAI_MS = 10_000;

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Ce que SkanFact a répondu, rangé : fait, refusé (sa phrase), plus tard (le même corps), ou la clé refusée. */
export function classer(statut: number, corps: Record<string, unknown> | null, genre: EnvoiFile["genre"]): Resultat {
  const motif = typeof corps?.motif === "string" && corps.motif.trim() ? majuscule(corps.motif.trim()) : null;
  if (statut >= 200 && statut < 300 && corps) {
    const facture = (corps.facture ?? {}) as Record<string, unknown>;
    const retour = (corps.retour ?? {}) as Record<string, unknown>;
    const avoir = (retour.avoir ?? {}) as Record<string, unknown>;
    // Ce qui se garde de la réponse : la pièce et son reste, jamais le client.
    const garde = (o: Record<string, unknown>, cles: string[]) =>
      Object.fromEntries(cles.filter((k) => typeof o[k] === "string" || typeof o[k] === "boolean" || typeof o[k] === "number").map((k) => [k, o[k]]));
    const reponse: Corps = {
      facture: garde(facture, ["id", "numero", "date", "netAPayer", "reste", "ecran"]),
      ...(genre === "facture" ? { deja: corps.deja === true } : {}),
      ...(genre === "retour" ? { avoir: garde(avoir, ["id", "numero", "date", "montant", "ecran"]), rembourse: retour.rembourse ?? null, deja: retour.deja === true } : {}),
    };
    if (genre === "retour" && !avoir.numero && !avoir.id) return { resultat: "plus_tard", erreur: "SkanFact a répondu sans l'avoir : la demande sera renvoyée" };
    if (genre === "facture" && !facture.id) return { resultat: "plus_tard", erreur: "SkanFact a répondu sans la facture : la demande sera renvoyée" };
    return { resultat: "fait", reponse };
  }
  if (statut === 401) return { resultat: "coupee", erreur: "SkanFact refuse la clé de la boutique (accès retiré ou clé expirée) : reconnectez la boutique à SkanFact" };
  if (statut === 403) return { resultat: "refuse", erreur: motif ?? "La clé de la boutique n'a pas le geste « facturer les commandes de la boutique » : reconnectez la boutique à SkanFact" };
  if (statut === 404) return { resultat: "refuse", erreur: motif ?? (genre === "facture"
    ? "SkanFact ne trouve pas l'entreprise de la boutique avec cette clé"
    : "SkanFact ne trouve pas la facture de cette commande") };
  if (statut === 409 || statut === 400 || statut === 422) {
    const champ = typeof corps?.champ === "string" ? ` (champ « ${corps.champ} »)` : "";
    return { resultat: "refuse", erreur: (motif ?? "SkanFact refuse cette demande") + champ };
  }
  if (statut === 429) return { resultat: "plus_tard", erreur: "Trop de demandes à SkanFact à la fois : renvoyée dans un instant" };
  if (statut >= 500) return { resultat: "plus_tard", erreur: "SkanFact ne répond pas pour l'instant : la demande sera renvoyée, à l'identique" };
  return { resultat: "plus_tard", erreur: `SkanFact a répondu ${statut} : la demande sera renvoyée` };
}

const chemin = (entreprise: string, e: EnvoiFile) => {
  const base = `/v1/entreprises/${encodeURIComponent(entreprise)}/commandes-en-ligne`;
  const ref = encodeURIComponent(e.commande.numero);
  return e.genre === "facture" ? base : e.genre === "paiement" ? `${base}/${ref}/paiements` : `${base}/${ref}/retours`;
};

async function appeler(url: string, cle: string, route: string, corps: Corps, genre: EnvoiFile["genre"]): Promise<Resultat> {
  let r: Response;
  try {
    r = await fetch(`${url}${route}`, {
      method: "POST",
      headers: { authorization: `Bearer ${cle}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(DELAI_MS),
      cache: "no-store",
    });
  } catch {
    return { resultat: "plus_tard", erreur: "SkanFact ne répond pas : la demande sera renvoyée, à l'identique" };
  }
  let lu: Record<string, unknown> | null = null;
  try {
    lu = (await r.json()) as Record<string, unknown>;
  } catch {
    // corps illisible : le statut suffit
  }
  return classer(r.status, lu, genre);
}

export type Bilan = { faits: number; refuses: number; plus_tard: number; coupee: boolean; coupures?: Coupures };

/* LES CLÉS QUITTÉES (brique 135 de SkanFact, migration 82) : une clé que la
   boutique a oubliée (« Déconnecter ») ou remplacée (reconnexion,
   renouvellement) se fait couper dans SkanFact, par le serveur, avec le
   secret de SkanEcom : POST /v1/partenaires/skanecom/deconnecter { cle }.
   200 (coupée, ou déjà coupée) et 404 (SkanFact ne la tient pas de
   SkanEcom : rien à couper) la retirent de la file ; une panne, un 5xx, un
   401 (le secret de la plateforme refusé) la renvoient plus tard, la même
   clé. Jamais d'exception. */
export type Coupures = { coupees: number; en_attente: number };

export async function couperCles(boutiqueId: string): Promise<Coupures> {
  const bilan: Coupures = { coupees: 0, en_attente: 0 };
  try {
    const url = adresseSkanFact();
    const secret = secretPartenaire();
    if (!url || !secret) return bilan;
    const service = clientService();
    const { data } = await service.rpc("skanfact_prendre_coupures", { p_boutique_id: boutiqueId });
    for (const k of (data as { id: string; cle_chiffree: string }[] | null) ?? []) {
      const noter = (resultat: "fait" | "plus_tard", erreur: string | null) =>
        service.rpc("skanfact_noter_coupure", { p_id: k.id, p_resultat: resultat, p_erreur: erreur });
      const cle = await dechiffrer(k.cle_chiffree, boutiqueId);
      if (!cle) {
        // Le chiffrement a changé : la clé ne se relit plus, rien ne peut la faire couper (elle expirera seule).
        await noter("fait", null);
        continue;
      }
      let statut = 0;
      try {
        statut = (await fetch(`${url}/v1/partenaires/skanecom/deconnecter`, {
          method: "POST",
          headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ cle }),
          signal: AbortSignal.timeout(DELAI_MS),
          cache: "no-store",
        })).status;
      } catch {
        // réseau : plus tard
      }
      if (statut === 200 || statut === 404) {
        await noter("fait", null);
        bilan.coupees++;
      } else {
        await noter("plus_tard", statut === 401 ? "SkanFact refuse le secret de SkanEcom, qui s'en occupe"
          : statut ? `SkanFact a répondu ${statut}` : "SkanFact ne répond pas");
        bilan.en_attente++;
      }
    }
  } catch {
    // La base ou le réseau a lâché : la file reste telle quelle, elle repartira.
  }
  return bilan;
}

/** Faire partir ce qui est dû dans la file d'une boutique (ou d'une de ses commandes). Jamais d'exception. */
export async function envoyerFile(boutiqueId: string, options: { numero?: string; max?: number; budgetMs?: number } = {}): Promise<Bilan> {
  const bilan: Bilan = { faits: 0, refuses: 0, plus_tard: 0, coupee: false };
  // Les clés quittées d'abord (elles partent même quand la boutique n'est plus connectée).
  if (!options.numero) bilan.coupures = await couperCles(boutiqueId);
  try {
    const service = clientService();
    const { data, error } = await service.rpc("skanfact_file", { p_boutique_id: boutiqueId, p_numero: options.numero ?? null });
    const f = data as File | null;
    if (error || !f || !f.envois.length) return bilan;
    const url = adresseSkanFact();
    if (!url) return bilan;
    const cle = await dechiffrer(f.connexion.cle_chiffree, boutiqueId);
    if (!cle) {
      // Le chiffrement a changé : la clé gardée ne se relit plus, la boutique se reconnecte.
      await service.rpc("skanfact_couper", { p_boutique_id: boutiqueId });
      bilan.coupee = true;
      return bilan;
    }
    const fin = Date.now() + (options.budgetMs ?? 20_000);
    // Les factures faites pendant ce tour : un paiement ou un retour de la même commande peut partir derrière.
    const faites = new Map<string, Corps>();
    for (const e of f.envois.slice(0, options.max ?? 25)) {
      if (Date.now() > fin) break;
      let factureFaite: Corps | null = null;
      if (e.genre !== "facture") {
        factureFaite = faites.get(e.commande.id) ?? (e.facture?.etat === "fait" ? e.facture.corps : null);
        // Sa facture n'est pas encore faite chez SkanFact : il attend son tour (rien n'est pris, rien n'est compté).
        if (!factureFaite) continue;
      }
      const construit: Construit = e.corps ? { corps: e.corps } : construire(e, f, factureFaite);
      const { data: pris } = await service.rpc("skanfact_prendre", { p_envoi: e.id, p_corps: "corps" in construit ? construit.corps : null });
      if (!pris) continue; // un autre tour l'a pris
      const corps = (pris as { corps: Corps | null }).corps;
      const noter = (resultat: "fait" | "refuse" | "plus_tard", reponse: Corps | null, erreur: string | null) =>
        service.rpc("skanfact_noter", { p_envoi: e.id, p_resultat: resultat, p_reponse: reponse, p_erreur: erreur });
      if ("erreur" in construit) {
        await noter("refuse", null, construit.erreur);
        bilan.refuses++;
        continue;
      }
      if ("rien" in construit) {
        await noter("fait", { rien: true }, null);
        continue;
      }
      const r = await appeler(url, cle, chemin(f.connexion.entreprise, e), corps as Corps, e.genre);
      if (r.resultat === "fait") {
        await noter("fait", r.reponse, null);
        if (e.genre === "facture") faites.set(e.commande.id, corps as Corps);
        bilan.faits++;
      } else if (r.resultat === "coupee") {
        // La clé ne vaut plus : la boutique est coupée, l'envoi attend la reconnexion (le même corps).
        await noter("plus_tard", null, r.erreur);
        await service.rpc("skanfact_couper", { p_boutique_id: boutiqueId });
        bilan.coupee = true;
        break;
      } else {
        await noter(r.resultat, null, r.erreur);
        if (r.resultat === "refuse") bilan.refuses++;
        else bilan.plus_tard++;
      }
    }
  } catch {
    // La base ou le réseau a lâché : la file reste telle quelle, elle repartira.
  }
  return bilan;
}

/** Un travail qui continue après la réponse (le Worker l'attend ; en local, Node le laisse finir). */
export function enFond(travail: Promise<unknown>): void {
  const garde = travail.catch(() => undefined);
  try {
    getRequestExecutionContext()?.waitUntil(garde);
  } catch {
    // hors d'une requête : la promesse suit son cours
  }
}

/** Après un geste sur une commande : ses envois partent tout de suite (quatre secondes au plus d'attente), le reste en fond. */
export async function envoyerApres(boutiqueId: string, numero?: string): Promise<Bilan | null> {
  // Les e-mails de commande que le geste a mis dans leur file (au client), en fond.
  enFond(envoyerCourrielsCommandes(boutiqueId));
  const travail = envoyerFile(boutiqueId, { numero });
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const bilan = await Promise.race([
    travail,
    new Promise<null>((r) => { minuterie = setTimeout(() => r(null), 4000); }),
  ]);
  clearTimeout(minuterie);
  if (!bilan) enFond(travail);
  // Ce qui attendait ailleurs dans la boutique (une panne passée) part aussi, sans faire attendre l'équipe.
  if (numero) enFond(travail.then(() => envoyerFile(boutiqueId)));
  return bilan;
}
