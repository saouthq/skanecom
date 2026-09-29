"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ============================================================================
   Le client Supabase DU NAVIGATEUR, pour une seule chose : la connexion de
   l'acheteur par code SMS (GoTrue), sur le domaine de la boutique.

   Pourquoi dans le navigateur et pas sur le serveur : les limites de GoTrue
   (codes envoyés, essais de code) se comptent par adresse IP. Passés par le
   Worker, tous les acheteurs auraient la même — et le premier pic de
   commandes bloquerait tout le monde.

   La session est rangée dans des cookies du domaine (@supabase/ssr) : les
   gestionnaires de la commande la relisent côté serveur. Créé à la première
   demande seulement, jamais pendant le rendu serveur.
   ========================================================================== */

let client: SupabaseClient | null = null;

export function supabaseNavigateur(): SupabaseClient {
  client ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { "x-application-name": "skanecom-vitrine" } },
  });
  return client;
}
