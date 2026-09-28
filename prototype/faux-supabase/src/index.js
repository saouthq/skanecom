// Faux Supabase déployé en Worker, pour le prototype de la vitrine : il sert
// le catalogue de démarrage de Maymar avec la même API REST que PostgREST, sur
// les seules lectures de la vitrine (filtres `eq` et `or(...ilike...)`).
// PANNE = "1" simule une base indisponible : toutes les requêtes répondent 503.
import donnees from "./donnees.json";

function filtre(lignes, params) {
  let resultat = lignes;
  for (const [cle, valeur] of params) {
    if (["select", "order", "limit", "offset"].includes(cle)) continue;
    if (cle === "or") {
      const conditions = valeur.replace(/^\(|\)$/g, "").split(",").map((c) => {
        const [champ, op, ...reste] = c.split(".");
        return { champ, op, motif: reste.join(".") };
      });
      resultat = resultat.filter((l) =>
        conditions.some(({ champ, op, motif }) => {
          if (op !== "ilike") return false;
          const aiguille = motif.replaceAll("%", "").replaceAll("*", "").toLowerCase();
          return String(l[champ] ?? "").toLowerCase().includes(aiguille);
        }),
      );
      continue;
    }
    const [op, ...reste] = valeur.split(".");
    if (op === "eq") resultat = resultat.filter((l) => String(l[cle]) === reste.join("."));
  }
  return resultat;
}

const json = (corps, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });

export default {
  async fetch(request, env) {
    if (env.PANNE === "1") return json({ message: "base indisponible (panne simulée)" }, 503);

    const url = new URL(request.url);
    const m = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (request.method !== "GET" || !m || !(m[1] in donnees)) {
      return json({ message: `table inconnue : ${url.pathname}` }, 404);
    }
    const lignes = filtre(donnees[m[1]], url.searchParams);
    const objet = (request.headers.get("accept") ?? "").includes("vnd.pgrst.object");
    if (objet && lignes.length !== 1) return json({ code: "PGRST116", message: "0 ou plusieurs lignes" }, 406);
    return json(objet ? lignes[0] : lignes);
  },
};
