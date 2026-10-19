// Section « Le O vivant » de la recette native /_ds (lot 39) : les huit variantes du prototype `s-olive` (battle en
// tandem, chargement, tirer pour actualiser, candidature envoyée, envoi de photos, état vide, tampon, bouton central),
// chacune avec son bouton, un « Rejouer » qui relance tout, et le fond animé « battle ».

import {
  Button,
  EmptyState,
  Ground,
  OLoader,
  OpeningBattle,
  PullToRefresh,
  SendBurst,
  SendProgress,
  StampDrop,
  TabBar,
  Text,
  type ThemeTokens,
  tabSets,
  useOliveRefresh,
} from "@orasso/design-system/native";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

/** Une carte de variante : la scène, le titre et le texte du prototype, l'action. */
function Card({
  t,
  title,
  text,
  stage,
  children,
  testID,
}: {
  t: ThemeTokens;
  title: string;
  text: string;
  stage: ReactNode;
  children?: ReactNode;
  testID: string;
}) {
  return (
    <View testID={testID} style={[styles.card, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}>
      <View style={[styles.stage, { backgroundColor: t.color.surfaceRaised }]}>{stage}</View>
      <View style={styles.body}>
        <Text variant="bodyStrong" color={t.color.ink}>
          {title}
        </Text>
        <Text variant="caption" color={t.color.inkMuted}>
          {text}
        </Text>
        {children ? <View style={styles.actions}>{children}</View> : null}
      </View>
    </View>
  );
}

function PullDemo({ t, playKey }: { t: ThemeTokens; playKey: number }) {
  const refresh = useOliveRefresh(() => new Promise((resolve) => setTimeout(resolve, 1500)));
  // biome-ignore lint/correctness/useExhaustiveDependencies: « Rejouer » relance l'actualisation
  useEffect(() => {
    if (playKey > 0) refresh.trigger();
  }, [playKey]);
  return (
    <Card
      t={t}
      testID="olive-pull"
      title="Tirer pour actualiser"
      text="Le O descend, la voiture drifte le temps de recharger."
      stage={
        <View style={styles.pullBox}>
          <PullToRefresh state={refresh}>
            <ScrollView onScroll={refresh.onScroll} scrollEventThrottle={16} contentContainerStyle={styles.list}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[styles.row, { backgroundColor: t.color.surface }]} />
              ))}
            </ScrollView>
          </PullToRefresh>
        </View>
      }
    >
      <Button variant="secondary" icon="undo" onPress={refresh.trigger}>
        Tirer
      </Button>
    </Card>
  );
}

function UploadDemo({ t, playKey }: { t: ThemeTokens; playKey: number }) {
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const start = () => {
    if (timer.current) clearInterval(timer.current);
    setProgress(0);
    timer.current = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(1, p + 0.08);
        if (next >= 1 && timer.current) clearInterval(timer.current);
        return next;
      });
    }, 120);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: « Rejouer » relance l'envoi
  useEffect(() => {
    start();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playKey]);
  return (
    <Card
      t={t}
      testID="olive-upload"
      title="Envoi de photos"
      text="La voiture avance sur la route au rythme de l'envoi et se gare à 100 %."
      stage={
        <View style={styles.road}>
          <SendProgress progress={progress} />
        </View>
      }
    >
      <Button variant="secondary" icon="export" onPress={start}>
        Envoyer 3 photos
      </Button>
    </Card>
  );
}

export function OliveContent({ t }: { t: ThemeTokens }) {
  const [play, setPlay] = useState(0);
  const [hero, setHero] = useState(0);
  const [loading, setLoading] = useState(true);
  const [send, setSend] = useState(0);
  const [empty, setEmpty] = useState(0);
  const [stamp, setStamp] = useState(0);
  const [tab, setTab] = useState<string>(tabSets.exhibitor[2]?.id ?? "");
  const all = play;
  return (
    <View style={styles.stack}>
      <Button variant="secondary" icon="undo" onPress={() => setPlay((n) => n + 1)}>
        Rejouer
      </Button>

      <View testID="olive-hero" style={[styles.hero, { backgroundColor: t.color.poster }]}>
        <View style={styles.heroStage}>
          <OpeningBattle bare logoWidth={240} tone={t.id === "beton" ? "light" : "dark"} playKey={`${all}-${hero}`} />
        </View>
        <Text variant="label" color={t.color.posterMuted}>
          Lancement de l'appli
        </Text>
        <Text variant="posterL" color={t.color.posterInk}>
          Battle en tandem
        </Text>
        <Text variant="caption" color={t.color.posterMuted}>
          Deux voitures en drift autour du O, l'une chasse l'autre. La première finit garée dedans.
        </Text>
        <View style={styles.actions}>
          <Button variant="poster" icon="undo" onPress={() => setHero((n) => n + 1)}>
            Rejouer
          </Button>
        </View>
      </View>

      <Card
        t={t}
        testID="olive-load"
        title="Chargement"
        text="Une voiture en drift continu autour du O, avec la fumée. Quand c'est prêt, elle se gare dedans."
        stage={<OLoader key={all} size={90} done={!loading} />}
      >
        <Button variant="secondary" icon="undo" onPress={() => setLoading(true)}>
          Charger
        </Button>
        <Button variant="secondary" icon="check" onPress={() => setLoading(false)}>
          Terminer
        </Button>
      </Card>

      <PullDemo t={t} playKey={all} />

      <Card
        t={t}
        testID="olive-send"
        title="Candidature envoyée"
        text="Un tour de drift, elle se gare, le O s'allume."
        stage={<SendBurst size={90} playKey={`${all}-${send}`} />}
      >
        <Button variant="secondary" icon="next" onPress={() => setSend((n) => n + 1)}>
          Envoyer
        </Button>
      </Card>

      <UploadDemo t={t} playKey={all} />

      <Card
        t={t}
        testID="olive-empty"
        title="État vide"
        text="Place libre en pointillés. La voiture attend dehors."
        stage={<EmptyState width={150} title="Aucune sortie" playKey={`${all}-${empty}`} />}
      >
        <Button variant="secondary" icon="undo" onPress={() => setEmpty((n) => n + 1)}>
          Rejouer
        </Button>
      </Card>

      <Card
        t={t}
        testID="olive-stamp"
        title="Tampon du passeport"
        text="Le O frappe la page au scan, l'encre bave un peu."
        stage={<StampDrop seed={66} playKey={`${all}-${stamp}`} />}
      >
        <Button variant="secondary" icon="stamp" onPress={() => setStamp((n) => n + 1)}>
          Tamponner
        </Button>
      </Card>

      <Card
        t={t}
        testID="olive-tab"
        title="Bouton central de la barre"
        text="Sur l'Accueil, la voiture est garée dans le O. Ailleurs, elle sort. Essaie les onglets."
        stage={
          <View style={styles.tabStage}>
            <TabBar set="exhibitor" active={tab} onSelect={setTab} />
          </View>
        }
      />

      <Text variant="label" color={t.color.inkMuted}>
        Fond animé « battle »
      </Text>
      <View testID="olive-ground" style={styles.phone}>
        <Ground variant="battle" />
      </View>
      <Text variant="caption" color={t.color.inkMuted}>
        Avec la réduction des animations activée sur le téléphone : la voiture est déjà garée et tout apparaît en fondu
        de 120 ms.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  hero: { borderRadius: 24, padding: 14, gap: 4, overflow: "hidden" },
  heroStage: { height: 230, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 18, overflow: "hidden" },
  stage: { minHeight: 150, paddingVertical: 8, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  body: { padding: 12, gap: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  list: { padding: 12, gap: 6 },
  row: { height: 26, borderRadius: 8, width: 300 },
  road: { width: "100%", paddingHorizontal: 12 },
  pullBox: { height: 150, alignSelf: "stretch" },
  tabStage: { width: "100%", paddingHorizontal: 10 },
  phone: { height: 360, borderRadius: 30, overflow: "hidden", marginHorizontal: -16 },
});
