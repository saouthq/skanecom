import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { envoyerApres, envoyerFile } from "@/lib/gestion/skanfact";
import { messageRefus } from "@/lib/gestion/libelles";

/* ============================================================================
   LES GESTES DE LA FACTURATION SKANFACT DU COMMERÇANT (module skanfact) :
   · regler : les taux de TVA (produits, livraison) et le moment de la
     facture (à la confirmation, ou à la livraison) ;
   · deconnecter : la clé oubliée chez SkanEcom (ce qui est fait reste) ;
   · reessayer : un envoi que SkanFact a refusé, après correction — il part
     tout de suite ;
   · facturer : une commande confirmée ou livrée avant la connexion ;
   · renvoyer : ce qui attend une panne, tout de suite.
   La connexion elle-même passe par SkanFact (./connecter, puis
   /skanfact/retour). La base revérifie le rôle et le module.
   ========================================================================== */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { slug } = await params;
  const a = await accesEquipe();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aucune") return vers("/refuse");
  if (a.etat === "aal1") return vers("/double-authentification");
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });

  const f = await req.formData();
  const texte = (cle: string) => String(f.get(cle) ?? "").trim();
  const geste = texte("geste");
  // Le geste peut venir de la fiche d'une commande : on y revient.
  const depuis = texte("retour");
  const fiche = depuis && /^\/gestion\/[a-z0-9-]+\/commandes\/[A-Za-z0-9-]+$/.test(depuis) && depuis.startsWith(`/gestion/${slug}/`) ? depuis : null;
  const retour = (m: string, ok = false) => {
    const p = new URLSearchParams(ok ? (fiche ? { fait: "skanfact" } : { ok: m }) : { erreur: m });
    return vers(`${fiche ?? `/gestion/${slug}/skanfact`}?${p}${fiche ? "#t-skanfact" : ""}`);
  };
  const sb = await clientSession();
  const id = boutique.boutique_id;

  if (geste === "regler") {
    const { error } = await sb.rpc("gestion_skanfact_regler", {
      p_boutique_id: id, p_tva_produits: texte("tva_produits"), p_tva_livraison: texte("tva_livraison"), p_moment: texte("moment"),
    });
    if (error) return retour(messageRefus(error.hint, error.message));
    // Des envois attendaient les taux : ils partent.
    await envoyerApres(id);
    return retour("Réglages enregistrés : ils valent pour les prochaines factures.", true);
  }

  if (geste === "deconnecter") {
    const { error } = await sb.rpc("gestion_skanfact_deconnecter", { p_boutique_id: id });
    if (error) return retour(messageRefus(error.hint, error.message));
    return retour("Boutique déconnectée de SkanFact : la clé est oubliée chez SkanEcom. Ce qui est fait reste, dans SkanFact et ici.", true);
  }

  const bilanTexte = async (numero?: string) => {
    const b = await envoyerApres(id, numero);
    if (!b) return { ok: true, m: "Envoyé à SkanFact : la réponse arrive dans un instant." };
    if (b.coupee) return { ok: false, m: "SkanFact refuse la clé de la boutique (accès retiré ou expiré) : reconnectez la boutique à SkanFact." };
    if (b.refuses) return { ok: false, m: "SkanFact a refusé : sa raison est écrite ci-dessous." };
    if (b.plus_tard) return { ok: false, m: "SkanFact ne répond pas pour l'instant : la demande repartira seule, à l'identique." };
    return { ok: true, m: b.faits ? "Fait dans SkanFact." : "Rien à envoyer pour l'instant." };
  };

  if (geste === "reessayer") {
    const envoi = texte("envoi");
    if (!UUID.test(envoi)) return retour("Envoi inconnu.");
    const { error } = await sb.rpc("gestion_skanfact_reessayer", { p_boutique_id: id, p_envoi: envoi });
    if (error) return retour(messageRefus(error.hint, error.message));
    const r = await bilanTexte(texte("numero") || undefined);
    return retour(r.m, r.ok);
  }

  if (geste === "facturer") {
    const numero = texte("numero");
    const { error } = await sb.rpc("gestion_skanfact_facturer", { p_boutique_id: id, p_numero: numero });
    if (error) return retour(messageRefus(error.hint, error.message));
    const r = await bilanTexte(numero);
    return retour(r.ok && r.m === "Fait dans SkanFact." ? "Facture faite dans SkanFact." : r.m, r.ok);
  }

  if (geste === "renvoyer") {
    const { error } = await sb.rpc("gestion_skanfact_avancer", { p_boutique_id: id });
    if (error) return retour(messageRefus(error.hint, error.message));
    const b = await envoyerFile(id, { budgetMs: 8000 });
    if (b.coupee) return retour("SkanFact refuse la clé de la boutique (accès retiré ou expiré) : reconnectez la boutique à SkanFact.");
    if (b.plus_tard) return retour(`SkanFact ne répond toujours pas : ${b.plus_tard} envoi${b.plus_tard > 1 ? "s repartiront" : " repartira"} seul${b.plus_tard > 1 ? "s" : ""}, à l'identique.`);
    if (b.refuses) return retour(`${b.faits} fait${b.faits > 1 ? "s" : ""}, ${b.refuses} refusé${b.refuses > 1 ? "s" : ""} par SkanFact : leur raison est écrite ci-dessous.`);
    return retour(b.faits ? `${b.faits} envoi${b.faits > 1 ? "s faits" : " fait"} dans SkanFact.` : "Rien à envoyer pour l'instant.", true);
  }

  return retour("Geste inconnu.");
}
