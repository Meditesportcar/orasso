// La page d'une publication seule (`/publication/<id>` ; `GET /feed-posts/:id`) : la carte entière du Fil (photos, légende entière,
// flamme · commentaire · partager), les commentaires dessous ; `?commentaires=1` ouvre la feuille des commentaires. Le menu « ⋯ »
// suit `manage` (Supprimer, avec confirmation). Retirée ou devenue invisible (404) : « Cette publication n'est plus visible. »
// et retour. Le lien d'une notification de publication mène ici (dette R7f4).
import { Icon, tokens, useTheme } from "@orasso/design-system/native";
import { type FeedPostWithManage, publicationsLabels as L } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { FeedPostCard } from "@/features/fil/cards/FeedPostCard";
import { api } from "@/lib/api";
import { ApiRequestError } from "@/lib/http";
import { cacheScope } from "@/lib/kv";
import { createRequestGate } from "@/lib/requestGate";
import { SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { FlowScreen } from "@/ui/Screens";
import { Waiting } from "@/ui/Waiting";
import { PostMenu } from "./PostMenu";
import { postCard } from "./postCard";

type Read =
  | { status: "loading" }
  | { status: "gone" }
  | { status: "error"; message: string }
  | { status: "ok"; post: FeedPostWithManage };

export function PublicationScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string; commentaires?: string }>();
  const [read, setRead] = useState<Read>({ status: "loading" });
  const [menu, setMenu] = useState(false);
  const gate = useRef(createRequestGate(cacheScope)).current;

  const load = useCallback(async () => {
    const ticket = gate.start();
    try {
      const post = await api.feedPost(String(id));
      if (ticket.current()) setRead({ status: "ok", post });
    } catch (e) {
      if (!ticket.current()) return;
      // 404 : retirée ou devenue invisible (compte passé en privé, page suspendue) : on ne dit pas pourquoi.
      if (e instanceof ApiRequestError && (e.status === 404 || e.status === 403)) setRead({ status: "gone" });
      else setRead({ status: "error", message: L.error });
    }
  }, [gate, id]);
  useEffect(() => {
    setRead({ status: "loading" });
    void load();
    return () => gate.invalidate();
  }, [load, gate]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/fil"));

  return (
    <FlowScreen title={L.pageTitle} onClose={close} closeLabel={L.back} onRefresh={load}>
      {read.status === "loading" ? <Waiting blocks={[420]} testID="publication-loading" /> : null}
      {read.status === "error" ? <LoadError message={read.message} onRetry={() => void load()} /> : null}
      {read.status === "gone" ? (
        <View style={styles.gone} testID="publication-gone">
          <Icon name="gallery" size={30} color={t.color.inkMuted} />
          <Muted variant="body" style={styles.goneText}>
            {L.gone}
          </Muted>
          <SmButton kind="s" icon="back" onPress={close} testID="publication-gone-back">
            {L.goneBack}
          </SmButton>
        </View>
      ) : null}
      {read.status === "ok" ? (
        <>
          <FeedPostCard card={postCard(read.post)} faded={false} onMenu={() => setMenu(true)} />
          <PostMenu
            post={menu ? read.post : null}
            canDelete={read.post.manage?.canDelete ?? read.post.mine}
            onClose={() => setMenu(false)}
            onRemoved={close}
          />
        </>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  gone: { alignItems: "center", gap: tokens.spacing.space3, paddingVertical: tokens.spacing.space6 },
  goneText: { textAlign: "center" },
});
