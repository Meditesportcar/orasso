// L'onglet « Publications » d'un profil sur le site (maquette R8.1 `pr-profil` et R8.6 `pu-publi`), mêmes mots, mêmes règles et
// mêmes états que l'appli. Brique réutilisable : elle prend une clé d'auteur et ne sait rien du profil. La ligne « N publications »,
// la bascule des deux vues (grille de deux, trois colonnes au-delà de 900 px ; dernier choix retenu dans le navigateur) et, chez
// moi, le bouton « Publier » compact ; la suite par curseur (« Voir plus ») ; les états : chargement (le O vivant), erreur avec
// « Réessayer », vide chez moi, vide chez un autre, **compte privé** (liste restreinte : le même panneau qu'il ait publié ou non).
import { Button, Icon, OLoader } from "@orasso/design-system/web";
import {
  publicationsLabels as L,
  PUBLICATIONS_VIEW_KEY,
  type PublicationsViewMode,
  publicationsEmptyKind,
  viewMode,
} from "@orasso/shared";
import { type ReactNode, useEffect, useState } from "react";

import "../../styles/publications.css";
import { PublicationsGrid } from "./PublicationsGrid";
import { PublicationsOneByOne } from "./PublicationsOneByOne";
import { usePublications } from "./usePublications";
import { ViewToggle } from "./ViewToggle";

/** Le choix d'affichage, retenu dans le navigateur (jamais bloquant : sans mémoire, la grille). */
function useViewMode(): [PublicationsViewMode, (mode: PublicationsViewMode) => void] {
  const [mode, setMode] = useState<PublicationsViewMode>("grid");
  useEffect(() => {
    try {
      setMode(viewMode(window.localStorage.getItem(PUBLICATIONS_VIEW_KEY)));
    } catch {
      /* navigation privée : la grille */
    }
  }, []);
  const choose = (next: PublicationsViewMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(PUBLICATIONS_VIEW_KEY, next);
    } catch {
      /* rien à retenir */
    }
  };
  return [mode, choose];
}

export function PublicationsTab({
  authorKey,
  pseudo,
  mine,
  total,
  restricted: restrictedHint = false,
  privateAction,
}: {
  /** La clé d'auteur (`u:<compte>` pour une personne). */
  authorKey: string;
  /** Le pseudo (ou le nom de la page) : il entre dans les phrases des états vides et du compte privé. */
  pseudo: string;
  /** Mon profil : le bouton « Publier » et l'état vide qui invite. */
  mine: boolean;
  /** Le nombre de publications connu du profil (la ligne « N publications ») ; inconnu : le nombre déjà lu quand tout l'est. */
  total?: number | null;
  /** Le profil sait déjà que la liste est restreinte (compteur nul) : le panneau s'affiche tout de suite, sans lecture. */
  restricted?: boolean;
  /** Compte privé : le bouton « Demander à suivre » (ou « Demande envoyée à … »), posé par la page. */
  privateAction?: ReactNode;
}) {
  const list = usePublications(authorKey, undefined, !restrictedHint);
  const [mode, setMode] = useViewMode();
  const empty = publicationsEmptyKind({
    mine,
    restricted: restrictedHint || list.restricted,
    itemsCount: list.items.length,
  });
  // Toute la liste est lue : son nombre fait foi (une suppression le met à jour sans relecture) ; sinon, le compteur du profil.
  const count = list.nextCursor ? (total ?? null) : list.items.length;

  if (!restrictedHint && list.loading && !list.loaded)
    return (
      <div className="pub-state pub-state--wait" role="status" data-testid="publications-loading">
        <OLoader size={64} label={L.loading} />
      </div>
    );
  if (!restrictedHint && list.error && !list.loaded)
    return (
      <div className="pub-state" role="alert" data-testid="load-error">
        <p className="o-t-body">{L.error}</p>
        <Button variant="secondary" icon="undo" onClick={() => void list.reload()}>
          {L.retry}
        </Button>
      </div>
    );

  if (empty === "private")
    return (
      <div className="pub-state" data-testid="publications-private">
        <Icon name="lock" size={30} />
        <strong>{L.privateTitle}</strong>
        <p className="o-t-caption">{L.privateText(pseudo)}</p>
        {privateAction}
      </div>
    );

  if (empty === "empty_mine" || empty === "empty_other") {
    const isMine = empty === "empty_mine";
    return (
      <div className="pub-state" data-testid="publications-empty">
        <Icon name={isMine ? "camera" : "gallery"} size={30} />
        <strong>{isMine ? L.emptyMineTitle : L.emptyOtherTitle}</strong>
        <p className="o-t-caption">{isMine ? L.emptyMineText : L.emptyOtherText(pseudo)}</p>
        {isMine ? (
          <Button variant="primary" icon="camera" href="/app/fil/publier" data-testid="publications-publish">
            {L.publish}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="pub" data-testid="publications-tab">
      <div className="pub-head">
        <b className="pub-head__count" data-testid="publications-count">
          {count === null ? "" : L.count(count)}
        </b>
        {mine ? (
          <Button
            variant="primary"
            icon="camera"
            href="/app/fil/publier"
            className="pub-head__publish"
            data-testid="publications-publish"
          >
            {L.publish}
          </Button>
        ) : null}
        <ViewToggle value={mode} onChange={setMode} />
      </div>
      {mode === "one" ? <PublicationsOneByOne posts={list.items} /> : <PublicationsGrid posts={list.items} />}
      {list.error ? (
        <div className="pub-state" role="alert" data-testid="load-error">
          <p className="o-t-body">{L.error}</p>
          <Button variant="secondary" icon="undo" onClick={() => void (list.nextCursor ? list.more() : list.reload())}>
            {L.retry}
          </Button>
        </div>
      ) : null}
      {list.nextCursor && !list.error ? (
        <Button
          variant="secondary"
          icon="down"
          disabled={list.loadingMore}
          onClick={() => void list.more()}
          data-testid="publications-more"
        >
          {L.more}
        </Button>
      ) : null}
    </div>
  );
}
