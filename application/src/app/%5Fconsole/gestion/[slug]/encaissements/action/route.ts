import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";
import { millimes } from "@/lib/console/import";
import { messageEncaissement } from "@/lib/gestion/encaissements";

/* ============================================================================
   ENREGISTRER OU ANNULER UN VERSEMENT — formulaires HTML ordinaires, réponse
   par une redirection 303 vers la page. La base revérifie le rôle, chaque
   colis (livré, payé au livreur, de ce transporteur, pas déjà rapproché) et
   calcule l'attendu elle-même (…_encaissements.sql), avec la session du
   membre, jamais avec la clé de service.
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
  const texte = (cle: string) => String(f.get(cle) ?? "").trim() || null;
  const page = `/gestion/${slug}/encaissements`;
  const sb = await clientSession();

  if (texte("geste") === "annuler") {
    const { error } = await sb.rpc("gestion_annuler_versement", { p_boutique_id: boutique.boutique_id, p_versement_id: texte("versement") ?? "" });
    if (error) return versAvecErreur(page, messageEncaissement(error.hint, error.message));
    return vers(`${page}?fait=annule#t-versements`);
  }

  const recu = millimes(texte("recu") ?? "");
  if (recu === null || Number.isNaN(recu)) return versAvecErreur(page, messageEncaissement("montant", ""));
  const { data, error } = await sb.rpc("gestion_enregistrer_versement", {
    p_boutique_id: boutique.boutique_id,
    p_transporteur: texte("transporteur"),
    p_numeros: f.getAll("numeros").map(String),
    p_recu_millimes: recu,
    p_recu_le: texte("recu_le") ?? "",
    p_reference: texte("reference"),
    p_note: texte("note"),
  });
  if (error) return versAvecErreur(page, messageEncaissement(error.hint, error.message));
  const r = data as { nombre: number; ecart_millimes: number };
  return vers(`${page}?fait=verse&n=${r.nombre}&ecart=${r.ecart_millimes}#t-versements`);
}
