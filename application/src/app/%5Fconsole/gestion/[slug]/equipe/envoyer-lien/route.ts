import { cookies } from "next/headers";
import { accesEquipe } from "@/lib/console/session";
import { memeOrigine, vers, versAvecErreur } from "@/lib/console/http";
import { COOKIE_LIEN } from "@/lib/console/equipe";
import { envoyerLienParCourriel } from "@/lib/console/equipe-serveur";
import { cheminEquipeBoutique, lienRemis } from "@/lib/gestion/equipe";

/* Le propriétaire envoie aussi par e-mail le lien qu'il vient de remettre à
   un employé (le lien est celui que sa page montre : cookie HttpOnly limité
   à l'équipe de sa boutique). */

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
  const retour = cheminEquipeBoutique(slug);
  if (boutique.role !== "proprietaire") return versAvecErreur(retour, "Seul le propriétaire invite son équipe.");
  const lien = lienRemis((await cookies()).get(COOKIE_LIEN)?.value);
  if (!lien) return versAvecErreur(retour, "Plus de lien à envoyer : il ne reste affiché qu'un quart d'heure. Remettez-en un nouveau.");
  const r = await envoyerLienParCourriel(lien, slug);
  if (!r.ok) return versAvecErreur(retour, `L'e-mail n'est pas parti (${r.raison}). Copiez le lien et envoyez-le autrement.`);
  return vers(`${retour}?${new URLSearchParams({ ok: `Lien envoyé par e-mail à ${lien.email}.` })}`);
}
