import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acces, clientSession } from "@/lib/console/session";
import { FormulaireCode } from "./FormulaireCode";

export const metadata: Metadata = { title: "Double authentification" };

/* ============================================================================
   LA DOUBLE AUTHENTIFICATION — obligatoire pour la console (infra §5.3).

   · Pas encore de facteur : on en crée un (TOTP, GoTrue) et on montre son
     QR code à scanner avec Google Authenticator, Aegis, 1Password… plus la
     clé à saisir à la main ; le premier code le valide.
   · Un facteur validé : on demande le code du moment.
   Le code valide fait passer la session en « aal2 » : la console s'ouvre.
   ========================================================================== */

export default async function DoubleAuthentification({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const a = await acces();
  if (a.etat === "anonyme") redirect("/connexion");
  if (a.etat === "refuse") redirect("/refuse");
  if (a.etat === "ok") redirect("/");
  const { erreur } = await searchParams;

  const sb = await clientSession();
  const { data: facteurs } = await sb.auth.mfa.listFactors();
  const valide = facteurs?.totp.find((f) => f.status === "verified");

  let inscription: { id: string; qr: string; secret: string } | null = null;
  if (!valide) {
    // Un facteur non validé d'une visite précédente ne sert plus : son QR
    // code n'est plus affichable. On repart d'un facteur neuf (le nom est
    // donc toujours libre : GoTrue le veut unique par compte).
    for (const f of facteurs?.all ?? []) {
      if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Console SkanEcom", issuer: "SkanEcom" });
    if (error || !data) throw new Error(`Double authentification indisponible : ${error?.message}`);
    inscription = { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  }

  return (
    <main id="principal" className="flex-1 grid place-items-center px-4 py-12">
      <div className="w-full max-w-[30rem]">
        <p className="text-petit text-encre-doux">{a.user.email}</p>
        <h1 className="mt-1">Double authentification</h1>

        <FormulaireCode facteur={valide?.id ?? inscription?.id ?? ""} erreurInitiale={erreur}>

          {inscription ? (
            <>
              <p>
                Première connexion : scannez ce code avec votre application d&apos;authentification
                (Google Authenticator, Aegis, 1Password…), puis saisissez le code à six chiffres qu&apos;elle affiche.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={inscription.qr.startsWith("data:") ? inscription.qr : `data:image/svg+xml;utf-8,${encodeURIComponent(inscription.qr)}`}
                alt="QR code de la double authentification"
                width={200}
                height={200}
                className="mx-auto bg-surface p-2 border border-filet rounded-doux"
              />
              <div>
                <p className="aide">Sans appareil photo, saisissez cette clé dans l&apos;application :</p>
                <p className="code-secret mt-1" data-secret-totp>{inscription.secret}</p>
              </div>
            </>
          ) : (
            <p>Saisissez le code à six chiffres affiché par votre application d&apos;authentification.</p>
          )}

          <div className="champ">
            <label htmlFor="code">Code à six chiffres</label>
            <input id="code" name="code" className="chiffres" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
              autoComplete="one-time-code" required autoFocus />
          </div>
        </FormulaireCode>

        <form action="/session/fermer" method="post" className="mt-4 text-center">
          <button type="submit" className="btn-lien text-petit">Se déconnecter</button>
        </form>
      </div>
    </main>
  );
}
