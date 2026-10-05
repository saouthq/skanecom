import { Icone } from "./Icone";
import { initiales, styleAvatar } from "./Coquille";
import { numeroLisible } from "@/lib/legal";
import { dateJournal } from "@/lib/console/libelles";

/* ============================================================================
   LE CLIENT — sur la fiche d'une boutique, qui l'on appelle : son nom, son
   téléphone, son WhatsApp, son e-mail, d'un geste chacun ; son matricule
   fiscal et son adresse, pour la facture ; un mot. La console seule les voit
   (plateforme.contacts_boutiques) ; la modification est repliée derrière un
   bouton (« Noter ses coordonnées » tant que rien n'est noté).
   ========================================================================== */

export type Contact = {
  nom: string | null;
  telephone: string | null;
  whatsapp: string | null;
  email: string | null;
  matricule: string | null;
  adresse: string | null;
  note: string | null;
  modifie_le: string;
  par: string | null;
};

/** « +21620123456 » → « 21620123456 » : le numéro de wa.me. */
const pourWhatsApp = (n: string) => n.replace(/\D/g, "");

export function CarteClient({ slug, boutiqueId, contact, retour }: {
  slug: string;
  boutiqueId: string;
  contact: Contact | null;
  retour: React.ReactNode;
}) {
  const c = contact;
  // Sans WhatsApp à part, celui du téléphone (c'est le cas le plus courant).
  const whatsapp = c?.whatsapp ?? c?.telephone ?? null;
  const rien = !c || ![c.nom, c.telephone, c.whatsapp, c.email, c.matricule, c.adresse, c.note].some(Boolean);
  return (
    <section className="carte fb-client" aria-labelledby="t-client" id="client">
      <div className="carte-tete">
        <div>
          <h2 id="t-client" className="carte-titre-icone"><Icone nom="personne" /> Le client</h2>
          <p>Qui appeler, et ce qu&apos;il faut pour sa facture. La console seule le voit.</p>
        </div>
      </div>
      {retour}
      {rien ? (
        <p className="aide fb-client-vide">Personne à joindre pour l&apos;instant : notez le gérant et son téléphone, on l&apos;appelle ensuite d&apos;un geste.</p>
      ) : (
        <>
          <div className="fb-client-qui">
            {c!.nom ? <span className="avatar avatar-grand" style={styleAvatar(c!.nom)} aria-hidden="true">{initiales(c!.nom)}</span> : null}
            <div>
              <p className="fb-client-nom">{c!.nom ?? <span className="discret">Nom à noter</span>}</p>
              {c!.telephone ? <p className="aide tabular-nums">{numeroLisible(c!.telephone)}</p> : null}
            </div>
          </div>
          {c!.telephone || whatsapp || c!.email ? (
            <div className="fb-client-gestes">
              {c!.telephone ? <a href={`tel:${c!.telephone}`} className="btn btn-second btn-petit"><Icone nom="telephone" taille={14} /> Appeler</a> : null}
              {whatsapp ? (
                <a href={`https://wa.me/${pourWhatsApp(whatsapp)}`} target="_blank" rel="noopener" className="btn btn-second btn-petit">
                  <Icone nom="message" taille={14} /> WhatsApp
                </a>
              ) : null}
              {c!.email ? <a href={`mailto:${c!.email}`} className="btn btn-second btn-petit"><Icone nom="courriel" taille={14} /> E-mail</a> : null}
            </div>
          ) : null}
          <dl className="fb-client-infos">
            {c!.whatsapp && c!.whatsapp !== c!.telephone ? <div><dt>WhatsApp</dt><dd className="tabular-nums">{numeroLisible(c!.whatsapp)}</dd></div> : null}
            {c!.email ? <div><dt>E-mail</dt><dd>{c!.email}</dd></div> : null}
            <div><dt>Matricule fiscal</dt><dd>{c!.matricule ?? <span className="discret">à noter</span>}</dd></div>
            {c!.adresse ? <div><dt>Adresse</dt><dd>{c!.adresse}</dd></div> : null}
            {c!.note ? <div className="fb-client-note"><dt>À savoir</dt><dd>{c!.note}</dd></div> : null}
          </dl>
          <p className="aide fb-client-maj">Mis à jour le {dateJournal(c!.modifie_le)}{c!.par ? ` par ${c!.par}` : ""}.</p>
        </>
      )}
      <details className="fb-client-modifier">
        <summary className="btn btn-fantome btn-petit"><Icone nom="crayon" taille={14} /> {rien ? "Noter ses coordonnées" : "Modifier"}</summary>
        <form action={`/boutiques/${slug}/contact`} method="post" className="formulaire">
          <input type="hidden" name="boutique_id" value={boutiqueId} />
          <div className="grille-champs">
            <div className="champ">
              <label htmlFor="cl-nom">Personne à appeler</label>
              <input id="cl-nom" name="nom" className="entree" maxLength={120} defaultValue={c?.nom ?? ""} autoComplete="off" placeholder="Prénom Nom, son rôle" />
            </div>
            <div className="champ">
              <label htmlFor="cl-telephone">Téléphone</label>
              <input id="cl-telephone" name="telephone" type="tel" inputMode="tel" className="entree" defaultValue={c?.telephone ? numeroLisible(c.telephone) : ""} autoComplete="off" placeholder="20 123 456" />
            </div>
            <div className="champ">
              <label htmlFor="cl-whatsapp">WhatsApp <span className="discret">(s&apos;il diffère)</span></label>
              <input id="cl-whatsapp" name="whatsapp" type="tel" inputMode="tel" className="entree" defaultValue={c?.whatsapp ? numeroLisible(c.whatsapp) : ""} autoComplete="off" placeholder="Le téléphone, sinon" />
            </div>
            <div className="champ">
              <label htmlFor="cl-email">E-mail</label>
              <input id="cl-email" name="email" type="email" className="entree" maxLength={200} defaultValue={c?.email ?? ""} autoComplete="off" placeholder="prenom@exemple.tn" />
            </div>
            <div className="champ">
              <label htmlFor="cl-matricule">Matricule fiscal</label>
              <input id="cl-matricule" name="matricule" className="entree" maxLength={40} defaultValue={c?.matricule ?? ""} autoComplete="off" placeholder="1234567/A/M/000" />
            </div>
            <div className="champ">
              <label htmlFor="cl-adresse">Adresse</label>
              <input id="cl-adresse" name="adresse" className="entree" maxLength={300} defaultValue={c?.adresse ?? ""} autoComplete="off" placeholder="Rue, ville" />
            </div>
          </div>
          <div className="champ">
            <label htmlFor="cl-note">À savoir <span className="discret">(facultatif)</span></label>
            <textarea id="cl-note" name="note" className="entree" rows={2} maxLength={1000} defaultValue={c?.note ?? ""} placeholder="Joignable l'après-midi ; préfère WhatsApp…" />
          </div>
          <div><button type="submit" className="btn btn-primaire">Enregistrer</button></div>
        </form>
      </details>
    </section>
  );
}
