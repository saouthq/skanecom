import type { Metadata } from "next";
import Link from "next/link";
import { clientSession } from "@/lib/console/session";
import { LONGUEUR_MOT_DE_PASSE } from "@/lib/console/equipe";

export const metadata: Metadata = { title: "Bienvenue" };

/* ============================================================================
   LE LIEN D'ACCÈS (console C4) — la personne invitée choisit son mot de passe.

   Ouvrir le lien ne consomme rien : la page affiche le formulaire, le jeton
   n'est vérifié qu'à son envoi (POST /bienvenue/valider). L'aperçu que
   WhatsApp fabrique en visitant le lien ne le grille donc pas.
   ========================================================================== */
export default async function Bienvenue({ searchParams }: {
  searchParams: Promise<{ jeton?: string; type?: string; e?: string; erreur?: string; perime?: string; reprise?: string }>;
}) {
  const p = await searchParams;
  const { data } = await (await clientSession()).auth.getUser();
  const connecte = data.user;
  const reprise = p.reprise === "1" && connecte;
  const type = p.type === "recovery" ? "recovery" : "invite";
  const utilisable = Boolean(reprise || (p.jeton && !p.perime));
  const email = reprise ? (connecte.email ?? "") : (p.e ?? "");

  return (
    <main id="principal" className="flex-1 grid place-items-center px-4 py-12">
      <div className="w-full max-w-[26rem]">
        <p className="text-petit text-encre-doux">SkanEcom</p>
        {!utilisable ? (
          <>
            <h1 className="mt-1">Ce lien ne marche plus</h1>
            <p className="text-encre-doux mt-2">
              {p.perime
                ? "Il a déjà servi, ou il a expiré (un lien d'accès vaut 24 heures). Demandez-en un nouveau à la personne qui vous l'a envoyé."
                : "Il est incomplet : ouvrez-le tel qu'il vous a été envoyé, ou demandez-en un nouveau."}
            </p>
            <p className="mt-6"><Link href="/connexion" className="btn btn-second">J&apos;ai déjà mon mot de passe</Link></p>
          </>
        ) : (
          <>
            <h1 className="mt-1">{type === "invite" && !reprise ? "Bienvenue" : "Nouveau mot de passe"}</h1>
            <p className="text-encre-doux mt-2">
              {type === "invite" && !reprise
                ? "Choisissez votre mot de passe : il vous servira à entrer dans le backoffice de votre boutique."
                : "Choisissez votre nouveau mot de passe pour le backoffice de votre boutique."}
            </p>
            {connecte && !reprise && connecte.email !== email ? (
              <p className="message mt-4 text-petit">
                Vous êtes connecté avec {connecte.email} sur cet appareil : ce lien ouvrira la session de {email || "la personne invitée"} à la place.
              </p>
            ) : null}

            <form action="/bienvenue/valider" method="post" className="carte formulaire mt-6">
              {p.erreur ? <p className="message message-erreur" role="alert">{p.erreur}</p> : null}
              {reprise ? <input type="hidden" name="reprise" value="1" /> : (
                <>
                  <input type="hidden" name="jeton" value={p.jeton} />
                  <input type="hidden" name="type" value={type} />
                </>
              )}
              <div className="champ">
                <label htmlFor="email">Votre identifiant</label>
                <input id="email" name="e" type="email" autoComplete="username" readOnly value={email} />
              </div>
              <div className="champ">
                <label htmlFor="mot_de_passe">Mot de passe</label>
                <input id="mot_de_passe" name="mot_de_passe" type="password" autoComplete="new-password" required
                  minLength={LONGUEUR_MOT_DE_PASSE} aria-describedby="aide-mdp" autoFocus />
                <p className="aide" id="aide-mdp">{LONGUEUR_MOT_DE_PASSE} caractères au moins. Une phrase courte se retient mieux qu&apos;un mot compliqué.</p>
              </div>
              <div className="champ">
                <label htmlFor="confirmation">Le même, une seconde fois</label>
                <input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={LONGUEUR_MOT_DE_PASSE} />
              </div>
              <button type="submit" className="btn btn-primaire btn-bloc">Enregistrer et entrer</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
