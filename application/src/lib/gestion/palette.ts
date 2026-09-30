import type { NomIcone } from "@/components/console/Icone";

/** Une ligne de la palette (⌘K) : une page où aller, ou ce que la recherche
 *  a trouvé (gestion/[slug]/palette/route.ts). */
export type ElementPalette = { groupe: string; icone: NomIcone; href: string; titre: string; detail?: string };
