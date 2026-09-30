// =====================================================================
// APERÇU EN LIGNE SEULEMENT (projet skanecom-apercu) — jamais en production.
//
// Installe la base de l'aperçu à partir des fichiers que lui envoie le
// workflow GitHub « Aperçu en ligne » (.github/workflows/apercu.yml) :
//   · migration : jouée une fois, notée dans supabase_migrations comme le
//     ferait `supabase db push` ;
//   · graines   : le jeu de démo, joué une fois ;
//   · script    : rejoué à chaque fois (supabase/apercu/codes-demo.sql).
// Chaque fichier dans sa transaction : une erreur n'installe rien de lui.
//
// Protégée par la clé service_role, qui ouvre déjà toute la base : le
// workflow l'a en secret (APERCU_SUPABASE_SERVICE_ROLE_KEY), personne
// d'autre. Supabase vérifie la signature du jeton avant la fonction
// (verify_jwt) ; la fonction exige le rôle service_role. La base, elle,
// est jointe par SUPABASE_DB_URL, fournie par Supabase à ses fonctions —
// aucun mot de passe à copier.
// Déployée par Claude avec le connecteur Supabase (verify_jwt).
//
// Une connexion par appel, fermée avant la réponse : le workflow fait un
// appel par fichier (une soixantaine), et chaque isolat de la fonction
// gardait la sienne ouverte — la base de l'aperçu (60 connexions, dont
// trois réservées) finissait par refuser les suivantes (30/09).
// =====================================================================
import postgres from "npm:postgres@3.4.5";

type Envoi = { genre: "migration" | "graines" | "script"; version?: string; nom: string; requete: string };

const reponse = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });

/** Le rôle du jeton : sa signature est déjà vérifiée par Supabase avant la
 *  fonction (verify_jwt) ; reste à exiger celui de la clé service_role. */
function role(autorisation: string | null): string | null {
  const jeton = autorisation?.match(/^Bearer (.+)$/)?.[1];
  const charge = jeton?.split(".")[1];
  if (!charge) return null;
  try {
    const json = atob(charge.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(charge.length / 4) * 4, "="));
    return (JSON.parse(json) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const qui = role(req.headers.get("authorization"));
  if (req.method !== "POST" || qui !== "service_role") {
    return reponse({ erreur: `refusé : la clé service_role est attendue (reçu : ${qui ?? "aucune clé lisible"})` }, 401);
  }
  let e: Envoi;
  try {
    e = (await req.json()) as Envoi;
  } catch {
    return reponse({ erreur: "envoi illisible" }, 400);
  }
  if (!["migration", "graines", "script"].includes(e.genre) || !e.nom || typeof e.requete !== "string"
      || (e.genre === "migration" && !/^\d{14}$/.test(e.version ?? ""))) {
    return reponse({ erreur: "envoi incomplet" }, 400);
  }
  const base = postgres(Deno.env.get("SUPABASE_DB_URL") ?? "", { max: 1, prepare: false, idle_timeout: 2, onnotice: () => {} });
  try {
    await base.unsafe(`
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
      create table if not exists supabase_migrations.seed_files (path text primary key, hash text not null);
    `).simple();
    if (e.genre === "migration") {
      const deja = await base`select 1 from supabase_migrations.schema_migrations where version = ${e.version!}`;
      if (deja.length) return reponse({ deja: true });
    }
    if (e.genre === "graines") {
      const deja = await base`select 1 from supabase_migrations.seed_files where path = ${e.nom}`;
      if (deja.length) return reponse({ deja: true });
    }
    await base.begin(async (tx) => {
      await tx.unsafe(e.requete).simple();
      if (e.genre === "migration") {
        await tx`insert into supabase_migrations.schema_migrations (version, name) values (${e.version!}, ${e.nom})`;
      }
      if (e.genre === "graines") {
        await tx`insert into supabase_migrations.seed_files (path, hash) values (${e.nom}, 'apercu')`;
      }
    });
    return reponse({ ok: true });
  } catch (err) {
    return reponse({ erreur: err instanceof Error ? err.message : String(err) }, 500);
  } finally {
    await base.end({ timeout: 5 }).catch(() => {});
  }
});
