import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";
import { millimes } from "@/lib/console/import";
import { messageSaisie } from "@/lib/gestion/saisie";
import { envoyerApres } from "@/lib/gestion/skanfact";

/* ============================================================================
   ENREGISTRER UNE COMMANDE SAISIE — le formulaire de l'écran « Saisir une
   commande » : le canal, le client, une quantité par déclinaison
   (`l:<id>`), la livraison, le retrait ou la vente au comptoir (remise
   et payée sur place), la remise et la livraison
   offerte (la direction), confirmée ou non, la note, et le total que
   l'écran a montré (la base refuse s'il a changé). Une clé tirée par
   l'écran : envoyé deux fois, il ne fait qu'une commande. Réussi, on va sur
   la fiche de la commande ; refusé, on revient à l'écran, la saisie intacte.
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
  const page = `/gestion/${slug}/commandes/nouvelle`;

  const lignes: { variante_id: string; quantite: number }[] = [];
  for (const [cle, brut] of f.entries()) {
    if (!cle.startsWith("l:")) continue;
    const quantite = Number(String(brut).replace(/\s/g, ""));
    if (Number.isInteger(quantite) && quantite > 0) lignes.push({ variante_id: cle.slice(2), quantite });
  }
  const remise = millimes(texte("remise"));
  if (Number.isNaN(remise)) return versAvecErreur(page, messageSaisie("remise", ""));
  const total = Number(texte("total"));
  const mode = texte("mode");

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_saisir_commande", {
    p_boutique_id: boutique.boutique_id,
    p_cle_idempotence: texte("cle"),
    p_canal: texte("canal") || null,
    p_client: { nom: texte("nom"), telephone: texte("telephone"), email: texte("email") || null },
    p_lignes: lignes,
    p_livraison: mode === "retrait" || mode === "comptoir"
      ? { mode }
      : {
          mode: "domicile", ligne1: texte("ligne1"), ligne2: texte("ligne2") || null, ville: texte("ville"),
          gouvernorat: texte("gouvernorat") || null, code_postal: texte("code_postal") || null,
        },
    p_ajustements: { remise_millimes: remise === null ? null : String(remise), livraison_offerte: f.get("offerte") === "on" },
    p_confirmee: f.get("confirmee") === "on",
    p_note: texte("note") || null,
    p_total_attendu_millimes: Number.isFinite(total) && total >= 0 ? Math.round(total) : null,
  });
  if (error) return versAvecErreur(page, messageSaisie(error.hint, error.message));
  const r = data as { numero: string; statut: string; sur_place: boolean };
  // Confirmée (ou vendue au comptoir) : sa facture SkanFact part tout de suite, comme après un geste de la fiche.
  if (r.statut !== "recue") await envoyerApres(boutique.boutique_id, r.numero);
  return vers(`/gestion/${slug}/commandes/${encodeURIComponent(r.numero)}?fait=${r.sur_place ? "comptoir" : "saisie"}`);
}
