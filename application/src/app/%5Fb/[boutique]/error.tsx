"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { useSignalerErreur } from "@/components/SignalerErreur";
import { t } from "@/lib/i18n";

/* Une page de la vitrine qui casse : à ses couleurs (elle s'affiche dans le
   layout de la boutique), en français, avec deux sorties évidentes —
   réessayer, ou repartir de l'accueil. La plateforme est prévenue
   (components/SignalerErreur.ts, et le serveur l'a déjà notée). */
export default function ErreurVitrine({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useSignalerErreur(error);
  const router = useRouter();
  const reessayer = () => startTransition(() => { router.refresh(); reset(); });
  return (
    <main id="principal" className="enveloppe flex-1 section">
      <p className="etiquette"><span>{t.panne.etiquette}</span></p>
      <h1 className="text-t2 md:text-t1 mt-3 max-w-[20ch]">{t.panne.titre}</h1>
      <p className="chapo mt-4">{t.panne.texte}</p>
      <div className="flex flex-wrap gap-3 mt-8">
        <button type="button" className="btn btn-primaire" onClick={reessayer}>{t.panne.reessayer}</button>
        <Link className="btn btn-second" href="/">{t.commun.accueil}</Link>
      </div>
    </main>
  );
}
