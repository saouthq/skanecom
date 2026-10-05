import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { exigeAdmin } from "@/lib/console/session";
import { dateJournal, deNom } from "@/lib/console/libelles";
import { COOKIE_LIEN, ROLES_EQUIPE, VALIDITE_LIEN, cheminEquipe, lienWhatsAppPartage, messageLien, type LienRemis, type MembreEquipe } from "@/lib/console/equipe";
import { boutiqueDe, equipeDe } from "@/lib/console/equipe-serveur";
import { LIBELLES_ROLE } from "@/lib/gestion/libelles";
import { BoutonCopier } from "@/components/console/BoutonCopier";
import { initiales, styleAvatar } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { Confirmation } from "@/components/console/Confirmation";
import { titreBoutique } from "@/lib/console/titre-boutique";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: await titreBoutique(params, "Équipe") };
}

function lienRemis(valeur: string | undefined): LienRemis | null {
  if (!valeur) return null;
  try {
    const l = JSON.parse(decodeURIComponent(valeur)) as LienRemis;
    return typeof l.lien === "string" && typeof l.email === "string" ? l : null;
  } catch {
    return null;
  }
}

/** Le lien n'est plus montré une fois qu'il a servi : l'invitation est
 *  acceptée, ou la personne s'est connectée depuis qu'il a été remis. */
function lienEncoreUtile(l: LienRemis | null, equipe: MembreEquipe[]): LienRemis | null {
  if (!l) return null;
  const m = equipe.find((x) => x.user_id === l.userId);
  if (!m || !m.actif) return null;
  if (l.type === "invite") return m.en_attente ? l : null;
  return m.derniere_connexion && new Date(m.derniere_connexion) > new Date(l.emis) ? null : l;
}

function etatDe(m: MembreEquipe): { texte: string; classe: string } {
  if (!m.actif) return { texte: "Accès retiré", classe: "ui-etat ui-etat-point" };
  if (m.en_attente) return { texte: "Invitation en attente", classe: "ui-etat ui-etat-point ui-etat-ambre" };
  return { texte: "Actif", classe: "ui-etat ui-etat-point ui-etat-vert" };
}

/* C4 · L'équipe d'une boutique : qui entre dans son backoffice, avec quel
   rôle. L'administrateur invite par adresse e-mail et transmet lui-même le
   lien (WhatsApp) ; il change un rôle, retire ou rend un accès, remet un
   nouveau lien (invitation expirée, mot de passe oublié). */
export default async function Equipe({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erreur?: string; ok?: string; email?: string; role?: string }>;
}) {
  const { role: roleAdmin } = await exigeAdmin();
  // Le support n'ouvre ni ne touche les rôles qui engagent la boutique (la base le redit).
  const superAdmin = roleAdmin === "super_admin";
  const engage = (r: string) => r === "proprietaire" || r === "admin";
  const rolesPermis = superAdmin ? ROLES_EQUIPE : ROLES_EQUIPE.filter((r) => !engage(r.code));
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const boutique = await boutiqueDe(slug);
  if (!boutique) notFound();
  const equipe = await equipeDe(boutique.id);
  const lien = lienEncoreUtile(lienRemis((await cookies()).get(COOKIE_LIEN)?.value), equipe);
  const actifs = equipe.filter((m) => m.actif).length;
  const action = cheminEquipe(slug);

  return (
    <div className="pile">
      {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
      {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}

      {lien ? (
        <section id="lien" className="carte carte-lien" aria-labelledby="t-lien">
          <div className="carte-tete">
            <div>
              <h2 id="t-lien" className="carte-titre-icone">
                <Icone nom="lien" /> {lien.type === "invite" ? "Le lien d'invitation" : "Le lien pour choisir un mot de passe"} de {lien.email}
              </h2>
              <p>À envoyer à cette personne seulement. Il sert une seule fois, pendant {VALIDITE_LIEN} ; il reste affiché ici un quart d&apos;heure.</p>
            </div>
          </div>
          <div className="lien-acces-rang">
            <div className="champ lien-acces">
              <label className="sr-only" htmlFor="lien-acces">Lien</label>
              <input id="lien-acces" className="code-secret" readOnly value={lien.lien} />
            </div>
            <BoutonCopier texte={lien.lien} />
            <a className="btn btn-succes" href={lienWhatsAppPartage(messageLien(lien))} target="_blank" rel="noopener noreferrer">
              <Icone nom="message" /> Envoyer par WhatsApp
            </a>
          </div>
        </section>
      ) : null}

      <div className="grille-2">
        <section className="carte" aria-labelledby="t-membres">
          <div className="carte-tete">
            <div>
              <h2 id="t-membres">Membres</h2>
              <p>
                {actifs} {actifs > 1 ? "personnes ont" : "personne a"} accès au backoffice {deNom(boutique.nom)}. Chacune a son compte ; vous ne
                connaissez jamais son mot de passe.
              </p>
            </div>
          </div>
          {equipe.length === 0 ? (
            <div className="vide">
              <span className="vide-icone"><Icone nom="equipe" taille={20} /></span>
              <strong>Personne encore</strong>
              <p>Invitez le propriétaire de la boutique : il recevra un lien pour choisir son mot de passe.</p>
            </div>
          ) : (
            <ul className="equipe" role="list">
              {equipe.map((m) => {
                const etat = etatDe(m);
                const qui = m.email ?? m.telephone ?? "compte sans adresse";
                const aal2 = m.role === "proprietaire" || m.role === "admin";
                return (
                  <li key={m.user_id} className={`membre${m.actif ? "" : " membre-inactif"}`}>
                    <div className="membre-qui">
                      <span className="avatar" style={styleAvatar(qui)} aria-hidden="true">{initiales(qui)}</span>
                      <div>
                        <p className="membre-nom">{qui}</p>
                        <p className="membre-infos">
                          <span className={etat.classe}>{etat.texte}</span>
                          {m.actif && !m.en_attente
                            ? <span>{m.derniere_connexion ? `vu le ${dateJournal(m.derniere_connexion)}` : "jamais connecté"}</span>
                            : null}
                          {m.actif && aal2 ? (
                            <span className="inline-flex items-center gap-1">
                              <Icone nom="bouclier" taille={13} />
                              {m.double_auth ? "double authentification active" : "double authentification pas encore activée"}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    {!superAdmin && engage(m.role) ? (
                      <div className="membre-gestes"><span className="ui-etat">{LIBELLES_ROLE[m.role] ?? m.role}</span></div>
                    ) : <div className="membre-gestes">
                      {m.actif ? (
                        <form action={`${action}/modifier`} method="post" className="membre-role">
                          <input type="hidden" name="user_id" value={m.user_id} />
                          <label className="sr-only" htmlFor={`role-${m.user_id}`}>Rôle de {qui}</label>
                          <select id={`role-${m.user_id}`} name="role" defaultValue={m.role} className="entree">
                            {rolesPermis.map((r) => <option key={r.code} value={r.code}>{LIBELLES_ROLE[r.code]}</option>)}
                          </select>
                          <button type="submit" className="btn btn-second btn-petit">Changer</button>
                        </form>
                      ) : (
                        <span className="ui-etat">{LIBELLES_ROLE[m.role] ?? m.role}</span>
                      )}
                      {m.actif ? (
                        <form action={`${action}/lien`} method="post">
                          <input type="hidden" name="user_id" value={m.user_id} />
                          <button type="submit" className="btn btn-second btn-petit">
                            <Icone nom={m.en_attente ? "lien" : "cle"} taille={14} />
                            {m.en_attente ? "Nouvelle invitation" : "Lien de mot de passe"}
                          </button>
                        </form>
                      ) : null}
                      <form action={`${action}/modifier`} method="post">
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <input type="hidden" name="actif" value={m.actif ? "0" : "1"} />
                        <button type="submit" className={`btn btn-petit ${m.actif ? "btn-danger" : "btn-second"}`}>
                          <Icone nom={m.actif ? "retirer" : "rendre"} taille={14} />
                          {m.actif ? "Retirer l'accès" : "Rendre l'accès"}
                        </button>
                      </form>
                      {superAdmin && m.actif && aal2 && m.double_auth ? (
                    <Confirmation
                      id={`double-auth-${m.user_id}`}
                      declencheur={<><Icone nom="bouclier" taille={14} /> Réinitialiser la double auth</>}
                      titre={`Réinitialiser la double authentification de ${qui} ?`}
                      texte="Pour un téléphone perdu : son application d'authentification est oubliée et ses sessions se ferment. La prochaine connexion demandera d'en enregistrer une nouvelle."
                      action="/equipe-plateforme/double-auth"
                      champs={{ user_id: m.user_id, email: qui, retour: `/boutiques/${slug}/equipe` }}
                      bouton="Réinitialiser"
                    />
                      ) : null}
                    </div>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="carte" aria-labelledby="t-inviter">
          <div className="carte-tete">
            <div>
              <h2 id="t-inviter" className="carte-titre-icone"><Icone nom="plus" /> Inviter une personne</h2>
              <p>La console crée son compte et vous donne un lien à lui envoyer : elle y choisit son mot de passe, puis arrive dans le backoffice.</p>
            </div>
          </div>
          <form action={`${action}/inviter`} method="post" className="formulaire">
            <div className="champ">
              <label htmlFor="email">Adresse e-mail</label>
              <input id="email" name="email" type="email" required autoComplete="off" defaultValue={messages.email ?? ""} placeholder="prenom@exemple.tn" />
              <p className="aide">Son identifiant. Aucun e-mail n&apos;est envoyé : c&apos;est vous qui transmettez le lien.</p>
            </div>
            <fieldset className="choix">
              <legend>Rôle</legend>
              {rolesPermis.map((r) => (
                <label key={r.code} className="choix-carte role-choix">
                  <input type="radio" name="role" value={r.code} required defaultChecked={(messages.role ?? "confirmateur") === r.code} />
                  <span>
                    <b>{LIBELLES_ROLE[r.code]}</b>
                    <span className="aide">{r.aide}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <button type="submit" className="btn btn-primaire btn-bloc">Inviter</button>
          </form>
        </section>
      </div>
    </div>
  );
}
