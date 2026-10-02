import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";
import { messageRefus } from "@/lib/gestion/libelles";
import { envoyerApres } from "@/lib/gestion/skanfact";

/* ============================================================================
   LES GESTES SUR UNE COMMANDE — formulaires HTML ordinaires (ils marchent
   sans JavaScript), réponse par une redirection 303 vers la fiche.

   · Même origine exigée, comme toute écriture de la console.
   · Le membre est revérifié ici ; la base revérifie son RÔLE et l'étape de
     la commande (supabase/migrations/…_gestion_commandes.sql) : l'appel se
     fait avec SA session, jamais avec la clé de service.
   ========================================================================== */

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; numero: string }> }) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const { slug, numero } = await params;
  const a = await accesEquipe();
  if (a.etat === "anonyme") return vers("/connexion");
  if (a.etat === "aucune") return vers("/refuse");
  if (a.etat === "aal1") return vers("/double-authentification");
  const boutique = a.boutiques.find((b) => b.slug === slug);
  if (!boutique) return new Response("Boutique introuvable", { status: 404 });

  const f = await req.formData();
  const texte = (cle: string) => String(f.get(cle) ?? "").trim() || null;
  const fiche = `/gestion/${slug}/commandes/${encodeURIComponent(numero)}`;
  const base = { p_boutique_id: boutique.boutique_id, p_numero: numero };
  const statut = texte("statut");
  const geste = texte("action");
  const sb = await clientSession();

  let erreur: { hint?: string; message: string } | null = null;
  let fait: string = geste ?? "";
  switch (geste) {
    case "appel": {
      const resultat = texte("resultat");
      ({ error: erreur } = await sb.rpc("gestion_appel", { ...base, p_canal: texte("canal") ?? "appel", p_resultat: resultat, p_note: texte("note") }));
      fait = `appel-${resultat}`;
      break;
    }
    case "annuler":
      ({ error: erreur } = await sb.rpc("gestion_annuler", { ...base, p_statut_attendu: statut, p_motif: texte("motif") }));
      break;
    case "expedier":
      ({ error: erreur } = await sb.rpc("gestion_expedier", {
        ...base, p_statut_attendu: statut, p_transporteur: texte("transporteur"), p_numero_suivi: texte("suivi"),
      }));
      break;
    case "livrer":
      ({ error: erreur } = await sb.rpc("gestion_livrer", { ...base, p_statut_attendu: statut }));
      break;
    case "refuser":
      ({ error: erreur } = await sb.rpc("gestion_refuser", {
        ...base, p_statut_attendu: statut, p_origine: texte("origine"), p_commentaire: texte("commentaire"),
      }));
      break;
    case "note":
      ({ error: erreur } = await sb.rpc("gestion_note", { ...base, p_note: String(f.get("note") ?? "") }));
      break;
    default:
      return versAvecErreur(fiche, "Geste inconnu.");
  }

  if (erreur) return versAvecErreur(fiche, messageRefus(erreur.hint, erreur.message));
  // Confirmée, livrée, refusée, annulée : ce que la base a mis dans la file du SkanFact
  // du commerçant (module skanfact) part tout de suite — une facture, un paiement, un
  // retour. Ce qui l'empêche reste dans la file ; le geste, lui, est fait.
  if (geste !== "note") await envoyerApres(boutique.boutique_id, numero);
  return vers(`${fiche}?fait=${encodeURIComponent(fait)}`);
}
