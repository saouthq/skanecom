// Fige l'annuaire des domaines (domaine → boutique) dans la vitrine, avant sa
// compilation : application/src/annuaire.genere.json.
// La vitrine résout alors ses domaines connus SANS interroger la base, et
// reste joignable pendant une panne (public.annuaire_domaines, migration 05).
//
//   node outils/annuaire.mjs
//
// Variables : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (la
// fonction est réservée à la clé de service). ANNUAIRE_EN_PLUS, facultative :
// des domaines de plus, en JSON { "hote": "slug" } — l'aperçu en ligne
// (.github/workflows/apercu.yml) y met ses adresses workers.dev. En local :
//   set -a; . .outils/api-locale.env; set +a; node outils/annuaire.mjs
import { writeFile } from "node:fs/promises";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont attendues.");
  process.exit(1);
}

const reponse = await fetch(`${url}/rest/v1/rpc/annuaire_domaines`, {
  method: "POST",
  headers: { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json" },
  body: "{}",
});
if (!reponse.ok) {
  console.error(`Annuaire illisible : HTTP ${reponse.status} ${await reponse.text()}`);
  process.exit(1);
}

const enPlus = JSON.parse(process.env.ANNUAIRE_EN_PLUS || "{}");
const annuaire = { ...Object.fromEntries((await reponse.json()).map((l) => [l.hote, l.slug])), ...enPlus };
const cible = new URL("../application/src/annuaire.genere.json", import.meta.url);
await writeFile(cible, JSON.stringify(annuaire, null, 2) + "\n");
console.log(`${Object.keys(annuaire).length} domaines écrits dans application/src/annuaire.genere.json`);
