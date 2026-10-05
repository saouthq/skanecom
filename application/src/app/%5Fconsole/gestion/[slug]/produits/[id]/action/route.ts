import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";
import { millimes } from "@/lib/console/import";
import { formateMontant } from "@/lib/prix";
import { rafraichirVitrine } from "@/lib/console/vitrine-cache";
import { messageCatalogue, referenceProposee, type FicheProduit } from "@/lib/gestion/catalogue";

/* ============================================================================
   LES GESTES SUR UN PRODUIT — formulaires HTML ordinaires, réponse par une
   redirection 303 vers la fiche (à la hauteur de la déclinaison touchée).
   Même origine exigée ; l'appel se fait avec la session du membre, la base
   revérifie son rôle (…_gestion_catalogue.sql).
   ========================================================================== */

export const dynamic = "force-dynamic";

/** « 189,000 » → 189000 millimes ; `undefined` si illisible, `null` si vide. */
function prix(texte: FormDataEntryValue | null): number | null | undefined {
  const m = millimes(String(texte ?? ""));
  if (m === null) return null;
  return Number.isNaN(m) ? undefined : m;
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { slug, id } = await params;
  const a = await accesEquipe();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aucune") return vers("/refuse");
  if (a.etat === "aal1") return vers("/double-authentification");
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });

  const f = await req.formData();
  const texte = (cle: string) => String(f.get(cle) ?? "").trim();
  const fiche = `/gestion/${slug}/produits/${id}`;
  // Un geste réussi : la vitrine le montre dès la visite suivante (sans attendre son cache).
  const ici = (ancre?: string) => (m: string, ok = false) => {
    if (ok) rafraichirVitrine(slug);
    return vers(`${fiche}?${new URLSearchParams(ok ? { ok: m } : { erreur: m })}${ancre ? `#${ancre}` : ""}`);
  };
  const b = boutique.boutique_id;
  const sb = await clientSession();

  switch (texte("action")) {
    case "fiche": {
      const retour = ici("t-fiche");
      const { error } = await sb.rpc("gestion_enregistrer_produit", {
        p_boutique_id: b, p_produit_id: id, p_version: texte("version") || null,
        p_champs: {
          nom: texte("nom"), description: texte("description"), marque: texte("marque"),
          categorie_id: texte("categorie_id") || null, publie: f.get("publie") === "1", mis_en_avant: f.get("mis_en_avant") === "1",
        },
      });
      if (error) return retour(messageCatalogue(error.hint, error.message));
      return retour(f.get("publie") === "1" ? "Fiche enregistrée. Le produit est en vitrine." : "Fiche enregistrée. Le produit n'est pas en vitrine.", true);
    }

    case "variante": {
      const vid = texte("variante_id");
      const retour = ici(`var-${vid}`);
      const p = prix(f.get("prix"));
      const pb = prix(f.get("prix_barre"));
      if (!p) return retour("Prix illisible : écrivez par exemple 189,000.");
      if (pb === undefined) return retour("Prix barré illisible : écrivez par exemple 229,000, ou laissez vide.");
      // Le minimum : absent du formulaire, il reste tel quel en base.
      const minimum = texte("minimum") ? Number.parseInt(texte("minimum"), 10) : null;
      if (minimum !== null && !(minimum >= 1 && minimum <= 999)) return retour("Minimum illisible : de 1 (à l'unité) à 999 pièces.");
      const { error } = await sb.rpc("gestion_enregistrer_variante", {
        p_boutique_id: b, p_variante_id: vid, p_prix: p, p_prix_barre: pb, p_seuil: Number.parseInt(texte("seuil"), 10), p_actif: f.get("actif") === "1",
        p_quantite_min: minimum,
      });
      if (error) return retour(messageCatalogue(error.hint, error.message));
      // Le prix pro (module comptes_pro) : seulement si le champ est à l'écran ; vide le retire.
      let pro: number | null = null;
      if (f.has("prix_pro")) {
        const pp = prix(f.get("prix_pro"));
        if (pp === undefined) return retour("Prix pro illisible : écrivez par exemple 166,000, ou laissez vide. Le reste est enregistré.");
        const { error: e } = await sb.rpc("gestion_enregistrer_prix_pro", { p_boutique_id: b, p_variante_id: vid, p_prix_pro: pp });
        if (e) return retour(`${messageCatalogue(e.hint, e.message)}. Le reste est enregistré.`);
        pro = pp;
      }
      return retour(
        `Déclinaison enregistrée : ${formateMontant(p)} TND${pro ? `, ${formateMontant(pro)} TND aux pros` : ""}${minimum && minimum > 1 ? `, ${minimum} pièces au moins par commande` : ""}${f.get("actif") === "1" ? "" : ", hors vente"}.`,
        true,
      );
    }

    case "prix_toutes": {
      // Un prix pour toutes les déclinaisons : le reste de chaque ligne (alerte,
      // mise en vente ; le minimum, passé à null) reste tel qu'il est en base.
      const retour = (m: string, ok = false) => {
        if (ok) rafraichirVitrine(slug);
        return vers(`${fiche}?${new URLSearchParams(ok ? { ok: m } : { erreur: m, toutes: "1" })}#${ok ? "t-declinaisons" : "var-toutes"}`);
      };
      const p = prix(f.get("prix"));
      const pb = prix(f.get("prix_barre"));
      if (!p) return retour("Prix illisible : écrivez par exemple 189,000.");
      if (pb === undefined) return retour("Prix barré illisible : écrivez par exemple 229,000, ou laissez vide.");
      const { data } = await sb.rpc("gestion_produit", { p_boutique_id: b, p_produit_id: id });
      const variantes = (data as FicheProduit | null)?.variantes ?? [];
      if (!variantes.length) return retour("Produit introuvable.");
      let faites = 0;
      for (const v of variantes) {
        const { error } = await sb.rpc("gestion_enregistrer_variante", {
          p_boutique_id: b, p_variante_id: v.id, p_prix: p, p_prix_barre: pb, p_seuil: v.seuil, p_actif: v.actif, p_quantite_min: null,
        });
        if (error) {
          if (faites) rafraichirVitrine(slug);
          return retour(`${v.libelle ?? v.sku} : ${messageCatalogue(error.hint, error.message)}${faites ? ` (${faites} sur ${variantes.length} déjà au nouveau prix)` : ""}.`);
        }
        faites++;
      }
      return retour(`Les ${faites} déclinaisons sont à ${formateMontant(p)} TND${pb ? `, barré ${formateMontant(pb)} TND` : ""}.`, true);
    }

    case "stock": {
      const vid = texte("variante_id");
      // Une erreur garde le mouvement de stock ouvert (stock=…), pour corriger.
      const retour = (m: string, ok = false) =>
        vers(`${fiche}?${new URLSearchParams(ok ? { ok: m } : { erreur: m, stock: vid })}#var-${vid}`);
      const quantite = Number.parseInt(texte("quantite"), 10);
      if (!Number.isFinite(quantite) || quantite < 0) return retour("Quantité illisible.");
      const mode = texte("mode");
      const { data, error } = await sb.rpc("gestion_mouvement_stock", {
        p_boutique_id: b, p_variante_id: vid, p_mode: mode, p_quantite: quantite, p_commentaire: texte("commentaire") || null,
      });
      if (error) return retour(messageCatalogue(error.hint, error.message));
      const pieces = `${quantite} pièce${quantite > 1 ? "s" : ""}`;
      const libelle = mode === "reception" ? `Réception de ${pieces} enregistrée` : mode === "casse" ? `Casse de ${pieces} enregistrée` : "Inventaire enregistré";
      return retour(`${libelle} : ${data} en stock.`, true);
    }

    case "ajouter": {
      const retour = ici("t-ajouter");
      const options: Record<string, string> = {};
      for (const [cle, valeur] of f.entries()) {
        if (cle.startsWith("axe.")) options[cle.slice(4)] = String(valeur).trim();
      }
      const p = prix(f.get("prix"));
      if (!p) return retour("Prix illisible : écrivez par exemple 189,000.");
      let sku = texte("sku");
      if (!sku) {
        const { data } = await sb.rpc("gestion_produit", { p_boutique_id: b, p_produit_id: id });
        const produit = data as FicheProduit | null;
        sku = referenceProposee(produit?.nom ?? "REF", (produit?.axes ?? []).map((ax) => options[ax.cle] ?? ""));
      }
      const { data: vid, error } = await sb.rpc("gestion_ajouter_variante", {
        p_boutique_id: b, p_produit_id: id, p_options: options, p_sku: sku, p_prix: p,
      });
      if (error) return retour(messageCatalogue(error.hint, error.message));
      rafraichirVitrine(slug);
      return vers(`${fiche}?${new URLSearchParams({ ok: `Déclinaison ajoutée (${sku.toUpperCase()}). Faites la réception de son stock.` })}#var-${vid}`);
    }

    case "technique": {
      const retour = ici("t-technique");
      const valeurs: Record<string, string> = {};
      for (const [cle, valeur] of f.entries()) {
        if (cle.startsWith("car.")) valeurs[cle.slice(4)] = String(valeur).slice(0, 120);
      }
      const { error } = await sb.rpc("gestion_enregistrer_caracteristiques", {
        p_boutique_id: b, p_produit_id: id, p_version: texte("version") || null, p_valeurs: valeurs,
      });
      if (error) return retour(messageCatalogue(error.hint, error.message));
      return retour("Fiche technique enregistrée.", true);
    }

    case "paliers": {
      const retour = ici("paliers");
      const paliers: { quantite: number; prix_millimes: number }[] = [];
      for (const i of [0, 1, 2]) {
        const q = texte(`palier.${i}.quantite`);
        const p = prix(f.get(`palier.${i}.prix`));
        if (!q && p === null) continue;
        if (!/^\d{1,2}$/.test(q) || !p) return retour("Chaque ligne remplie : un nombre de pièces (2 à 50) et un prix total, par exemple 99,000.");
        paliers.push({ quantite: Number(q), prix_millimes: p });
      }
      const { error } = await sb.rpc("gestion_enregistrer_paliers", { p_boutique_id: b, p_produit_id: id, p_paliers: paliers });
      if (error) return retour(error.hint === "role" ? "Seuls la propriétaire et les administrateurs règlent les prix." : error.message);
      return retour(paliers.length ? "Prix par quantité enregistrés : la vitrine et la commande les appliquent." : "Plus de prix par quantité sur ce produit.", true);
    }

    default:
      return versAvecErreur(fiche, "Geste inconnu.");
  }
}
