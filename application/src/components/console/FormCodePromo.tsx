"use client";

import { useState } from "react";
import { Icone } from "./Icone";
import { formateMontant } from "@/lib/prix";
import { TYPES_CODE, type CodePromo, type TypeCode } from "@/lib/gestion/promotions";

/* ============================================================================
   CRÉER OU RÉGLER UN CODE PROMO — un formulaire HTML ordinaire (il part sans
   script) que le navigateur aide : le code s'écrit en capitales à mesure
   qu'on le tape, la valeur prend l'unité de ce que le code offre (« % » ou
   « TND ») et s'efface pour la livraison offerte. La base revérifie tout.
   Un code qui a déjà servi garde son nom et sa remise : ils s'affichent sans
   se modifier, le reste se règle encore.
   ========================================================================== */

const montant = (millimes: number | null | undefined) => (millimes ? formateMontant(millimes).replace(/\s/g, "") : "");

export function FormCodePromo({ action, code, suffixe }: { action: string; code?: CodePromo; suffixe: string }) {
  const verrouille = Boolean(code?.a_servi);
  const initial = {
    code: code?.code ?? "",
    type: (code?.type ?? "pourcentage") as TypeCode,
  };
  const [saisie, setSaisie] = useState(initial.code);
  const [type, setType] = useState<TypeCode>(initial.type);
  const id = (nom: string) => `pm-${suffixe}-${nom}`;

  return (
    <form
      action={action}
      method="post"
      className="pm-form"
      onReset={() => {
        setSaisie(initial.code);
        setType(initial.type);
      }}
    >
      <input type="hidden" name="geste" value="enregistrer" />
      {code ? <input type="hidden" name="code_id" value={code.id} /> : null}

      <div className="champ">
        <label htmlFor={id("code")}>Le code</label>
        {verrouille ? (
          <>
            <input type="hidden" name="code" value={code?.code} />
            <p className="pm-verrou"><span className="pm-ticket">{code?.code}</span> <span className="aide">A déjà servi : son nom et sa remise ne changent plus.</span></p>
          </>
        ) : (
          <>
            <input
              id={id("code")}
              name="code"
              className="pm-saisie-code"
              required
              maxLength={24}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="BIENVENUE10"
              value={saisie}
              aria-describedby={id("code-aide")}
              onChange={(e) => setSaisie(e.target.value.toUpperCase().replace(/\s+/g, ""))}
            />
            <p id={id("code-aide")} className="aide">De 3 à 24 lettres ou chiffres, sans accent ; le tiret est permis. L&apos;acheteur le tape comme il veut : minuscules et espaces ne comptent pas.</p>
          </>
        )}
      </div>

      {verrouille ? (
        <>
          <input type="hidden" name="type" value={code?.type} />
          <input type="hidden" name="valeur" value={code?.type === "montant" ? montant(code?.valeur) : String(code?.valeur ?? "")} />
        </>
      ) : (
        <>
          <fieldset className="choix pm-types">
            <legend>Ce que le code offre</legend>
            {TYPES_CODE.map((t) => (
              <label key={t.cle} className="choix-carte">
                <input type="radio" name="type" value={t.cle} checked={type === t.cle} onChange={() => setType(t.cle)} />
                <span><b>{t.libelle}</b><span className="aide">{t.aide}</span></span>
              </label>
            ))}
          </fieldset>
          {type !== "livraison" ? (
            <div className="champ">
              <label htmlFor={id("valeur")}>{type === "pourcentage" ? "La remise" : "Le montant"}</label>
              <span className="pm-unite">
                <input
                  id={id("valeur")}
                  name="valeur"
                  className="tabular-nums"
                  required
                  inputMode={type === "pourcentage" ? "numeric" : "decimal"}
                  placeholder={type === "pourcentage" ? "10" : "20"}
                  defaultValue={code?.type === type ? (type === "montant" ? montant(code?.valeur) : String(code?.valeur ?? "")) : ""}
                  key={type}
                />
                <span aria-hidden="true">{type === "pourcentage" ? "%" : "TND"}</span>
              </span>
            </div>
          ) : null}
        </>
      )}

      <div className="pm-grille">
        <div className="champ">
          <label htmlFor={id("minimum")}>Dès <span className="discret">(montant des articles, facultatif)</span></label>
          <span className="pm-unite">
            <input id={id("minimum")} name="minimum" className="tabular-nums" inputMode="decimal" placeholder="0" defaultValue={montant(code?.minimum_millimes)} />
            <span aria-hidden="true">TND</span>
          </span>
        </div>
        <div className="champ">
          <label htmlFor={id("limite")}>Utilisations <span className="discret">(au plus, facultatif)</span></label>
          <input id={id("limite")} name="limite" className="tabular-nums" inputMode="numeric" placeholder="Sans limite" defaultValue={code?.limite_utilisations ?? ""} />
        </div>
        <div className="champ">
          <label htmlFor={id("debut")}>Premier jour <span className="discret">(facultatif)</span></label>
          <input id={id("debut")} name="debut" type="date" defaultValue={code?.debut_jour ?? ""} />
        </div>
        <div className="champ">
          <label htmlFor={id("fin")}>Dernier jour <span className="discret">(inclus, facultatif)</span></label>
          <input id={id("fin")} name="fin" type="date" defaultValue={code?.fin_jour ?? ""} />
        </div>
      </div>

      <label className="pm-case">
        <input type="checkbox" name="une_fois" value="1" defaultChecked={code ? code.une_fois_par_client : true} />
        <span>
          <b>Une fois par client</b>
          <span className="aide">Compté par compte et par numéro de téléphone : un invité ne le reprend pas sous un autre nom.</span>
        </span>
      </label>

      <div className="champ">
        <label htmlFor={id("note")}>Pour l&apos;équipe <span className="discret">(à qui il a été donné, pourquoi — facultatif)</span></label>
        <input id={id("note")} name="note" maxLength={200} placeholder="Ex. Story Instagram de la rentrée" defaultValue={code?.note ?? ""} />
      </div>

      <div className="carte-pied">
        <span className="aide">Chaque code et chaque changement restent au journal.</span>
        <button className="btn btn-primaire">
          <Icone nom={code ? "coche" : "etiquette"} taille={15} /> {code ? "Enregistrer" : "Créer le code"}
        </button>
      </div>
    </form>
  );
}
