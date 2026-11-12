// L'onglet « Publications » d'un profil (maquette R8.1 `pr-profil` et R8.6 `pu-publi`). Brique réutilisable : elle prend une clé
// d'auteur et ne sait rien du profil (la fiche d'un événement et les pages de structure et de pro la reprendront). La ligne
// « N publications », la bascule des deux vues (grille de deux par défaut, dernier choix retenu sur l'appareil) et, chez moi, le
// bouton « Publier » compact (le seul bouton principal de l'écran) ; la suite par curseur (« Voir plus ») ; les états : chargement
// (l'indicateur du kit), erreur avec « Réessayer », vide chez moi, vide chez un autre, **compte privé** (liste restreinte, le même
// panneau qu'il ait publié ou non). Une liste restreinte ne dit rien de son contenu : ni nombre, ni photo.
import { Button, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type AuthorPostsFilter,
  publicationsLabels as L,
  PUBLICATIONS_VIEW_KEY,
  type PublicationsViewMode,
  publicationsEmptyKind,
  viewMode,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { cacheGetJson, cacheSetJson } from "@/lib/kv";
import { SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { Waiting } from "@/ui/Waiting";
import { PublicationsGrid } from "./PublicationsGrid";
import { PublicationsOneByOne } from "./PublicationsOneByOne";
import { usePublications } from "./usePublications";
import { ViewToggle } from "./ViewToggle";

const { space2, space3, space4, space6 } = tokens.spacing;

/** Le choix d'affichage, retenu **par compte** (copie du compte, vidée avec ses autres données) : jamais hérité d'un autre compte. */
function useViewMode(): [PublicationsViewMode, (mode: PublicationsViewMode) => void] {
  const [mode, setMode] = useState<PublicationsViewMode>("grid");
  useEffect(() => {
    let alive = true;
    void cacheGetJson<string>(PUBLICATIONS_VIEW_KEY)
      .then((stored) => {
        if (alive) setMode(viewMode(stored));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const choose = (next: PublicationsViewMode) => {
    setMode(next);
    void cacheSetJson(PUBLICATIONS_VIEW_KEY, next).catch(() => undefined);
  };
  return [mode, choose];
}

type TabProps = {
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
  /** Compte privé : « Demander à suivre » (`asked` : la demande est déjà partie). Absent : pas de bouton. */
  follow?: { asked: boolean; onAsk: () => Promise<void> | void };
  /** Lot R8g : le filtre « Tout · Événements · Hors événement » d'une page de structure (absent : toutes les publications). */
  filter?: AuthorPostsFilter;
  /** Lot R8g : une phrase d'état vide propre à une page (le titre reste « Pas encore de publication »). */
  emptyText?: string;
};

/**
 * Lot R8g : `header` (les puces du filtre d'une page) reste affiché au-dessus de tous les états, y compris le chargement, l'erreur
 * et le vide d'un filtre : on peut toujours changer de filtre. Sans `header`, rien ne change.
 */
export function PublicationsTab({ header, ...props }: TabProps & { header?: ReactNode }) {
  return header ? (
    <View style={styles.wrap}>
      {header}
      <PublicationsBody {...props} />
    </View>
  ) : (
    <PublicationsBody {...props} />
  );
}

function PublicationsBody({
  authorKey,
  pseudo,
  mine,
  total,
  restricted: restrictedHint = false,
  follow,
  filter,
  emptyText,
}: TabProps) {
  const { t } = useTheme();
  const router = useRouter();
  const list = usePublications(authorKey, filter, !restrictedHint, mine);
  const [mode, setMode] = useViewMode();
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState(false);
  const empty = publicationsEmptyKind({
    mine,
    restricted: restrictedHint || list.restricted,
    itemsCount: list.items.length,
  });
  // Toute la liste est lue : son nombre fait foi (une suppression le met à jour sans relecture) ; sinon, le compteur du profil.
  const count = list.nextCursor ? (total ?? null) : list.items.length;

  if (!restrictedHint && list.loading && !list.loaded)
    return <Waiting blocks={[260, 260]} label={L.loading} testID="publications-loading" />;
  if (!restrictedHint && list.error && !list.loaded)
    return <LoadError message={L.error} onRetry={() => void list.reload()} />;

  if (empty === "private") {
    const asked = follow?.asked ?? false;
    return (
      <View
        style={[styles.panel, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}
        testID="publications-private"
      >
        <Icon name="lock" size={30} color={t.color.inkMuted} />
        <Text variant="bodyStrong" color={t.color.ink}>
          {L.privateTitle}
        </Text>
        <Muted variant="caption" style={styles.panelText}>
          {L.privateText(pseudo)}
        </Muted>
        {follow ? (
          <SmButton
            kind="s"
            icon={asked ? "check" : "add"}
            disabled={asked || asking}
            onPress={() => {
              setAsking(true);
              setAskError(false);
              Promise.resolve(follow.onAsk())
                .catch(() => setAskError(true))
                .finally(() => setAsking(false));
            }}
            testID="publications-private-ask"
          >
            {asked ? L.privateAsked(pseudo) : L.privateAsk}
          </SmButton>
        ) : null}
        {askError ? <Muted variant="caption">{L.error}</Muted> : null}
      </View>
    );
  }

  if (empty === "empty_mine" || empty === "empty_other") {
    const isMine = empty === "empty_mine";
    return (
      <View
        style={[styles.panel, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}
        testID="publications-empty"
      >
        <Icon name={isMine ? "camera" : "gallery"} size={30} color={isMine ? t.color.accentText : t.color.inkMuted} />
        <Text variant="bodyStrong" color={t.color.ink}>
          {isMine ? L.emptyMineTitle : L.emptyOtherTitle}
        </Text>
        <Muted variant="caption" style={styles.panelText}>
          {isMine ? L.emptyMineText : (emptyText ?? L.emptyOtherText(pseudo))}
        </Muted>
        {isMine ? (
          <Button
            variant="primary"
            icon="camera"
            onPress={() => router.push("/fil/publier")}
            style={styles.panelButton}
            testID="publications-publish"
          >
            {L.publish}
          </Button>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="publications-tab">
      {list.stale ? <Notice testID="publications-offline">{L.offlineList}</Notice> : null}
      <View style={styles.head}>
        <Text variant="bodyStrong" color={t.color.ink} style={styles.count} testID="publications-count">
          {count === null ? "" : L.count(count)}
        </Text>
        {mine ? (
          <SmButton
            kind="p"
            icon="camera"
            onPress={() => router.push("/fil/publier")}
            style={styles.publish}
            testID="publications-publish"
          >
            {L.publish}
          </SmButton>
        ) : null}
        <ViewToggle value={mode} onChange={setMode} />
      </View>
      {mode === "one" ? (
        <PublicationsOneByOne posts={list.items} />
      ) : (
        <PublicationsGrid posts={list.items} authorKey={authorKey} />
      )}
      {list.error ? (
        <LoadError message={L.error} onRetry={() => void (list.nextCursor ? list.more() : list.reload())} />
      ) : null}
      {list.nextCursor && !list.error ? (
        <SmButton
          kind="s"
          wide
          icon="down"
          disabled={list.loadingMore}
          onPress={() => void list.more()}
          testID="publications-more"
        >
          {L.more}
        </SmButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space3 },
  head: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space2 },
  count: { flexGrow: 1 },
  panel: {
    alignItems: "center",
    gap: space2,
    paddingVertical: space6,
    paddingHorizontal: space4,
    borderRadius: tokens.radius.radiusLg,
  },
  panelText: { textAlign: "center" },
  panelButton: { alignSelf: "center" },
  // Le « Publier » compact suit la maquette (40 px) ; la zone de toucher est portée au jeton `touch` (44 px au moins).
  publish: { minHeight: tokens.spacing.touch },
});
