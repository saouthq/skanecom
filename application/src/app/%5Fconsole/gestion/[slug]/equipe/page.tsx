import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BoutonCopier } from "@/components/console/BoutonCopier";
import { EnTetePage, initiales, styleAvatar } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { deNom } from "@/lib/console/libelles";
import { COOKIE_LIEN, ROLES_EQUIPE, VALIDITE_LIEN, lienWhatsAppPartage, messageLien } from "@/lib/console/equipe";
import { cheminEquipeBoutique, lienEncoreUtile, lienRemis, type MembreBoutique } from "@/lib/gestion/equipe";
import { LIBELLES_ROLE, quand } from "@/lib/gestion/libelles";
import type { AccesSupport } from "@/lib/console/support";
import { ListeAcces } from "@/components/console/AccesSupport";

export const metadata: Metadata = { title: "Équipe" };

function etatDe(m: MembreBoutique): { texte: string; classe: string } {
  if (!m.actif) return { texte: "Accès retiré", classe: "ui-etat ui-etat-point" };
  if (m.en_attente) return { texte: "Invitation en attente", classe: "ui-etat ui-etat-point ui-etat-ambre" };
  return { texte: "Actif", classe: "ui-etat ui-etat-point ui-etat-vert" };
}

/* ============================================================================
   L'ÉQUIPE DE LA BOUTIQUE (B7) — le propriétaire invite ses employés, change
   leur rôle, retire ou rend un accès, remet un lien (invitation expirée, mot
   de passe oublié). L'administrateur voit l'équipe sans la changer ; les
   autres rôles n'ont pas cette page. En bas, les accès du support SkanEcom
   (C7) : qui est entré, quand, dans quel mode et pourquoi.
   ========================================================================== */
/** « vu aujourd'hui à 05:02 », « vu hier à 23:51 », « vu le 27 sept. à 18:40 ». */
function vuLe(iso: string): string {
  const q = quand(iso);
  return /^(aujourd|hier)/.test(q) ? `vu ${q}` : `vu le ${q}`;
}

export default async function EquipeBoutique({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string; email?: string; role?: string; carte?: string; la_votre?: string }>;
}) {
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  if (boutique.role !== "proprietaire" && boutique.role !== "admin") redirect(`/gestion/${slug}`);
  const gere = boutique.role === "proprietaire";

  const sb = await clientSession();
  const [{ data, error }, { data: dataSupport, error: erreurSupport }, { data: da }] = await Promise.all([
    sb.rpc("gestion_equipe", { p_boutique_id: boutique.boutique_id }),
    sb.rpc("gestion_acces_support", { p_boutique_id: boutique.boutique_id }),
    sb.rpc("gestion_double_auth", { p_boutique_id: boutique.boutique_id }),
  ]);
  // La double authentification des propriétaires et administrateurs : exigée ou proposée (réglage du propriétaire).
  const obligatoire = (da as { obligatoire?: boolean } | null)?.obligatoire === true;
  // Le retour de ce réglage s'affiche dans sa carte, là où l'on a cliqué.
  const dansCarte = messages.carte === "double-auth";
  if (error) throw new Error(`Équipe illisible : ${error.message}`);
  if (erreurSupport) throw new Error(`Accès du support illisibles : ${erreurSupport.message}`);
  const equipe = (data ?? []) as MembreBoutique[];
  const support = (dataSupport ?? []) as AccesSupport[];
  const lien = gere ? lienEncoreUtile(lienRemis((await cookies()).get(COOKIE_LIEN)?.value), equipe) : null;
  const actifs = equipe.filter((m) => m.actif).length;
  const action = cheminEquipeBoutique(slug);

  return (
    <>
      <EnTetePage
        titre="Équipe"
        description={`${actifs} ${actifs > 1 ? "personnes ont" : "personne a"} accès au backoffice ${deNom(boutique.nom)}. Chacune a son compte : personne ne connaît le mot de passe d'un autre.`}
      />

      <div className="pile">
        {messages.ok && !dansCarte ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur && !dansCarte ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
        {!gere ? <p className="message">Lecture seule : le propriétaire de la boutique gère son équipe.</p> : null}

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
              <form action={`/gestion/${slug}/equipe/envoyer-lien`} method="post">
                <button type="submit" className="btn btn-second"><Icone nom="courriel" /> Envoyer par e-mail</button>
              </form>
            </div>
          </section>
        ) : null}

        {/* La colonne de gauche : les membres, puis l'invitation, sans attendre la carte de droite. */}
        <div className="grille-2">
          <div className="pile">
          <section className="carte" aria-labelledby="t-membres">
            <div className="carte-tete">
              <div>
                <h2 id="t-membres" className="carte-titre-icone"><Icone nom="equipe" /> Membres</h2>
                <p>{obligatoire
                  ? "Le propriétaire et l'administrateur se connectent avec une double authentification : la boutique l'exige."
                  : "La double authentification est proposée au propriétaire et à l'administrateur ; chacun l'active depuis « Mon compte »."}</p>
              </div>
            </div>
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
                        <p className="membre-nom">{qui}{m.vous ? <span className="ui-etat eq-vous">Vous</span> : null}</p>
                        <p className="membre-infos">
                          <span className={etat.classe}>{etat.texte}</span>
                          {!gere || !m.actif ? <span>{LIBELLES_ROLE[m.role] ?? m.role}</span> : null}
                          {m.actif && !m.en_attente
                            ? <span>{m.derniere_connexion ? vuLe(m.derniere_connexion) : "jamais connecté"}</span>
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
                    {gere ? (
                      <div className="membre-gestes">
                        {m.actif ? (
                          <form action={`${action}/modifier`} method="post" className="membre-role">
                            <input type="hidden" name="user_id" value={m.user_id} />
                            <label className="sr-only" htmlFor={`role-${m.user_id}`}>Rôle de {qui}</label>
                            <select id={`role-${m.user_id}`} name="role" defaultValue={m.role} className="entree">
                              {ROLES_EQUIPE.map((r) => <option key={r.code} value={r.code}>{LIBELLES_ROLE[r.code]}</option>)}
                            </select>
                            <button type="submit" className="btn btn-second btn-petit">Changer</button>
                          </form>
                        ) : null}
                        {m.actif && !m.vous ? (
                          m.lien_possible ? (
                            <form action={`${action}/lien`} method="post">
                              <input type="hidden" name="user_id" value={m.user_id} />
                              <button type="submit" className="btn btn-second btn-petit">
                                <Icone nom={m.en_attente ? "lien" : "cle"} taille={14} />
                                {m.en_attente ? "Nouvelle invitation" : "Lien de mot de passe"}
                              </button>
                            </form>
                          ) : (
                            <span className="aide eq-ailleurs" title="Ce compte sert aussi dans une autre boutique">Lien : par SkanEcom</span>
                          )
                        ) : null}
                        {!m.vous ? (
                          <form action={`${action}/modifier`} method="post">
                            <input type="hidden" name="user_id" value={m.user_id} />
                            <input type="hidden" name="actif" value={m.actif ? "0" : "1"} />
                            <button type="submit" className={`btn btn-petit ${m.actif ? "btn-danger" : "btn-second"}`}>
                              <Icone nom={m.actif ? "retirer" : "rendre"} taille={14} />
                              {m.actif ? "Retirer l'accès" : "Rendre l'accès"}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
          {gere ? (
            <section className="carte" aria-labelledby="t-inviter">
              <div className="carte-tete">
                <div>
                  <h2 id="t-inviter" className="carte-titre-icone"><Icone nom="plus" /> Inviter une personne</h2>
                  <p>Son compte est créé et vous recevez un lien à lui envoyer : elle y choisit son mot de passe, puis arrive dans le backoffice.</p>
                </div>
              </div>
              <form action={`${action}/inviter`} method="post" className="formulaire">
                <div className="champ">
                  <label htmlFor="email">Adresse e-mail</label>
                  <input id="email" name="email" type="email" required autoComplete="off" defaultValue={messages.email ?? ""} placeholder="prenom@exemple.tn" />
                  <p className="aide">Son identifiant. Le lien d&apos;invitation s&apos;affiche ensuite : vous l&apos;envoyez par e-mail d&apos;un clic, ou le transmettez vous-même (WhatsApp, SMS).</p>
                </div>
                <fieldset className="choix">
                  <legend>Rôle</legend>
                  {ROLES_EQUIPE.map((r) => (
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
          ) : null}
          </div>

          {gere ? (
            <section className="carte" aria-labelledby="t-double-auth" id="double-auth">
              <div className="carte-tete">
                <div>
                  <h2 id="t-double-auth" className="carte-titre-icone"><Icone nom="bouclier" /> Double authentification</h2>
                  <p>Pour le propriétaire et l&apos;administrateur, qui ont la main sur toute la boutique. Qui l&apos;a activée donne toujours son code.</p>
                </div>
              </div>
              {dansCarte && messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
              {dansCarte && messages.erreur ? (
                <p className="message message-erreur" role="alert">
                  <span>
                    {messages.erreur}
                    {/* Sans la sienne : le chemin pour l'activer, d'un clic. */}
                    {messages.la_votre ? <> : <a href={`/gestion/${slug}/compte#double-auth`} className="btn-lien">l&apos;activer maintenant</a>.</> : null}
                  </span>
                </p>
              ) : null}
              <form action={`${action}/double-auth`} method="post" className="formulaire">
                <fieldset className="choix">
                  <legend className="sr-only">Double authentification du propriétaire et de l&apos;administrateur</legend>
                  <label className="choix-carte">
                    <input type="radio" name="obligatoire" value="" defaultChecked={!obligatoire} />
                    <span><b>Proposée</b><span className="aide">À la connexion, avec « Plus tard » ; chacun l&apos;active depuis « Mon compte ».</span></span>
                  </label>
                  <label className="choix-carte">
                    <input type="radio" name="obligatoire" value="1" defaultChecked={obligatoire} />
                    <span><b>Exigée</b><span className="aide">Plus sûr : un mot de passe volé ne suffit plus pour entrer. Activez d&apos;abord la vôtre.</span></span>
                  </label>
                </fieldset>
                <button type="submit" className="btn btn-second">Enregistrer</button>
              </form>
            </section>
          ) : null}

        </div>

        <section className="carte" aria-labelledby="t-support">
          <div className="carte-tete">
            <div>
              <h2 id="t-support" className="carte-titre-icone"><Icone nom="support" /> Le support SkanEcom</h2>
              <p>
                {support.length === 0
                  ? "Personne de SkanEcom n'est entré dans votre backoffice."
                  : "Quand vous faites appel à SkanEcom, son équipe peut entrer ici le temps de vous aider : avec un motif, pour une durée limitée, et chacun de ses gestes porte son nom."}
              </p>
            </div>
          </div>
          {support.length ? <ListeAcces acces={support} maintenant={new Date()} fermer={gere ? `${action}/support` : undefined} /> : null}
        </section>
      </div>
    </>
  );
}
