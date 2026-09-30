// Aperçu en ligne : une adresse workers.dev par boutique de démo (et une pour
// la console), toutes servies par la même application (skanecom-application).
// Le routeur ne change rien à la requête : l'application lit son Host et y
// trouve la boutique (annuaire, outils/annuaire.mjs). Il passe par une
// liaison de service : un Worker ne peut pas appeler par fetch un autre
// Worker du même sous-domaine workers.dev.
// L'aperçu n'est jamais indexé.
export default {
  async fetch(request, env) {
    const reponse = await env.APPLICATION.fetch(request);
    const copie = new Response(reponse.body, reponse);
    copie.headers.set("x-robots-tag", "noindex, nofollow");
    return copie;
  },
};
