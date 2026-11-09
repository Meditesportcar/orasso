import { redirect } from "react-router";

// « Mes crews » (lot 19) est devenu l'onglet Crew (lot R7b2, D38) : `/app/crews` y renvoie. Redirection temporaire (302) :
// d'autres lots pointent encore ici, et l'adresse pourra servir de nouveau. La création d'un crew a sa page
// (`/app/crews/nouveau`).
export function loader() {
  throw redirect("/app/crew", 302);
}
