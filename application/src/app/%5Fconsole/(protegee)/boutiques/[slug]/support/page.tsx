import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { boutiqueDe } from "@/lib/console/equipe-serveur";
import { deNom } from "@/lib/console/libelles";
import { DUREES_SUPPORT, MODES_SUPPORT, heureSupport, resteSupport, type AccesSupport, type ModeSupport } from "@/lib/console/support";
import { ListeAcces } from "@/components/console/AccesSupport";
import { Icone, type NomIcone } from "@/components/console/Icone";
import { titreBoutique } from "@/lib/console/titre-boutique";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: await titreBoutique(params, "Support") };
}

const TRANSPARENCE: { icone: NomIcone; texte: string }[] = [
  { icone: "personne", texte: "Le propriétaire voit, dans son backoffice (Équipe), qui est entré, quand, dans quel mode et pourquoi." },
  { icone: "journal", texte: "Chaque geste fait pendant l'accès porte votre nom : historique des commandes, journal du stock, journal des réglages." },
  { icone: "bouclier", texte: "L'accès ne vaut qu'en double authentification, et se ferme seul à l'heure dite." },
];

/* C7 · Entrer dans le backoffice d'un client pour le support : sans compte
   à lui emprunter ni mot de passe à lui demander. Un motif, un mode, une
   durée ; puis le backoffice de la boutique, tel que son équipe le voit,
   avec un bandeau qui rappelle l'accès et le ferme d'un clic. */
export default async function Support({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erreur?: string; ok?: string; fin?: string; motif?: string }>;
}) {
  const { user } = await exigeAdmin();
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const boutique = await boutiqueDe(slug);
  if (!boutique) notFound();
  const { data, error } = await clientService().rpc("console_acces_support", { p_acteur: user.id, p_boutique_id: boutique.id });
  if (error) throw new Error(`Accès support illisibles : ${error.message}`);
  const acces = (data ?? []) as AccesSupport[];
  const mien = acces.find((a) => a.vous && a.ouvert);
  const autres = acces.filter((a) => !a.vous && a.ouvert);
  const base = `/boutiques/${slug}/support`;
  const maintenant = new Date();

  return (
    <div className="pile">
      {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
      {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
      {messages.fin && !mien ? (
        <p className="message" role="status">
          Le backoffice {deNom(boutique.nom)} ne s&apos;ouvre qu&apos;avec un accès support en cours : ouvrez-en un ci-dessous.
        </p>
      ) : null}

      {mien ? (
        <section className="carte sp-actif" aria-labelledby="t-sp-actif">
          <div className="sp-actif-tete">
            <span className="sp-actif-icone" aria-hidden="true"><Icone nom="support" taille={20} /></span>
            <div>
              <h2 id="t-sp-actif">Vous êtes dans le backoffice {deNom(boutique.nom)}</h2>
              <p className="sp-actif-infos">
                <span className="ui-etat ui-etat-point ui-etat-vert">{MODES_SUPPORT[mien.role].titre}</span>
                <span className="tabular-nums">jusqu&apos;à {heureSupport(mien.expire_le)} · {resteSupport(mien.expire_le, maintenant)}</span>
              </p>
              <p className="sp-motif">« {mien.motif} »</p>
            </div>
          </div>
          <div className="sp-actif-gestes">
            <a className="btn btn-primaire" href={`/gestion/${slug}`}>
              Ouvrir son backoffice <Icone nom="droite" taille={16} />
            </a>
            <form action={`${base}/fermer`} method="post">
              <button type="submit" className="btn btn-second">Fermer l&apos;accès</button>
            </form>
          </div>
        </section>
      ) : null}

      <div className="grille-2">
        <section className="carte" aria-labelledby="t-sp-entrer">
          <div className="carte-tete">
            <div>
              <h2 id="t-sp-entrer" className="carte-titre-icone">
                <Icone nom="support" /> {mien ? "Changer de mode ou prolonger" : "Entrer dans son backoffice"}
              </h2>
              <p>
                {mien
                  ? "Un nouvel accès remplace celui qui est ouvert, avec son propre motif et sa durée."
                  : `Pour voir ce que voit l'équipe ${deNom(boutique.nom)}, sans compte à lui emprunter ni mot de passe à lui demander.`}
              </p>
            </div>
          </div>
          <form action={`${base}/ouvrir`} method="post" className="formulaire">
            <div className="champ">
              <label htmlFor="sp-motif">Pourquoi entrer ?</label>
              <textarea id="sp-motif" name="motif" required minLength={5} maxLength={300} rows={3}
                defaultValue={messages.motif ?? mien?.motif ?? ""} placeholder="Le propriétaire ne trouve pas où régler ses frais de livraison." />
              <p className="aide">En quelques mots : le propriétaire le lira.</p>
            </div>
            <fieldset className="choix">
              <legend>Ce que vous pourrez faire</legend>
              {(Object.keys(MODES_SUPPORT) as ModeSupport[]).map((m) => (
                <label key={m} className="choix-carte">
                  <input type="radio" name="role" value={m} required defaultChecked={(mien?.role ?? "lecture") === m} />
                  <span>
                    <b>{MODES_SUPPORT[m].titre}</b>
                    <span className="aide">{MODES_SUPPORT[m].aide}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="champ">
              <label htmlFor="sp-duree">Pendant</label>
              <select id="sp-duree" name="minutes" defaultValue="60" className="entree">
                {DUREES_SUPPORT.map((d) => <option key={d.minutes} value={d.minutes}>{d.libelle}</option>)}
              </select>
              <p className="aide">L&apos;accès se ferme seul au bout de ce temps ; vous pouvez le fermer avant.</p>
            </div>
            <button type="submit" className="btn btn-primaire btn-bloc">
              {mien ? "Rouvrir l'accès" : "Entrer dans son backoffice"}
            </button>
          </form>
        </section>

        <div className="pile">
          <section className="carte" aria-labelledby="t-sp-transparence">
            <div className="carte-tete">
              <div>
                <h2 id="t-sp-transparence" className="carte-titre-icone"><Icone nom="oeil" /> Ce que voit le client</h2>
              </div>
            </div>
            <ul className="sp-regles" role="list">
              {TRANSPARENCE.map((r) => (
                <li key={r.icone}>
                  <span className="sp-regle-icone" aria-hidden="true"><Icone nom={r.icone} taille={16} /></span>
                  <span>{r.texte}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="carte" aria-labelledby="t-sp-historique">
            <div className="carte-tete">
              <div>
                <h2 id="t-sp-historique" className="carte-titre-icone"><Icone nom="journal" /> Accès précédents</h2>
                <p>
                  {acces.length === 0
                    ? "Personne de SkanEcom n'est encore entré dans ce backoffice."
                    : autres.length
                      ? `${autres.length} autre${autres.length > 1 ? "s" : ""} accès ouvert${autres.length > 1 ? "s" : ""} en ce moment.`
                      : "Les vingt derniers, le plus récent en haut."}
                </p>
              </div>
            </div>
            {acces.length ? <ListeAcces acces={acces} maintenant={maintenant} /> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
