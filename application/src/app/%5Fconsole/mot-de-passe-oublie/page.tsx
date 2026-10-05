// La feuille de la console : ici, pas dans le layout racine (voir ../layout.tsx).
import "../feuille.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Porte } from "@/components/console/Porte";

export const metadata: Metadata = { title: "Mot de passe oublié" };

/* Demander un lien pour choisir un nouveau mot de passe. La réponse est la
   même que l'adresse ait un compte ou non (on ne dit jamais qui est inscrit) ;
   le lien mène à /bienvenue, comme celui qu'un administrateur remet. */
export default async function MotDePasseOublie({ searchParams }: { searchParams: Promise<{ envoye?: string; email?: string; erreur?: string }> }) {
  const { envoye, email, erreur } = await searchParams;
  return (
    <Porte
      titre="Mot de passe oublié"
      description="Votre adresse e-mail : un lien vous permettra d'en choisir un nouveau."
      pied={envoye ? undefined : <Link href="/connexion" className="btn-lien">Retour à la connexion</Link>}
    >
      {envoye ? (
        <div className="carte porte-carte formulaire">
          <p className="message message-succes" role="status">
            {/* (un seul bloc de texte : le message aligne son icône et son texte en ligne) */}
            <span>Si un compte existe pour {email ? <b>{email}</b> : "cette adresse"}, un lien vient de partir. Il ne sert qu&apos;une fois : ouvrez-le sans tarder.</span>
          </p>
          <p className="aide">Rien reçu après quelques minutes ? Regardez les courriers indésirables, ou demandez un lien à l&apos;administrateur de votre boutique.</p>
          <Link href="/connexion" className="btn btn-second btn-bloc">Retour à la connexion</Link>
        </div>
      ) : (
        <form action="/mot-de-passe-oublie/envoyer" method="post" className="carte porte-carte formulaire">
          {erreur ? <p className="message message-erreur" role="alert">{erreur}</p> : null}
          <div className="champ">
            <label htmlFor="email">Adresse e-mail</label>
            <input id="email" name="email" type="email" autoComplete="username" required defaultValue={email ?? ""} autoFocus placeholder="prenom@exemple.tn" />
          </div>
          <button type="submit" className="btn btn-primaire btn-bloc btn-grand">Recevoir le lien</button>
        </form>
      )}
    </Porte>
  );
}
