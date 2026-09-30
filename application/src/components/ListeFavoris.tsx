"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { Coeur } from "./Icones";
import { fusionneFavoris, useFavoris } from "@/lib/favoris";
import { t } from "@/lib/i18n";

/* ============================================================================
   « MES FAVORIS », côté navigateur — la page est rendue par le serveur
   d'après son adresse (/favoris?s=slug,slug…), avec les cartes du
   catalogue ; ce composant tient l'adresse à jour de la liste du navigateur
   (un cœur retiré : la carte s'en va), fusionne une fois la liste du compte
   (cliente connectée, autre appareil), et dit quoi faire quand elle est vide.
   ========================================================================== */

const hydrate = () => () => {};

export function ListeFavoris({ demandes, children }: { demandes: string[]; children: React.ReactNode }) {
  const liste = useFavoris();
  const pret = useSyncExternalStore(hydrate, () => true, () => false);
  const routeur = useRouter();
  const voulu = liste.slice(0, 60).join(",");

  // Le compte, une fois par visite : ses favoris rejoignent ceux du navigateur.
  useEffect(() => {
    void fusionneFavoris();
  }, []);

  useEffect(() => {
    if (!pret || voulu === demandes.join(",")) return;
    routeur.replace(voulu ? `/favoris?s=${voulu}` : "/favoris", { scroll: false });
  }, [pret, voulu, demandes, routeur]);

  if (pret && liste.length === 0) {
    return (
      <div className="favoris-vide">
        <span className="favoris-vide-icone" aria-hidden="true"><Coeur taille={22} /></span>
        <p className="favoris-vide-titre">{t.favoris.videTitre}</p>
        <p className="legende">{t.favoris.videTexte}</p>
        <Link className="btn btn-primaire" href="/catalogue">{t.favoris.catalogue}</Link>
      </div>
    );
  }
  return <>{children}</>;
}
