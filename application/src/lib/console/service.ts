import { createClient } from "@supabase/supabase-js";

/* ============================================================================
   LE CLIENT DE SERVICE DE LA CONSOLE — clé service_role, côté serveur.

   Il contourne la RLS : c'est voulu (les administrateurs de la plateforme
   n'ont aucun droit par la RLS). En échange, la console n'appelle que les
   fonctions `public.console_*` (supabase/migrations/…_console.sql), qui
   revérifient l'administrateur et tracent chaque écriture dans
   plateforme.journal_audit — avec l'adresse IP, transmise ici.

   La clé est un SECRET du Worker (jamais NEXT_PUBLIC_, jamais dans le
   paquet) : lue à l'exécution, et seulement par ce fichier, qui n'est
   importé que par la console. La vitrine ne l'utilise jamais.
   ========================================================================== */

export function clientService(ip?: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) {
    throw new Error("Console : SUPABASE_SERVICE_ROLE_KEY n'est pas configurée (secret du Worker ; en local : application/.dev.vars)");
  }
  return createClient(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "skanecom-console", "x-console-ip": ip ?? "" } },
  });
}
