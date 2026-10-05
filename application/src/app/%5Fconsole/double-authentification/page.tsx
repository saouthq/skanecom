// La feuille de la console : ici, pas dans le layout racine (voir ../layout.tsx).
import "../feuille.css";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ROLES_AAL2, acces, accesEquipe, clientSession } from "@/lib/console/session";
import { COOKIE_PLUS_TARD, retourCompte } from "@/lib/console/compte";
import { FormulaireCode } from "./FormulaireCode";
import { Porte } from "@/components/console/Porte";

export const metadata: Metadata = { title: "Double authentification" };

/* ============================================================================
   LA DOUBLE AUTHENTIFICATION — exigée si un réglage le veut (celui de la
   plateforme pour son équipe, celui d'une boutique pour ses propriétaires
   et administrateurs), et toujours de qui a enregistré une application.
   Sinon elle est PROPOSÉE à la connexion : « Plus tard » la reporte (un
   mois, cookie), « Mon compte » l'active quand on veut (?activer=1).

   · Pas encore de facteur : on en crée un (TOTP, GoTrue) et on montre son
     QR code à scanner avec Google Authenticator, Aegis, 1Password… plus la
     clé à saisir à la main ; le premier code le valide.
   · Un facteur validé : on demande le code du moment.
   Le code valide fait passer la session en « aal2 » : la console s'ouvre.
   ========================================================================== */

export default async function DoubleAuthentification({ searchParams }: {
  searchParams: Promise<{ erreur?: string; secours?: string; remplace?: string; activer?: string; retour?: string }>;
}) {
  const { erreur, secours, remplace, activer, retour: retourBrut } = await searchParams;
  // Activée de son plein gré, depuis « Mon compte » : on y revient.
  const retour = activer ? retourCompte(retourBrut) : null;
  const a = await acces();
  if (a.etat === "anonyme") redirect("/connexion");
  // Où l'on va ensuite : la console, ou le backoffice.
  let suite = "/";
  // Tenu de l'avoir (aal1) : pas de « Plus tard ». Sinon, elle est proposée.
  let tenu = a.etat === "aal1";
  if (a.etat === "refuse") {
    const e = await accesEquipe();
    if (e.etat === "anonyme") redirect("/connexion");
    if (e.etat === "aucune") redirect("/refuse");
    suite = "/gestion";
    tenu = e.etat === "aal1";
    // Proposée à qui a la main sur une boutique ; aux autres, seulement s'ils la demandent.
    if (e.etat === "ok" && !activer && !e.boutiques.some((b) => ROLES_AAL2.includes(b.role))) redirect("/gestion");
  }
  if (!tenu) {
    // Déjà en double authentification, ou reportée (« Plus tard ») : rien à proposer.
    const sb0 = await clientSession();
    const { data: niveau } = await sb0.auth.mfa.getAuthenticatorAssuranceLevel();
    const reportee = (await cookies()).get(COOKIE_PLUS_TARD)?.value === a.user.id;
    if (niveau?.currentLevel === "aal2" || niveau?.nextLevel === "aal2" || (reportee && !activer)) redirect(retour ?? suite);
  }

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

  // Après un code de secours : combien il en reste (s'il n'en reste plus
  // beaucoup, la personne le sait avant d'en avoir besoin).
  let restants: number | null = null;
  if (remplace && inscription) {
    const { data } = await sb.rpc("compte_codes_secours");
    restants = (data as { restants?: number } | null)?.restants ?? null;
  }

  return (
    <Porte
      titre="Double authentification"
      qui={a.user.email}
      description={remplace && inscription
        ? "Enregistrez maintenant votre nouvelle application, puis saisissez le code qu'elle affiche."
        : inscription && retour
          ? "Reliez votre compte à une application d'authentification, puis saisissez le code qu'elle affiche. Il vous sera ensuite demandé à chaque connexion."
        : inscription && !tenu
          ? "Conseillée : avec elle, un mot de passe volé ne suffit plus pour entrer. Reliez votre compte à une application d'authentification, puis saisissez le code qu'elle affiche."
          : inscription
            ? "Exigée pour votre compte : reliez-le à une application d'authentification, puis saisissez le code qu'elle affiche."
            : "Saisissez le code à six chiffres affiché par votre application d'authentification."}
      pied={
        <form action="/session/fermer" method="post">
          <button type="submit" className="btn-lien">Se déconnecter</button>
        </form>
      }
    >
      <FormulaireCode facteur={valide?.id ?? inscription?.id ?? ""} erreurInitiale={secours ? undefined : erreur}>
        {retour ? <input type="hidden" name="retour" value={retour} /> : null}
        {remplace && inscription ? (
          <p className="message message-succes" role="status">
            Code de secours accepté.{restants !== null ? ` Il vous en reste ${restants} : ${restants <= 3 ? "pensez à les remplacer dans « Mon compte »." : "chacun ne sert qu'une fois."}` : ""}
          </p>
        ) : null}
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
                  autoComplete="one-time-code" required autoFocus={!secours} placeholder="000000" />
              </div>
            </li>
          </ol>
        ) : (
          <div className="champ">
            <label htmlFor="code">Code à six chiffres</label>
            <input id="code" name="code" className="chiffres" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
              autoComplete="one-time-code" required autoFocus={!secours} placeholder="000000" />
          </div>
        )}
      </FormulaireCode>
      {inscription && !tenu && !remplace ? (
        retour ? (
          <a href={retour} className="btn btn-second btn-bloc ds-plus-tard">Annuler</a>
        ) : (
          <form action="/double-authentification/plus-tard" method="post" className="ds-plus-tard">
            <button type="submit" className="btn btn-second btn-bloc">Plus tard</button>
            <p className="aide">Vous l&apos;activerez quand vous voudrez, depuis « Mon compte ».</p>
          </form>
        )
      ) : null}
      {valide ? (
        <details className="carte porte-carte ds-secours" open={Boolean(secours)}>
          <summary>Téléphone perdu ? Utiliser un code de secours</summary>
          <form action="/double-authentification/secours" method="post" className="formulaire">
            {secours && erreur ? <p className="message message-erreur" role="alert">{erreur}</p> : null}
            <div className="champ">
              <label htmlFor="code_secours">Un de vos dix codes de secours</label>
              <input id="code_secours" name="code_secours" className="chiffres" required autoComplete="off" autoCapitalize="characters"
                spellCheck={false} placeholder="K7Q2M-9XR4T" autoFocus={Boolean(secours)} />
              <p className="aide">Il ne servira qu&apos;une fois ; vous enregistrerez ensuite votre nouvelle application. Pas de codes ? Un super-administrateur SkanEcom réinitialise votre double authentification.</p>
            </div>
            <button type="submit" className="btn btn-second btn-bloc">Utiliser ce code</button>
          </form>
        </details>
      ) : null}
    </Porte>
  );
}
