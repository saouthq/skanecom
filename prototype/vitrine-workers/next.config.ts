import type { NextConfig } from "next";

/* Les photos produit vivront dans Supabase Storage (table `produit_images`).
   Sans cette autorisation, `next/image` refuserait l'hôte et l'image ne
   s'afficherait pas — le jour du premier versement de photos, il n'y aura
   rien à chercher. L'hôte est déduit de l'URL du projet : aucune valeur en
   dur, aucun secret (l'URL est déjà publique côté navigateur). */
const hoteSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: hoteSupabase
      ? [{ protocol: "https", hostname: hoteSupabase, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
};

export default nextConfig;
