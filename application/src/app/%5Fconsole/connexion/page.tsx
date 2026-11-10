// La feuille de la console : ici, pas dans le layout racine (voir ../layout.tsx).
import "../feuille.css";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acces, accesEquipe } from "@/lib/console/session";
import { Porte } from "@/components/console/Porte";
import { ChampMotDePasse } from "@/components/console/ChampMotDePasse";
import { LienOublie } from "@/components/console/LienOublie";
import { suiteSure } from "@/lib/console/suite";

export const metadata: Metadata = { title: "Connexion" };

/* La porte commune de la console et du backoffice des boutiques. Un
   formulaire HTML ordinaire : il marche sans JavaScript, et le mot de passe ne
   transite que par un POST vers /session. */
export default async function Connexion({ searchParams }: { searchParams: Promise<{ erreur?: string; email?: string; info?: string; suite?: string; geste?: string }> }) {
  const a = await acces();
  if (a.etat === "ok") redirect("/");
  if (a.etat === "aal1") redirect("/double-authentification");
  if (a.etat === "refuse") {
    const e = await accesEquipe();
    if (e.etat === "ok") redirect("/gestion");
    if (e.etat === "aal1") redirect("/double-authentification");
  }
  const { erreur, email, info, suite: suiteBrute, geste } = await searchParams;
  // Une session qui a pris fin : on le dit, et l'on reviendra où l'on était.
  const suite = suiteSure(suiteBrute);

  return (
    <Porte
      titre="Connexion"
      description="Le backoffice de votre boutique, ou la console de la plateforme."
      pied={<>Un second facteur (un code de votre téléphone) peut protéger votre compte : il vous est proposé à la connexion, et exigé si votre boutique ou SkanEcom le demande.</>}
    >
      <form action="/session/ouvrir" method="post" className="carte porte-carte formulaire">
        {erreur ? <p className="message message-erreur" role="alert">{erreur}</p> : null}
        {info && !erreur ? <p className="message message-succes" role="status">{info}</p> : null}
        {suite && !erreur ? (
          <p className="message message-attention" role="status">
            {geste
              ? "Votre session a pris fin : votre dernier geste n'a pas été enregistré. Reconnectez-vous, vous reviendrez sur la même page pour le refaire."
              : "Votre session a pris fin. Reconnectez-vous : vous reviendrez sur la même page."}
          </p>
        ) : null}
        {suite ? <input type="hidden" name="suite" value={suite} /> : null}
        <div className="champ">
          <label htmlFor="email">Adresse e-mail</label>
          <input id="email" name="email" type="email" autoComplete="username" required defaultValue={email ?? ""} autoFocus={!email} placeholder="prenom@exemple.tn" />
        </div>
        {/* « Mot de passe oublié ? » s'affiche dans la rangée du libellé, mais vient
            après le champ au clavier : Tab mène de l'adresse au mot de passe. */}
        <div className="champ champ-avec-lien">
          <label htmlFor="mot_de_passe">Mot de passe</label>
          {/* Après un refus, l'adresse est déjà là : c'est le mot de passe qu'on retape. */}
          <ChampMotDePasse id="mot_de_passe" name="mot_de_passe" autoComplete="current-password" autoFocus={Boolean(email)} />
          <LienOublie email={email} />
        </div>
        <button type="submit" className="btn btn-primaire btn-bloc btn-grand">Se connecter</button>
      </form>
    </Porte>
  );
}
