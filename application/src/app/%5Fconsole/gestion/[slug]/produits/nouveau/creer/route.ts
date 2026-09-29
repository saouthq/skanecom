import { accesEquipe, clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { millimes, slug as slugDe } from "@/lib/console/import";
import { combinaisons, messageCatalogue, referenceProposee } from "@/lib/gestion/catalogue";

/* Créer un produit : les axes saisis deviennent toutes leurs combinaisons,
   chacune avec sa référence proposée ; la base valide et écrit le tout en
   une fois (gestion_creer_produit). */
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
  const saisie: Record<string, string> = {};
  for (const [cle, valeur] of f.entries()) saisie[cle] = String(valeur);
  const retour = (message: string) => vers(`/gestion/${slug}/produits/nouveau?${new URLSearchParams({ ...saisie, erreur: message })}`);

  const nom = (saisie.nom ?? "").trim();
  if (!nom) return retour("Donnez un nom au produit.");
  const prix = millimes(saisie.prix ?? "");
  if (!prix || Number.isNaN(prix)) return retour("Prix illisible : écrivez par exemple 189,000.");

  const axes: { cle: string; label: string; valeurs: string[] }[] = [];
  for (const i of [0, 1, 2]) {
    const label = (saisie[`axe_nom_${i}`] ?? "").trim();
    const valeurs = [...new Set((saisie[`axe_valeurs_${i}`] ?? "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean))];
    if (!label && valeurs.length === 0) continue;
    if (!label) return retour("Nommez chaque axe (Taille, Couleur…).");
    if (valeurs.length === 0) return retour(`Donnez au moins une valeur à l'axe « ${label} ».`);
    const cle = slugDe(label, 40).replace(/-/g, "_");
    if (!cle) return retour(`Le nom d'axe « ${label} » n'est pas lisible.`);
    if (axes.some((x) => x.cle === cle)) return retour(`L'axe « ${label} » est en double.`);
    axes.push({ cle, label, valeurs });
  }
  const combis = combinaisons(axes);
  if (combis.length > 100) return retour(`${combis.length} déclinaisons : 100 au plus. Retirez des valeurs.`);

  const base = (saisie.sku ?? "").trim() || nom;
  const vues = new Set<string>();
  const variantes = combis.map((options) => {
    let sku = referenceProposee(base, axes.map((x) => options[x.cle]));
    for (let n = 2; vues.has(sku); n++) sku = `${referenceProposee(base, axes.map((x) => options[x.cle]))}-${n}`;
    vues.add(sku);
    return { options, sku };
  });

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_creer_produit", {
    p_boutique_id: boutique.boutique_id,
    p_nom: nom,
    p_slug: slugDe(nom) || "produit",
    p_categorie_id: saisie.categorie_id || null,
    p_prix: prix,
    p_axes: axes.map(({ cle, label }) => ({ cle, label })),
    p_variantes: variantes,
  });
  if (error) return retour(messageCatalogue(error.hint, error.message));
  const cree = data as { id: string; slug: string };
  const ok = `Produit créé en brouillon, avec ${variantes.length} déclinaison${variantes.length > 1 ? "s" : ""}. Recevez leur stock, puis mettez-le en vitrine.`;
  return vers(`/gestion/${slug}/produits/${cree.id}?${new URLSearchParams({ ok })}`);
}
