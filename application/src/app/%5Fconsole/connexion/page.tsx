// La feuille de la console : ici, pas dans le layout racine (voir ../layout.tsx).
import "../feuille.css";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acces, accesEquipe } from "@/lib/console/session";
import { Porte } from "@/components/console/Porte";
import { ChampMotDePasse } from "@/components/console/ChampMotDePasse";
import { LienOublie } from "@/components/console/LienOublie";

export const metadata: Metadata = { title: "Connexion" };

/* La porte commune de la console et du backoffice des boutiques. Un
   formulaire HTML ordinaire : il marche sans JavaScript, et le mot de passe ne
   transite que par un POST vers /session. */
export default async function Connexion({ searchParams }: { searchParams: Promise<{ erreur?: string; email?: string; info?: string }> }) {
  const a = await acces();
  if (a.etat === "ok") redirect("/");
  if (a.etat === "aal1") redirect("/double-authentification");
  if (a.etat === "refuse") {
    const e = await accesEquipe();
    if (e.etat === "ok") redirect("/gestion");
    if (e.etat === "aal1") redirect("/double-authentification");
  }
  const { erreur, email, info } = await searchParams;

  return (
    <Porte
      titre="Connexion"
      description="Le backoffice de votre boutique, ou la console de la plateforme."
      pied={<>Propriétaires et administrateurs confirment leur connexion par double authentification.</>}
    >
      <form action="/session/ouvrir" method="post" className="carte porte-carte formulaire">
        {erreur ? <p className="message message-erreur" role="alert">{erreur}</p> : null}
        {info && !erreur ? <p className="message message-succes" role="status">{info}</p> : null}
        <div className="champ">
          <label htmlFor="email">Adresse e-mail</label>
          <input id="email" name="email" type="email" autoComplete="username" required defaultValue={email ?? ""} autoFocus={!email} placeholder="prenom@exemple.tn" />
        </div>
        <div className="champ">
          <div className="champ-tete">
            <label htmlFor="mot_de_passe">Mot de passe</label>
            <LienOublie email={email} />
          </div>
          {/* Après un refus, l'adresse est déjà là : c'est le mot de passe qu'on retape. */}
          <ChampMotDePasse id="mot_de_passe" name="mot_de_passe" autoComplete="current-password" autoFocus={Boolean(email)} />
        </div>
        <button type="submit" className="btn btn-primaire btn-bloc btn-grand">Se connecter</button>
      </form>
    </Porte>
  );
}
