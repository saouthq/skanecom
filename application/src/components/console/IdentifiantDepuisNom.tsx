"use client";

import { useEffect } from "react";

/** « Café des Délices » → « cafe-des-delices » : sans accents, minuscules,
 *  tirets, 48 caractères au plus (le motif du champ). */
export function identifiantDe(nom: string): string {
  return nom
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " et ").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, "");
}

/* Nouvelle boutique : tant qu'on n'a pas écrit soi-même l'identifiant, il
   suit le nom ; le domaine propose « identifiant.tn » en exemple. Sans
   JavaScript, les champs restent à remplir à la main. */
export function IdentifiantDepuisNom({ nom = "nom", slug = "slug", hote = "hote" }: { nom?: string; slug?: string; hote?: string }) {
  useEffect(() => {
    const champNom = document.getElementById(nom) as HTMLInputElement | null;
    const champSlug = document.getElementById(slug) as HTMLInputElement | null;
    const champHote = document.getElementById(hote) as HTMLInputElement | null;
    if (!champNom || !champSlug) return;
    // Déjà rempli (un retour d'erreur) : on n'y touche plus.
    let libre = champSlug.value === "" || champSlug.value === identifiantDe(champNom.value);
    const suit = () => {
      if (!libre) return;
      const id = identifiantDe(champNom.value);
      champSlug.value = id;
      if (champHote) champHote.placeholder = id ? `${id}.tn` : "maymar.tn";
    };
    const ecrit = () => { libre = champSlug.value === "" || champSlug.value === identifiantDe(champNom.value); };
    champNom.addEventListener("input", suit);
    champSlug.addEventListener("input", ecrit);
    return () => {
      champNom.removeEventListener("input", suit);
      champSlug.removeEventListener("input", ecrit);
    };
  }, [nom, slug, hote]);
  return null;
}
