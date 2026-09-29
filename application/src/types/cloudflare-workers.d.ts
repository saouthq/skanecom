/* Le module du runtime des Workers : l'application n'en lit que `env`, les
   liaisons du Worker (cloudflare.config.ts). */
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
