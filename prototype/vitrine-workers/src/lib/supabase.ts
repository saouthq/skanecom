import { createClient } from "@supabase/supabase-js";

/* ============================================================================
   Client Supabase de LECTURE PUBLIQUE (vitrine).

   Clé `anon` uniquement : ce que ce client peut lire est exactement ce que les
   policies RLS d'Iris autorisent à un visiteur — produits publiés, variantes
   actives, catégories actives, réglages marqués `public`. Rien d'autre ne peut
   fuiter, même en cas de bug de requête.

   ⚠️ La clé de service (`SUPABASE_SERVICE_ROLE_KEY`) n'est PAS lue ici et ne
   doit jamais l'être : la vitrine n'a aucune raison de contourner RLS.
   ========================================================================== */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cleAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !cleAnon) {
  throw new Error(
    "Supabase n'est pas configuré : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont attendues dans .env.local",
  );
}

export const supabase = createClient(url, cleAnon, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { "x-application-name": "maymar-vitrine" } },
});
