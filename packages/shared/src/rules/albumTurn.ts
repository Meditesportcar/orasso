// Le tour d'un album en cours de création (lot R9e, tour 5) : **une seule opération à la fois** (envoi, retrait, création du brouillon,
// « Continuer », « Publier »), et **le tour a un propriétaire**. `take()` rend un jeton ; seul ce jeton peut rendre le tour (`end(jeton)`) :
// une opération ne libère jamais le tour d'une autre (« Continuer » tient le tour pendant que l'envoi qu'il lance s'achève, la lecture de l'album
// qui suit est encore sous ce tour). La même règle sert le site et l'appli.
//
// **La mort du formulaire est définitive.** Dès que le compte a changé une fois (autre compte, déconnexion), `alive()` rend faux pour toujours :
// un retour au compte d'origine (A, puis B, puis A) ne ressuscite rien, puisque les réponses en vol du premier passage sont étrangères.
// `account` dit si le compte est encore celui du départ (avec sa génération de session, côté appli) ; il est relu à chaque question.
import type { AlbumItem } from "./albumUploads";

export type TurnToken = { readonly n: number };

export function createAlbumTurn(account: () => boolean = () => true) {
  let owner: TurnToken | null = null;
  let dead = false;
  let seq = 0;
  /** Vrai tant que c'est le compte du départ ; une fois faux, faux pour toujours. */
  const alive = (): boolean => {
    if (!dead && !account()) dead = true;
    return !dead;
  };
  return {
    alive,
    isDead: (): boolean => {
      alive();
      return dead;
    },
    /** Le compte a changé (annonce de session) : le formulaire est mort, sans attendre la prochaine question. */
    kill(): void {
      dead = true;
    },
    /** Prend le tour ; `null` : un autre est en cours, ou le formulaire est mort. */
    take(): TurnToken | null {
      if (owner || !alive()) return null;
      owner = { n: ++seq };
      return owner;
    },
    /** Rend le tour **seulement** à son propriétaire ; vrai quand il a été rendu. */
    end(token: TurnToken | null): boolean {
      if (!token || owner !== token) return false;
      owner = null;
      return true;
    },
    /** Une opération tient le tour. */
    busy: (): boolean => owner !== null,
    /** Ce jeton tient-il encore le tour ? */
    holds: (token: TurnToken | null): boolean => token !== null && owner === token,
  };
}

export type AlbumTurn = ReturnType<typeof createAlbumTurn>;

/** Par où une photo se retire : `local` (aucun envoi commencé : rien côté serveur), `server` (envoi ou ajout parti : par le serveur), `blocked` (un envoi est en vol). */
export type RemovalRoute = "local" | "server" | "blocked";

/**
 * **La garde de retrait commune** (tour 5) : tous les chemins de retrait la consultent, après avoir pris le tour. Une photo dont l'envoi est en
 * vol ne se retire pas (« Envoi… ») ; une photo se retire localement seulement si aucun envoi n'a commencé ; sinon par le serveur.
 */
export function removalRoute(item: Pick<AlbumItem, "attempted" | "photoId">, sending: boolean): RemovalRoute {
  if (sending) return "blocked";
  return item.attempted || item.photoId ? "server" : "local";
}
