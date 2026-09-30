import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Prix } from "@/components/Prix";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { LIBELLES_ORIGINE_REFUS, libelleStatut, lienAppel, lienWhatsApp, quand, telephoneLisible } from "@/lib/gestion/libelles";
import { LIBELLES_CONFIANCE, NIVEAUX, PEUT_JUGER, pastilleConfiance, verdictClient, type FicheClient } from "@/lib/gestion/clients";
import { CarteComptePro } from "@/components/console/ComptePro";
import { PEUT_DECIDER_PRO, type FicheComptePro } from "@/lib/gestion/pro";

export const metadata: Metadata = { title: "Client" };

/* ============================================================================
   LA FICHE D'UN CLIENT — d'un coup d'œil, la réponse à la question qu'on se
   pose avant d'envoyer un colis payé à la livraison : nouveau, fiable, à
   prendre avec prudence, à risque — puis ses chiffres en une ligne (commandé,
   livré, refusé, encaissé) ; sa confiance (normal, surveillé, bloqué, avec le
   pourquoi), ses commandes, ses adresses, la note de l'équipe.

   L'adresse accepte l'identifiant du client ou son numéro (depuis la fiche
   d'une commande) ; le numéro redirige vers l'identifiant.
   ========================================================================== */
export default async function FicheClientBackoffice({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const [{ slug, id }, messages] = await Promise.all([params, searchParams]);
  const cle = decodeURIComponent(id);
  const parId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(cle);
  if (!parId && !/^\+?[\d\s]{8,20}$/.test(cle)) notFound();
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_client", { p_boutique_id: boutique.boutique_id, p_cle: cle });
  if (error) throw new Error(`Client illisible : ${error.message}`);
  if (!data) notFound();
  const c = data as FicheClient;
  if (!parId) redirect(`/gestion/${slug}/clients/${c.id}`);
  // Le compte professionnel (module comptes_pro) : montré avec le module, ou
  // s'il en existe un d'avant (module coupé depuis).
  const { data: pro } = await sb.rpc("gestion_compte_pro", { p_boutique_id: boutique.boutique_id, p_client_id: c.id });
  const fichePro = pro as FicheComptePro | null;

  const juge = PEUT_JUGER.includes(boutique.role);
  const action = `/gestion/${slug}/clients/${c.id}/action`;
  const confiance = pastilleConfiance(c.niveau_risque);
  const verdict = verdictClient(c);
  const prenom = (c.nom ?? "").split(/\s+/)[0] || "";
  const maintenant = new Date();

  return (
    <>
      <EnTetePage
        avant={<Link href={`/gestion/${slug}/clients`}><Icone nom="retour" taille={14} /> Clients</Link>}
        titre={
          <>
            {c.nom ?? "Sans nom"}
            {confiance ? <span className={confiance.classe}>{confiance.texte}</span> : null}
          </>
        }
        description={
          <>
            <span className="tabular-nums">{telephoneLisible(c.telephone)}</span>
            {" · "}{c.compte ? "compte client" : "commande en invité"}
            {c.email ? <> · {c.email}</> : null}
            {" · client depuis "}{quand(c.depuis, maintenant).replace(/ à .*/, "")}
          </>
        }
        actions={
          <>
            <a className="btn btn-second" href={lienWhatsApp(c.telephone, prenom ? `Bonjour ${prenom}, ici ${boutique.nom}.` : `Bonjour, ici ${boutique.nom}.`)} target="_blank" rel="noreferrer">
              <Icone nom="message" /> WhatsApp
            </a>
            <a className="btn btn-primaire" href={lienAppel(c.telephone)}><Icone nom="telephone" /> Appeler</a>
          </>
        }
      />

      <div className="pile">
        {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}

        {/* La réponse d'abord (peut-on lui envoyer un colis ?), puis ses chiffres, sur une ligne. */}
        <section className="cl-verdict" data-niveau={verdict.niveau} aria-label="Ce qu'on sait de ce client">
          <p className="cl-verdict-texte"><span className="cl-verdict-point" aria-hidden="true" />{verdict.texte}</p>
          <p className="cl-verdict-chiffres">
            <span className="ligne-points">
              <span><b className="tabular-nums">{c.nb_commandes}</b> commande{c.nb_commandes > 1 ? "s" : ""}</span>
              <span><b className="tabular-nums">{c.chiffres.livrees}</b> livrée{c.chiffres.livrees > 1 ? "s" : ""}</span>
              <span><b className="tabular-nums">{c.nb_refus}</b> refus</span>
              <span><b><Prix millimes={c.chiffres.encaisse} /></b> encaissés</span>
            </span>
          </p>
        </section>

        <div className="grille-2">
          <div className="pile">
            {/* ---------------- Confiance ---------------- */}
            <section className="carte" aria-labelledby="t-confiance">
              <div className="carte-tete">
                <div>
                  <h2 id="t-confiance" className="carte-titre-icone"><Icone nom="bouclier" /> Confiance</h2>
                  <p>En paiement à la livraison, un refus coûte l&apos;aller-retour du livreur. Signalez les clients à risque ; bloquez ceux qui abusent.</p>
                </div>
              </div>
              {juge ? (
                <form action={action} method="post">
                  <input type="hidden" name="action" value="confiance" />
                  <fieldset className="choix cl-niveaux">
                    <legend className="sr-only">Niveau de confiance</legend>
                    {NIVEAUX.map((n) => (
                      <label key={n.cle} className="choix-carte" data-niveau={n.cle}>
                        <input type="radio" name="niveau" value={n.cle} defaultChecked={c.niveau_risque === n.cle} />
                        <span><b>{n.libelle}</b><span className="aide">{n.aide}</span></span>
                      </label>
                    ))}
                  </fieldset>
                  <div className="champ mt-4">
                    <label htmlFor="motif">Pourquoi <span className="discret">(obligatoire pour surveiller ou bloquer)</span></label>
                    <input id="motif" name="motif" maxLength={300} placeholder="Ex. Deux colis refusés à la porte, ne répond plus" />
                  </div>
                  <div className="carte-pied">
                    <span className="aide">Le changement et son motif restent au journal.</span>
                    <button className="btn btn-primaire">Enregistrer</button>
                  </div>
                </form>
              ) : (
                <p className="text-petit">
                  <b className="font-medium">{LIBELLES_CONFIANCE[c.niveau_risque]}</b> — {NIVEAUX.find((n) => n.cle === c.niveau_risque)?.aide}
                  <span className="discret"> La confiance d&apos;un client revient à la relation client.</span>
                </p>
              )}
            </section>

            {/* ---------------- Commandes ---------------- */}
            <section className="carte carte-plate" aria-labelledby="t-commandes">
              <div className="carte-tete">
                <div>
                  <h2 id="t-commandes" className="carte-titre-icone"><Icone nom="commandes" /> Commandes</h2>
                  <p>
                    {c.chiffres.en_cours ? `${c.chiffres.en_cours} en cours · ` : ""}
                    {c.chiffres.livrees} livrée{c.chiffres.livrees > 1 ? "s" : ""} · {c.chiffres.refusees} refusée{c.chiffres.refusees > 1 ? "s" : ""} · {c.chiffres.annulees} annulée{c.chiffres.annulees > 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              {c.commandes.length === 0 ? (
                <p className="discret cl-vide">Aucune commande.</p>
              ) : (
                <ul className="cl-commandes" role="list">
                  {c.commandes.map((o) => (
                    <li key={o.numero}>
                      <Link href={`/gestion/${slug}/commandes/${o.numero}`} className="cl-commande">
                        <span className="cl-commande-num">{o.numero}</span>
                        <span className={`bo-statut bo-statut-${o.statut}`}>{libelleStatut(o.statut)}</span>
                        <span className="cl-commande-detail">
                          {quand(o.cree_le, maintenant)} · {o.articles} article{o.articles > 1 ? "s" : ""}
                          {o.ville ? ` · ${o.ville}` : ""}
                          {o.refus_origine ? <span className="cl-commande-refus"> · {LIBELLES_ORIGINE_REFUS[o.refus_origine] ?? o.refus_origine}</span> : null}
                        </span>
                        <span className="cl-commande-total"><Prix millimes={o.total_millimes} /></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="pile">
            {fichePro && (fichePro.actif || fichePro.compte) ? (
              <CarteComptePro fiche={fichePro} action={action} decide={PEUT_DECIDER_PRO.includes(boutique.role)} maintenant={maintenant} />
            ) : null}

            {/* ---------------- Adresses ---------------- */}
            <section className="carte" aria-labelledby="t-adresses">
              <h2 id="t-adresses" className="carte-titre-icone"><Icone nom="lieu" /> Adresses</h2>
              {c.adresses.length === 0 && c.livraisons.length === 0 ? (
                <p className="discret mt-3 text-petit">Aucune adresse.</p>
              ) : (
                <ul className="cl-adresses mt-3" role="list">
                  {c.adresses.map((a, i) => (
                    <li key={`a-${i}`}>
                      <span className="font-medium">{a.nom}{a.par_defaut ? <span className="ui-etat cl-defaut">Par défaut</span> : null}</span>
                      <span>{a.ligne1}{a.ligne2 ? `, ${a.ligne2}` : ""}</span>
                      <span className="discret">{[a.code_postal, a.ville, a.gouvernorat].filter(Boolean).join(" ")}</span>
                    </li>
                  ))}
                  {c.adresses.length === 0
                    ? c.livraisons.map((l, i) => (
                        <li key={`l-${i}`}>
                          <span>{l.ligne1}</span>
                          <span className="discret">{[l.ville, l.gouvernorat].filter(Boolean).join(", ")} · livré{l.fois > 1 ? ` ${l.fois} fois` : " une fois"}</span>
                        </li>
                      ))
                    : null}
                </ul>
              )}
            </section>

            {/* ---------------- Note ---------------- */}
            <section className="carte" aria-labelledby="t-note">
              <h2 id="t-note" className="carte-titre-icone"><Icone nom="note" /> Note de l&apos;équipe</h2>
              {juge ? (
                <form action={action} method="post" className="pile mt-3" style={{ gap: ".75rem" }}>
                  <input type="hidden" name="action" value="note" />
                  <label htmlFor="note" className="sr-only">Note interne</label>
                  <textarea id="note" name="note" rows={4} maxLength={2000} defaultValue={c.note_interne ?? ""}
                    placeholder="Ex. Préfère être appelé après 18 h ; sonner deux fois." />
                  <div className="flex items-center justify-between gap-3">
                    <span className="aide">Jamais montrée au client.</span>
                    <button className="btn btn-second btn-petit">Enregistrer la note</button>
                  </div>
                </form>
              ) : (
                <p className="mt-3 text-petit">{c.note_interne ?? <span className="discret">Aucune note.</span>}</p>
              )}
            </section>

            {/* ---------------- Journal ---------------- */}
            <section className="carte" aria-labelledby="t-journal">
              <h2 id="t-journal" className="carte-titre-icone"><Icone nom="journal" /> Journal de confiance</h2>
              {c.journal.length === 0 ? (
                <p className="discret mt-3 text-petit">Jamais signalé.</p>
              ) : (
                <ol className="bo-journal mt-3">
                  {c.journal.map((j, i) => (
                    <li key={`${j.le}-${i}`}>
                      <span className="bo-journal-point" aria-hidden="true" />
                      <span className="bo-journal-texte">
                        {LIBELLES_CONFIANCE[j.avant?.niveau ?? "normal"]} → {LIBELLES_CONFIANCE[j.apres?.niveau ?? "normal"]}
                        {j.apres?.motif ? <span className="bo-journal-detail"> — {j.apres.motif}</span> : null}
                      </span>
                      <span className="bo-journal-meta">{j.auteur ?? "SkanEcom"} · {quand(j.le, maintenant)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
