import { createClient } from "@supabase/supabase-js";

/* ============================================================================
   Client Supabase de LECTURE PUBLIQUE (vitrine), pour TOUTES les boutiques.

   Clé `anon` uniquement : ce que ce client peut lire est exactement ce que la
   RLS autorise à un visiteur — produits publiés des boutiques actives, rayons
   actifs, thèmes, et les fonctions publiques (cadre, catalogue, frais).
   Chaque requête filtre en plus par boutique : la RLS protège, le filtre
   désigne.

   ⚠️ La clé de service n'est jamais lue ici : la vitrine n'a aucune raison de
   contourner la RLS.

   PANNE DE LA BASE (découverte n°7 du prototype) : par défaut, le client
   réessaie 3 fois (1 s, 2 s, 4 s) quand la base répond 503, soit 7 s
   d'attente avant l'erreur. La vitrine préfère échouer vite : la page en
   cache, ou la page de secours, prend le relais.
   ========================================================================== */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cleAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !cleAnon) {
  throw new Error(
    "Supabase n'est pas configuré : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont attendues (en local : .outils/api-locale.env)",
  );
}

export const supabase = createClient(url, cleAnon, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { retry: false, timeout: 2000 },
  global: { headers: { "x-application-name": "skanecom-vitrine" } },
});
