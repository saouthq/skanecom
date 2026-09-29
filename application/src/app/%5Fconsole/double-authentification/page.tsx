import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acces, accesEquipe, clientSession } from "@/lib/console/session";
import { FormulaireCode } from "./FormulaireCode";
import { Porte } from "@/components/console/Porte";

export const metadata: Metadata = { title: "Double authentification" };

/* ============================================================================
   LA DOUBLE AUTHENTIFICATION — obligatoire pour la console (infra §5.3) et
   pour les propriétaires et administrateurs d'une boutique (PRD B7).

   · Pas encore de facteur : on en crée un (TOTP, GoTrue) et on montre son
     QR code à scanner avec Google Authenticator, Aegis, 1Password… plus la
     clé à saisir à la main ; le premier code le valide.
   · Un facteur validé : on demande le code du moment.
   Le code valide fait passer la session en « aal2 » : la console s'ouvre.
   ========================================================================== */

export default async function DoubleAuthentification({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const a = await acces();
  if (a.etat === "anonyme") redirect("/connexion");
  if (a.etat === "ok") redirect("/");
  if (a.etat === "refuse") {
    // Pas administrateur : un membre de boutique dont le rôle l'exige passe
    // ici ; les autres vont directement à leur backoffice.
    const e = await accesEquipe();
    if (e.etat === "anonyme") redirect("/connexion");
    if (e.etat === "aucune") redirect("/refuse");
    if (e.etat === "ok") redirect("/gestion");
  }
  const { erreur } = await searchParams;

  const sb = await clientSession();
  const { data: facteurs } = await sb.auth.mfa.listFactors();
  const valide = facteurs?.totp.find((f) => f.status === "verified");

  let inscription: { id: string; qr: string; secret: string; uri: string } | null = null;
  if (!valide) {
    // Un facteur non validé d'une visite précédente ne sert plus : son QR
    // code n'est plus affichable. On repart d'un facteur neuf (le nom est
    // donc toujours libre : GoTrue le veut unique par compte).
    for (const f of facteurs?.all ?? []) {
      if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Console SkanEcom", issuer: "SkanEcom" });
    if (error || !data) throw new Error(`Double authentification indisponible : ${error?.message}`);
    inscription = { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
  }

  return (
    <Porte
      titre="Double authentification"
      qui={a.user.email}
      description={inscription
        ? "Première connexion : reliez votre compte à une application d'authentification, puis saisissez le code qu'elle affiche."
        : "Saisissez le code à six chiffres affiché par votre application d'authentification."}
      pied={
        <form action="/session/fermer" method="post">
          <button type="submit" className="btn-lien">Se déconnecter</button>
        </form>
      }
    >
      <FormulaireCode facteur={valide?.id ?? inscription?.id ?? ""} erreurInitiale={erreur}>
        {inscription ? (
          <ol className="etapes-porte">
            <li>
              <div>
                <p className="font-medium">Ajoutez SkanEcom à votre application</p>
                <p className="aide">Google Authenticator, Microsoft Authenticator, Aegis, 1Password…</p>
                {/* Sur un téléphone, on ne scanne pas son propre écran : le lien
                    otpauth:// ouvre l'application, qui enregistre le compte. */}
                <div className="seulement-tactile">
                  <a className="btn btn-primaire btn-bloc" href={inscription.uri}>Ouvrir l&apos;application d&apos;authentification</a>
                  <p className="aide mt-2">Ou, depuis un autre appareil, scannez ce code :</p>
                </div>
                <div className="qr">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={inscription.qr.startsWith("data:") ? inscription.qr : `data:image/svg+xml;utf-8,${encodeURIComponent(inscription.qr)}`}
                    alt="QR code de la double authentification"
                    width={168}
                    height={168}
                  />
                  <details className="text-center">
                    <summary className="aide cursor-pointer">Pas d&apos;appareil photo ? Saisir la clé</summary>
                    <p className="code-secret mt-2" data-secret-totp>{inscription.secret}</p>
                  </details>
                </div>
              </div>
            </li>
            <li>
              <div className="champ">
                <label htmlFor="code">Saisissez le code à six chiffres</label>
                <input id="code" name="code" className="chiffres" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                  autoComplete="one-time-code" required autoFocus placeholder="000000" />
              </div>
            </li>
          </ol>
        ) : (
          <div className="champ">
            <label htmlFor="code">Code à six chiffres</label>
            <input id="code" name="code" className="chiffres" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
              autoComplete="one-time-code" required autoFocus placeholder="000000" />
          </div>
        )}
      </FormulaireCode>
    </Porte>
  );
}
