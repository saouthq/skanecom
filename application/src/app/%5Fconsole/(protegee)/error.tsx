"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { useSignalerErreur } from "@/components/SignalerErreur";

/* ============================================================================
   UN ÉCRAN DE LA CONSOLE QUI CASSE — dans la coquille (la navigation reste),
   en français, au lieu de la page anglaise par défaut. L'erreur est déjà
   notée (État technique → Erreurs de l'application) ; sa référence (digest)
   permet de la retrouver. « Réessayer » relit l'écran depuis le serveur.
   ========================================================================== */

export default function ErreurConsole({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useSignalerErreur(error);
  const router = useRouter();
  const reessayer = () => startTransition(() => { router.refresh(); reset(); });
  return (
    <>
      <EnTetePage titre="Cet écran n'a pas pu s'afficher" />
      <div className="vide introuvable-bo" role="alert">
        <span className="vide-icone"><Icone nom="alerte" taille={20} /></span>
        <strong>Une erreur l&apos;a arrêté</strong>
        <p>
          Elle est notée dans État technique → Erreurs de l&apos;application{error.digest ? <>, sous la référence <code className="err-ref">{error.digest}</code></> : null}.
          Réessayez : si elle revient, elle y est déjà, avec la boutique et l&apos;écran.
        </p>
        <div className="introuvable-bo-actions">
          <button type="button" className="btn btn-primaire" onClick={reessayer}><Icone nom="refaire" /> Réessayer</button>
          <Link className="btn btn-second" href="/etat#t-erreurs">Voir les erreurs</Link>
        </div>
      </div>
    </>
  );
}
