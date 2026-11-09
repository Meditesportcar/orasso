// Un rendez-vous au spot, vu de son auteur ou d'un invité (lot R7i, maquette R7.9 « Reçu » et « Après ») : la carte du lieu
// (lieu exact), l'heure, le mot, « Qui vient ? », « Je viens » / « Peut-être ». L'auteur voit qui vient et peut annuler ;
// une fois fini (ou pour quelqu'un qui n'est pas invité) il n'y a plus de lieu : « Ce rendez-vous est terminé ». Mode B.
// Tout est décidé par l'API : un rendez-vous qu'on n'a pas le droit de voir répond 404, l'écran le dit sans rien révéler.
import { Icon, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  agoLabel,
  spotLabels as L,
  type SpotMeetupView,
  type SpotReplies,
  spotEndLabel,
  spotTimeLabel,
  spotUntilLabel,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { now as orassoNow } from "@/lib/clock";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { Card, SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { SpotPlaceMap } from "./SpotPlaceMap";
import { useSpotAnswer } from "./useSpotAnswer";
import { useSpotOver } from "./useSpotOver";

const { space2, space3 } = tokens.spacing;

/** Refus définitif de l'API : annulé, plus invité, compte écarté (404), ou accès refusé (403). Pas une panne. */
export const isRefused = (e: { status?: number } | null | undefined) => e?.status === 404 || e?.status === 403;

export function SpotScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const loaded = useApi(() => api.spot(id), [id], { refreshMs: 30_000 });
  const [meetup, setMeetup] = useState<SpotMeetupView | null>(null);
  // Refus appris ailleurs que dans la lecture de la fiche (liste de ceux qui viennent, réponse).
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    setMeetup(loaded.data);
    setRefused(false);
  }, [loaded.data]);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/accueil"));
  // Annulé ou retiré pendant que la fiche est ouverte : le rendez-vous et les réponses sont vidés, jamais l'ancienne donnée
  // devant l'erreur (le lieu ne reste pas à l'écran).
  const gone = isRefused(loaded.error) || refused;
  useEffect(() => {
    if (gone) setMeetup(null);
  }, [gone]);

  return (
    <FlowScreen title={L.title} facts={L.subtitle} onClose={close} closeLabel="Fermer">
      {meetup && !gone ? (
        <Meetup meetup={meetup} onChange={setMeetup} onGone={close} onRefused={() => setRefused(true)} />
      ) : gone ? (
        <View style={styles.gap} testID="spot-gone">
          <Notice>{L.unavailable}</Notice>
          <SmButton kind="s" icon="add" wide onPress={() => router.replace("/spot/nouveau")} testID="spot-gone-launch">
            {L.launch}
          </SmButton>
        </View>
      ) : loaded.error ? (
        <LoadError message={loaded.error.message} onRetry={() => void loaded.reload()} />
      ) : (
        <Muted variant="body">Chargement…</Muted>
      )}
    </FlowScreen>
  );
}

function Meetup({
  meetup,
  onChange,
  onGone,
  onRefused,
}: {
  meetup: SpotMeetupView;
  onChange: (v: SpotMeetupView) => void;
  onGone: () => void;
  onRefused: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const answer = useSpotAnswer(meetup, onChange, onRefused);
  // Fini pour l'heure d'Orasso, même sans réseau : lieu, liste et réponses disparaissent à `endsAt`.
  const over = useSpotOver(meetup);
  const start = new Date(meetup.startsAt);
  const end = new Date(meetup.endsAt);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La liste se relit à chaque nouvelle vue du rendez-vous (rafraîchissement, réponse), pas seulement quand les compteurs
  // changent : Alice qui part et Bob qui arrive laissent le total inchangé.
  const replies = useApi(() => api.spotReplies(meetup.id), [meetup, over], { enabled: !over });
  useEffect(() => {
    if (isRefused(replies.error)) onRefused();
  }, [replies.error, onRefused]);
  // « Voir plus » : les pages suivantes de « Qui vient ? » (50 par page). La relecture (toutes les 30 s) garde les pages
  // chargées tant que les compteurs et la première page ne changent pas ; sinon elle repart de la première page.
  const [more, setMore] = useState<{ items: SpotReplies["items"]; cursor: string | null }>({ items: [], cursor: null });
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const firstPageKey = useRef<string | null>(null);
  useEffect(() => {
    if (!replies.data) return;
    const key = JSON.stringify([meetup.yesCount, meetup.maybeCount, replies.data]);
    if (key === firstPageKey.current) return;
    firstPageKey.current = key;
    setMore({ items: [], cursor: replies.data.nextCursor });
    setMoreError(null);
  }, [replies.data, meetup.yesCount, meetup.maybeCount]);
  async function loadMore() {
    if (!more.cursor || moreBusy) return;
    setMoreBusy(true);
    setMoreError(null);
    try {
      const page = await api.spotReplies(meetup.id, more.cursor);
      setMore((m) => ({ items: [...m.items, ...page.items], cursor: page.nextCursor }));
    } catch (e) {
      if (isRefused(e instanceof ApiRequestError ? e : null)) onRefused();
      else setMoreError(errorMessage(e));
    } finally {
      setMoreBusy(false);
    }
  }
  const items = replies.data ? [...replies.data.items, ...more.items] : null;

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await api.cancelSpot(meetup.id);
      onGone();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  if (over) {
    return (
      <View style={styles.gap} testID="spot-ended">
        <Card>
          <View style={styles.ended}>
            <Icon name="wait" size={26} color={c.inkMuted} />
            <View style={styles.fill}>
              <Text variant="bodyStrong" color={c.ink} testID="spot-ended-title">
                {meetup.mine ? L.endedMine : L.ended}
              </Text>
              <Muted variant="caption">
                {`${L.endedHint}${meetup.mine && meetup.cameCount !== null ? ` ${L.endedCame(meetup.cameCount)}` : ""}`}
              </Muted>
            </View>
          </View>
        </Card>
        <Card>
          <Text variant="label" color={c.inkMuted}>
            {L.block}
          </Text>
          <Text variant="bodyStrong" color={c.ink} style={styles.nudge}>
            {L.empty}
          </Text>
          <SmButton kind="s" icon="add" wide onPress={() => router.replace("/spot/nouveau")} testID="spot-ended-launch">
            {L.launchShort}
          </SmButton>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.gap} testID="spot-detail">
      <Card style={styles.cardGap}>
        <View style={styles.head}>
          <Avatar url={meetup.author.avatarUrl} pseudo={meetup.author.pseudo} size={40} />
          <View style={styles.fill}>
            <Text variant="bodyStrong" color={c.ink} style={styles.title}>
              {meetup.mine ? "Ton rendez-vous au spot" : L.from(meetup.author.pseudo)}
            </Text>
            <Text variant="caption" color={c.inkMuted}>
              {`${agoLabel(meetup.createdAt, orassoNow())} · ${spotUntilLabel(start, end)}`}
            </Text>
          </View>
          <Tag tone="acc">{spotTimeLabel(start)}</Tag>
        </View>
        {meetup.place ? (
          <>
            <SpotPlaceMap id={meetup.id} label={meetup.place.label} lat={meetup.place.lat} lng={meetup.place.lng} />
            <View style={styles.place}>
              <Icon name="place" size={18} color={c.accentText} />
              <Text variant="bodyStrong" color={c.ink} style={styles.fill} testID="spot-place">
                {meetup.place.label}
              </Text>
            </View>
          </>
        ) : null}
        {meetup.note ? (
          <View style={[styles.quote, { borderColor: c.line }]}>
            <Text variant="body" color={c.ink} testID="spot-note-text">{`« ${meetup.note} »`}</Text>
          </View>
        ) : null}
        <WhoList items={items} meetup={meetup} />
        {more.cursor ? (
          <SmButton
            kind="s"
            icon="down"
            wide
            disabled={moreBusy}
            onPress={() => void loadMore()}
            testID="spot-who-more"
          >
            Voir plus
          </SmButton>
        ) : null}
        {moreError ? <LoadError message={moreError} onRetry={() => void loadMore()} /> : null}
        {replies.error ? <LoadError message={replies.error.message} onRetry={() => void replies.reload()} /> : null}
        {meetup.mine ? null : (
          <View style={styles.two}>
            {(["yes", "maybe"] as const).map((which) => (
              <View key={which} style={styles.fill}>
                <SmButton
                  kind={meetup.myAnswer === which ? "p" : "s"}
                  wide
                  icon={which === "yes" ? "check" : "help"}
                  disabled={answer.busy}
                  onPress={() => void answer.send(which)}
                  testID={`spot-${which}`}
                >
                  {which === "yes" ? L.yes : L.maybe}
                </SmButton>
              </View>
            ))}
          </View>
        )}
        {answer.error ? <Notice tone="error">{answer.error}</Notice> : null}
      </Card>
      {meetup.mine ? (
        confirming ? (
          <View style={styles.gap} testID="spot-cancel-confirm">
            <Notice>{L.cancelConfirm}</Notice>
            <View style={styles.two}>
              <View style={styles.fill}>
                <SmButton
                  kind="s"
                  icon="trash"
                  wide
                  disabled={busy}
                  onPress={() => void cancel()}
                  testID="spot-cancel-yes"
                >
                  Oui, annuler
                </SmButton>
              </View>
              <View style={styles.fill}>
                <SmButton
                  kind="s"
                  icon="back"
                  wide
                  disabled={busy}
                  onPress={() => setConfirming(false)}
                  testID="spot-cancel-no"
                >
                  Non
                </SmButton>
              </View>
            </View>
          </View>
        ) : (
          <SmButton kind="s" icon="trash" wide onPress={() => setConfirming(true)} testID="spot-cancel">
            {L.cancel}
          </SmButton>
        )
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <View style={styles.row}>
        <Icon name="lock" size={16} color={c.accentText} />
        <Text variant="caption" color={c.ink} style={styles.fill}>
          {L.privacy(spotEndLabel(start, end))}
        </Text>
      </View>
    </View>
  );
}

/** « Qui vient ? » : ceux qui viennent, puis ceux qui hésitent ; le nombre d'abord, les pseudos dessous. */
function WhoList({ items, meetup }: { items: SpotReplies["items"] | null; meetup: SpotMeetupView }) {
  const { t } = useTheme();
  const c = t.color;
  const yes = items?.filter((i) => i.answer === "yes") ?? [];
  const maybe = items?.filter((i) => i.answer === "maybe") ?? [];
  return (
    <View style={styles.who} testID="spot-who">
      <Text variant="label" color={c.inkMuted}>
        {L.who}
      </Text>
      {meetup.yesCount + meetup.maybeCount === 0 ? (
        <Muted variant="caption">{L.nobodyYet}</Muted>
      ) : (
        <>
          <Text variant="bodyStrong" color={c.ink}>
            {[
              meetup.yesCount > 0 ? L.yesCount(meetup.yesCount) : null,
              meetup.maybeCount > 0 ? L.maybeCount(meetup.maybeCount) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {[...yes, ...maybe].map((r) => (
            <View key={`${r.answer}-${r.person.pseudo}`} style={styles.person} testID="spot-person">
              <Avatar url={r.person.avatarUrl} pseudo={r.person.pseudo} size={28} />
              <Text variant="body" color={c.ink} style={styles.fill}>
                {r.person.pseudo}
              </Text>
              <Text variant="caption" color={c.inkMuted}>
                {r.answer === "yes" ? L.yes : L.maybe}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  gap: { gap: space3 },
  cardGap: { gap: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  title: { fontSize: 15, lineHeight: 20 },
  place: { flexDirection: "row", alignItems: "center", gap: space2 },
  quote: { borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1 },
  who: { gap: space2 },
  person: { flexDirection: "row", alignItems: "center", gap: space2 },
  two: { flexDirection: "row", gap: space2 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: space2 },
  ended: { flexDirection: "row", alignItems: "center", gap: space3 },
  nudge: { marginVertical: space2 },
});
