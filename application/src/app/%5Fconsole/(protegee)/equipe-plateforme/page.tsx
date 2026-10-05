import type { Metadata } from "next";
import { cookies } from "next/headers";
import { EnTetePage, initiales, styleAvatar } from "@/components/console/Coquille";
import { BoutonCopier } from "@/components/console/BoutonCopier";
import { Icone } from "@/components/console/Icone";
import { Confirmation } from "@/components/console/Confirmation";
import { dateJournal } from "@/lib/console/libelles";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { COOKIE_LIEN_ADMIN, LIBELLES_ROLE_PLATEFORME, ROLES_PLATEFORME, type AdministrateurPlateforme } from "@/lib/console/equipe-plateforme";

export const metadata: Metadata = { title: "Équipe SkanEcom" };

/* ============================================================================
   L'ÉQUIPE SKANECOM — qui entre dans la console, avec quel rôle, sa double
   authentification, sa dernière connexion. Un super-administrateur invite,
   change un rôle, retire ; le support lit cette page sans rien y changer.
   ========================================================================== */
export default async function EquipePlateforme({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string; email?: string; role?: string; carte?: string }> }) {
  const { user, role: monRole } = await exigeAdmin();
  const v = await searchParams;
  const [{ data, error }, { data: exigee }] = await Promise.all([
    clientService().rpc("console_administrateurs", { p_acteur: user.id }),
    clientService().rpc("console_double_auth_exigee"),
  ]);
  const obligatoire = exigee === true;
  // Le retour du réglage de la double authentification s'affiche dans sa carte.
  const dansSecurite = v.carte === "securite";
  if (error) throw new Error(`Équipe illisible : ${error.message}`);
  const equipe = (data ?? []) as AdministrateurPlateforme[];
  const peutModifier = monRole === "super_admin";
  let lien: { email: string; lien: string } | null = null;
  try {
    const brut = (await cookies()).get(COOKIE_LIEN_ADMIN)?.value;
    lien = brut ? JSON.parse(decodeURIComponent(brut)) : null;
  } catch { lien = null; }
  // Le lien d'une invitation retirée, ou déjà acceptée, ne se montre plus.
  if (lien && !equipe.some((a) => a.email === lien?.email && !a.confirme)) lien = null;
  const sansDoubleAuth = equipe.filter((a) => !a.double_auth && a.confirme).length;
  const enAttente = equipe.filter((a) => !a.confirme).length;
  const etat = [
    sansDoubleAuth ? `${sansDoubleAuth} sans double authentification active : ${obligatoire ? "elle leur sera demandée à la prochaine connexion" : "elle leur est proposée à chaque connexion"}` : null,
    enAttente ? `${enAttente} invitation${enAttente > 1 ? "s" : ""} en attente` : null,
  ].filter(Boolean).join(" ; ");

  return (
    <>
      <EnTetePage titre="Équipe SkanEcom" description={`Qui entre dans la console, et comment. ${obligatoire ? "Tous passent par la double authentification" : "La double authentification est proposée à chacun"} ; le support aide sans engager les boutiques.`} />
      {v.ok && !dansSecurite ? <p className="message message-succes" role="status">{v.ok}</p> : null}
      {v.erreur && !dansSecurite ? <p className="message message-erreur" role="alert">{v.erreur}</p> : null}
      {lien ? (
        <section className="carte ep-lien" aria-labelledby="t-lien">
          <h2 id="t-lien" className="carte-titre-icone"><Icone nom="lien" /> Le lien pour {lien.email}</h2>
          <p className="aide">Valable 24 heures, à usage unique. Envoyez-le par e-mail (au nom de SkanEcom), par WhatsApp ou de vive voix ; personne d&apos;autre ne doit l&apos;ouvrir.</p>
          <div className="ep-lien-ligne">
            <code className="md-code">{lien.lien}</code>
            <BoutonCopier texte={lien.lien} libelle="Copier le lien" />
            <form action="/equipe-plateforme/envoyer-lien" method="post">
              <button type="submit" className="btn btn-second"><Icone nom="courriel" taille={15} /> Envoyer par e-mail</button>
            </form>
          </div>
        </section>
      ) : null}

      <div className="grille-2">
        <section className="carte carte-plate" aria-labelledby="t-equipe-plateforme">
          <div className="carte-tete">
            <div>
              <h2 id="t-equipe-plateforme" className="carte-titre-icone"><Icone nom="equipe" /> {equipe.length} personne{equipe.length > 1 ? "s" : ""}</h2>
              <p>{etat ? `${etat.charAt(0).toUpperCase()}${etat.slice(1)}.` : "Toutes en double authentification."}</p>
            </div>
          </div>
          <ul className="ep-liste" role="list">
            {equipe.map((a) => (
              <li key={a.user_id}>
                <span className="avatar" style={styleAvatar(a.email)} aria-hidden="true">{initiales(a.email)}</span>
                <span className="ep-qui">
                  <b>{a.email}{a.vous ? <span className="discret"> · vous</span> : null}</b>
                  <span className="aide">
                    {LIBELLES_ROLE_PLATEFORME[a.role] ?? a.role} ·{" "}
                    {!a.confirme ? "invitation en attente" : (
                      <>
                        {a.double_auth ? <span className="ep-ok"><Icone nom="bouclier" taille={12} /> double authentification</span> : <span className="ep-manque">sans double authentification</span>} ·{" "}
                        {a.derniere_connexion ? `vu ${dateJournal(a.derniere_connexion)}` : "jamais connecté"}
                      </>
                    )}
                  </span>
                </span>
                {peutModifier && !a.vous ? (
                  <form action="/equipe-plateforme/changer" method="post" className="ep-gestes">
                    <input type="hidden" name="user_id" value={a.user_id} />
                    <label className="sr-only" htmlFor={`ep-role-${a.user_id}`}>Rôle de {a.email}</label>
                    <select id={`ep-role-${a.user_id}`} className="entree" name="role" defaultValue={a.role}>
                      {ROLES_PLATEFORME.map((r) => <option key={r.code} value={r.code}>{r.titre}</option>)}
                    </select>
                    <button type="submit" name="geste" value="role" className="btn btn-second btn-petit">Changer</button>
                    <button type="submit" name="geste" value="retirer" className="btn btn-danger btn-petit" aria-label={`Retirer ${a.email} de l'équipe SkanEcom`}>Retirer</button>
                  </form>
                ) : null}
                {peutModifier && !a.vous && a.double_auth ? (
                  <Confirmation
                    id={`double-auth-${a.user_id}`}
                    declencheur="Réinitialiser la double auth"
                    titre={`Réinitialiser la double authentification de ${a.email} ?`}
                    texte="Pour un téléphone perdu : son application d'authentification est oubliée et ses sessions se ferment. La prochaine connexion demandera d'en enregistrer une nouvelle."
                    action="/equipe-plateforme/double-auth"
                    champs={{ user_id: a.user_id, email: a.email, retour: "/equipe-plateforme" }}
                    bouton="Réinitialiser"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {/* La colonne de droite : inviter, puis le réglage de la double authentification. */}
        <div className="grid gap-5 content-start min-w-0">
        {peutModifier ? (
          <section className="carte" aria-labelledby="t-inviter-plateforme">
            <div className="carte-tete">
              <div>
                <h2 id="t-inviter-plateforme" className="carte-titre-icone"><Icone nom="plus" /> Inviter dans l&apos;équipe</h2>
                <p>La console lui crée son compte et vous remet un lien : envoyez-le par e-mail d&apos;un clic, ou transmettez-le vous-même.</p>
              </div>
            </div>
            <form action="/equipe-plateforme/inviter" method="post" className="formulaire">
              <div className="champ">
                <label htmlFor="ep-email">Adresse e-mail</label>
                <input id="ep-email" name="email" type="email" required defaultValue={v.email ?? ""} placeholder="prenom@skanecom.tn" />
              </div>
              <fieldset className="choix">
                <legend>Rôle</legend>
                {ROLES_PLATEFORME.map((r) => (
                  <label key={r.code} className="choix-carte">
                    <input type="radio" name="role" value={r.code} defaultChecked={(v.role ?? "support") === r.code} />
                    <span><b>{r.titre}</b><span className="aide">{r.aide}</span></span>
                  </label>
                ))}
              </fieldset>
              <button type="submit" className="btn btn-primaire">Inviter</button>
            </form>
          </section>
        ) : (
          <p className="message">Votre rôle (support) lit l&apos;équipe sans la changer : un super-administrateur invite et retire.</p>
        )}

        {/* La double authentification de l'équipe : un réglage, coupé par défaut. */}
        <section className="carte" aria-labelledby="t-securite" id="securite">
          <div className="carte-tete">
            <div>
              <h2 id="t-securite" className="carte-titre-icone"><Icone nom="bouclier" /> Double authentification de l&apos;équipe</h2>
              <p>{obligatoire
                ? "Exigée : personne n'entre dans la console sans le code de son application."
                : "Proposée à la connexion, chacun peut la reporter et l'activer depuis « Mon compte ». Qui l'a activée donne toujours son code."}</p>
            </div>
          </div>
          {dansSecurite && v.ok ? <p className="message message-succes" role="status">{v.ok}</p> : null}
          {dansSecurite && v.erreur ? <p className="message message-erreur" role="alert">{v.erreur}</p> : null}
          {peutModifier ? (
            <form action="/equipe-plateforme/securite" method="post" className="formulaire">
              <fieldset className="choix">
                <legend className="sr-only">Double authentification de l&apos;équipe SkanEcom</legend>
                <label className="choix-carte">
                  <input type="radio" name="obligatoire" value="" defaultChecked={!obligatoire} />
                  <span><b>Proposée</b><span className="aide">À la connexion, avec « Plus tard ». Recommandé seulement le temps de mettre l&apos;équipe en place.</span></span>
                </label>
                <label className="choix-carte">
                  <input type="radio" name="obligatoire" value="1" defaultChecked={obligatoire} />
                  <span><b>Exigée de toute l&apos;équipe</b><span className="aide">Qui n&apos;a pas d&apos;application l&apos;enregistre à sa prochaine page. Le plus sûr : la console touche à toutes les boutiques.</span></span>
                </label>
              </fieldset>
              <div><button type="submit" className="btn btn-primaire">Enregistrer</button></div>
            </form>
          ) : <p className="aide">Un super-administrateur règle cela.</p>}
        </section>
        </div>
      </div>
    </>
  );
}
