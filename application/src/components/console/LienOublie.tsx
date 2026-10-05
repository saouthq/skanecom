"use client";

/* « Mot de passe oublié ? » emporte l'adresse déjà tapée dans le champ
   #email : la personne n'a pas à la retaper. Sans JavaScript, le lien mène à
   la même page, l'adresse en moins. */
export function LienOublie({ email }: { email?: string }) {
  const vers = (adresse: string) => (adresse ? `/mot-de-passe-oublie?${new URLSearchParams({ email: adresse })}` : "/mot-de-passe-oublie");
  return (
    <a
      href={vers(email ?? "")}
      className="btn-lien champ-tete-lien"
      onClick={(e) => {
        const champ = document.getElementById("email");
        if (champ instanceof HTMLInputElement) e.currentTarget.href = vers(champ.value.trim());
      }}
    >
      Mot de passe oublié ?
    </a>
  );
}
