import type { NextConfig } from "next";

/* Les photos, logos et monogrammes vivent sur R2, sous le dossier de chaque
   boutique (NEXT_PUBLIC_FICHIERS_URL : le domaine public du bucket en
   production, le relais local en développement). Sans cette autorisation,
   `next/image` refuserait l'hôte. L'hôte est déduit de l'adresse : aucune
   valeur en dur, aucun secret. */
const fichiers = process.env.NEXT_PUBLIC_FICHIERS_URL ? new URL(process.env.NEXT_PUBLIC_FICHIERS_URL) : null;

/* En développement, les fichiers viennent du relais local (127.0.0.1) :
   l'optimiseur d'images refuse par défaut une adresse privée, à juste titre
   (risque de SSRF). On ne l'autorise QUE dans ce cas ; en production, les
   fichiers sont sur le domaine public de R2. */
const fichiersLocaux = fichiers !== null && ["127.0.0.1", "localhost"].includes(fichiers.hostname);

const nextConfig: NextConfig = {
  images: {
    ...(fichiersLocaux ? { dangerouslyAllowLocalIP: true } : {}),
    remotePatterns: fichiers
      ? [
          {
            protocol: fichiers.protocol.replace(":", "") as "http" | "https",
            hostname: fichiers.hostname,
            ...(fichiers.port ? { port: fichiers.port } : {}),
            pathname: `${fichiers.pathname.replace(/\/$/, "")}/**`,
          },
        ]
      : [],
  },
};

export default nextConfig;
