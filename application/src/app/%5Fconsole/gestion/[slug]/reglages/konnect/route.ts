import { accesEquipe, clientSession } from "@/lib/console/session";
import { clientService } from "@/lib/console/service";
import { memeOrigine, vers } from "@/lib/console/http";
import { rafraichirVitrine } from "@/lib/console/vitrine-cache";
import { chiffrementPret, chiffrer } from "@/lib/gestion/chiffre";
import { verifierCle, type ModeKonnect } from "@/lib/paiement/konnect";
import { contexteKonnect } from "@/lib/paiement/commande";

/* ============================================================================
   LE COMPTE KONNECT DE LA BOUTIQUE (Réglages → Paiement) — brancher : le
   portefeuille et la clé d'API de la boutique, la clé essayée chez Konnect
   (rien n'y est créé), puis chiffrée ici et rangée par la base, qui redit
   le rôle (propriétaire ou administrateur). Retirer : le paiement en ligne
   s'éteint, le paiement à la livraison revient. La clé ne revient jamais
   à l'écran : seuls ses quatre derniers caractères.
   ========================================================================== */

export const dynamic = "force-dynamic";

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
  const dire = (m: string, ok = false) => {
    if (ok) rafraichirVitrine(slug);
    return vers(`/gestion/${slug}/reglages/paiement?${new URLSearchParams({ ...(ok ? { ok: m } : { erreur: m }), dans: "konnect" })}#t-konnect`);
  };
  const b = boutique.boutique_id;
  const sb = await clientSession();

  if (texte("geste") === "retirer") {
    const { data, error } = await sb.rpc("gestion_konnect_retirer", { p_boutique_id: b });
    if (error) return dire(error.code === "42501" ? "Seuls le propriétaire et les administrateurs retirent le compte." : error.message);
    return dire(data ? "Compte Konnect retiré : le paiement en ligne est éteint, le paiement à la livraison est rallumé." : "Aucun compte à retirer.", true);
  }

  // Brancher. Le rôle d'abord (la lecture le vérifie), avant d'appeler Konnect.
  const lecture = await sb.rpc("gestion_konnect", { p_boutique_id: b });
  if (lecture.error) return dire("Seuls le propriétaire et les administrateurs branchent le paiement en ligne.");
  const wallet = texte("wallet");
  const cle = texte("cle");
  const mode: ModeKonnect = texte("mode") === "reel" ? "reel" : "essai";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(wallet)) return dire("L'identifiant du portefeuille est illisible : copiez-le depuis votre tableau de bord Konnect.");
  if (cle.length < 16 || cle.length > 400 || /\s/.test(cle)) return dire("La clé d'API est illisible : copiez-la entière, depuis votre tableau de bord Konnect.");
  if (!(await chiffrementPret())) return dire("Le chiffrement des clés n'est pas prêt sur ce serveur (secret SKANFACT_CHIFFRE) : prévenez SkanEcom.");
  const essai = await verifierCle(mode, cle);
  if (!essai.ok) return dire(essai.cle ? `Konnect refuse cette clé en mode ${mode === "essai" ? "essai" : "réel"} : vérifiez-la, et le mode.` : essai.raison);
  const chiffre = await chiffrer(cle, contexteKonnect(b));
  if (!chiffre) return dire("La clé n'a pas pu être chiffrée.");
  const { data: u } = await sb.auth.getUser();
  const { error } = await clientService().rpc("konnect_brancher", {
    p_boutique_id: b, p_user: u.user?.id ?? null, p_wallet: wallet, p_cle_chiffree: chiffre, p_cle_fin: cle.slice(-4), p_mode: mode,
  });
  if (error) return dire(error.message);
  return dire(`Compte Konnect branché, en mode ${mode === "essai" ? "essai (bac à sable : aucun argent réel)" : "réel"}. Allumez maintenant « Paiement en ligne » ci-dessus.`, true);
}
