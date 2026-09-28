// Faux PostgREST pour le prototype : sert le catalogue de démarrage de Maymar
// (mock/donnees.json, exporté d'un Postgres local où les 8 migrations Maymar
// ont été rejouées). Il ne couvre que les lectures de la vitrine
// (src/lib/catalogue.ts) : filtres `eq` et `or(...ilike...)`, `maybeSingle`.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const donnees = JSON.parse(readFileSync(new URL("./donnees.json", import.meta.url), "utf8"));
const port = Number(process.env.PORT ?? 54321);

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
    const attendu = reste.join(".");
    if (op === "eq") resultat = resultat.filter((l) => String(l[cle]) === attendu);
  }
  return resultat;
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const m = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
  if (req.method !== "GET" || !m || !(m[1] in donnees)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: `table inconnue : ${url.pathname}` }));
    return;
  }
  const lignes = filtre(donnees[m[1]], url.searchParams);
  const objet = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  if (objet && lignes.length !== 1) {
    res.writeHead(406, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: "PGRST116", message: "0 ou plusieurs lignes" }));
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(objet ? lignes[0] : lignes));
}).listen(port, "127.0.0.1", () => console.log(`faux PostgREST sur http://127.0.0.1:${port}`));
