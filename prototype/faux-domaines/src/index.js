// Prototype SkanEcom : simule deux domaines de boutique devant la même vitrine,
// pour tester la séparation du cache sans acheter de domaine.
//   https://skanecom-faux-domaines.<sous-domaine>.workers.dev/boutique-a.exemple.tn/test-domaine
//   → la vitrine reçoit https://boutique-a.exemple.tn/test-domaine (Host: boutique-a.exemple.tn)
// Passe par une liaison de service : un Worker ne peut pas appeler par fetch un
// autre Worker du même sous-domaine workers.dev.
const HOTES = new Set(["boutique-a.exemple.tn", "boutique-b.exemple.tn"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const [, hote, ...reste] = url.pathname.split("/");
    if (!HOTES.has(hote)) return new Response("hôte non autorisé\n", { status: 404 });
    const cible = new URL(`https://${hote}/${reste.join("/")}${url.search}`);
    const entetes = new Headers(request.headers);
    entetes.set("host", hote);
    return env.VITRINE.fetch(new Request(cible, { method: request.method, headers: entetes }));
  },
};
