"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { startTransition } from "react";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { useSignalerErreur } from "@/components/SignalerErreur";

/* ============================================================================
   UN ÉCRAN DU BACKOFFICE QUI CASSE — dans la coquille de la boutique (le menu
   reste), en français. L'équipe SkanEcom la voit déjà dans sa console : le
   commerçant n'a rien à signaler, il réessaie ou reprend ailleurs.
   ========================================================================== */

export default function ErreurBackoffice({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useSignalerErreur(error);
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const reessayer = () => startTransition(() => { router.refresh(); reset(); });
  return (
    <>
      <EnTetePage titre="Cette page n'a pas pu s'afficher" />
      <div className="vide introuvable-bo" role="alert">
        <span className="vide-icone"><Icone nom="alerte" taille={20} /></span>
        <strong>Rien n&apos;est perdu</strong>
        <p>
          Une erreur a interrompu l&apos;affichage ; ce qui était enregistré l&apos;est toujours. L&apos;équipe SkanEcom en est
          prévenue{error.digest ? <> (référence <code className="err-ref">{error.digest}</code>)</> : null}. Réessayez dans un instant.
        </p>
        <div className="introuvable-bo-actions">
          <button type="button" className="btn btn-primaire" onClick={reessayer}><Icone nom="refaire" /> Réessayer</button>
          <Link className="btn btn-second" href={`/gestion/${slug}/aujourdhui`}>Revenir à Aujourd&apos;hui</Link>
        </div>
      </div>
    </>
  );
}
