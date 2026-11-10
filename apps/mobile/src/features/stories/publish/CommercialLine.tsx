// La ligne « Collaboration commerciale » de l'écran de publication, pour une story (étape Détails) comme pour une publication du
// Fil (lot R7m2, maquette R7.21 `pc_pub`).
//   - Un partenaire actif est cité dans la légende (`@wrap-66`) : la ligne « Collaboration commerciale · Wrap 66 » est là,
//     NON décochable (« Obligatoire pour un contenu fait avec ton partenaire »), avec la note de la loi du 9 juin 2023. C'est
//     l'API qui pose la mention ; l'écran l'annonce avant l'envoi.
//   - Sinon : « Poser "Collaboration commerciale" moi-même », pour un contenu fait avec une marque ; on choisit le pro parmi
//     les fiches publiées (`GET /pros?q=`), puis son `id` part dans `commercialPartnerId`.
// Les partenaires viennent de `GET /me/partnerships` (la lecture est à moi seul, rangée par compte par `useApi`).
import { Icon, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  type CommercialDraft,
  type CommercialLineState,
  type CommercialPartnerNamed,
  commercialLineState,
  partnershipLabels as L,
  type ProCard,
} from "@orasso/shared";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Option } from "./parts";

const { space1, space2 } = tokens.spacing;

/** Mes partenaires actifs et l'état de la ligne d'après la légende ; `partners` reste vide tant que la lecture n'a pas répondu. */
export function useCommercialLine(caption: string, draft: CommercialDraft): CommercialLineState {
  const mine = useApi(() => api.myPartnerships(), [], { cacheKey: "my-partnerships" });
  const partners = useMemo<CommercialPartnerNamed[]>(
    () => (mine.data?.items ?? []).map((i) => ({ proId: i.pro.proId, slug: i.pro.slug, name: i.pro.name })),
    [mine.data],
  );
  return useMemo(() => commercialLineState(partners, [], caption, draft), [partners, caption, draft]);
}

/** « Collaboration commerciale · Wrap 66 » quand la mention sera posée (partenaire cité, ou pro choisi), sinon `null`. */
export function commercialText(line: CommercialLineState): string | null {
  if (line.kind === "required") return L.commercialLine(line.name);
  return line.on && line.pick ? L.commercialLine(line.pick.name) : null;
}

export function CommercialLine({
  line,
  onDraft,
  disabled,
  kind,
}: {
  line: CommercialLineState;
  onDraft: (draft: CommercialDraft) => void;
  disabled: boolean;
  /** Ce que le pro peut faire de la mention : une story se repartage, une publication ne fait que prévenir. */
  kind: "story" | "post";
}) {
  if (line.kind === "required") {
    return (
      <View style={styles.block} testID="commercial-line">
        <Option
          icon="briefcase"
          title={L.commercialLine(line.name)}
          hint={L.commercialRequired}
          selected
          disabled
          onPress={() => undefined}
          testID="commercial-required"
          role="button"
        />
        <Muted variant="caption" testID="commercial-notified">
          {kind === "story" ? L.commercialNotifiedStory(line.name) : L.commercialNotifiedPost(line.name)}
        </Muted>
        <Muted variant="caption">{L.commercialLaw}</Muted>
      </View>
    );
  }
  const toggle = () => onDraft({ on: !line.on, pick: line.on ? null : line.pick });
  return (
    <View style={styles.block} testID="commercial-line">
      <Option
        icon="briefcase"
        title={L.commercialSelf}
        hint={L.commercialSelfHint}
        selected={line.on}
        disabled={disabled}
        onPress={toggle}
        testID="commercial-self"
        role="button"
      />
      {line.on ? (
        <ProPicker pick={line.pick} onPick={(pick) => onDraft({ on: true, pick })} disabled={disabled} kind={kind} />
      ) : null}
      {line.on ? <Muted variant="caption">{L.commercialLaw}</Muted> : null}
    </View>
  );
}

/** Recherche d'une fiche pro publiée par son nom (deux lettres au moins : pas d'annuaire), puis le choix en pastille. */
function ProPicker({
  pick,
  onPick,
  disabled,
  kind,
}: {
  pick: CommercialDraft["pick"];
  onPick: (pick: CommercialDraft["pick"]) => void;
  disabled: boolean;
  kind: "story" | "post";
}) {
  const { t } = useTheme();
  const c = t.color;
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProCard[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const text = q.trim();

  // 300 ms après la dernière lettre ; une réponse arrivée après un autre texte est jetée.
  useEffect(() => {
    if (text.length < 2) {
      setResults(null);
      setState("idle");
      return;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const page = await api.explorePros({ q: text, limit: 6 });
        if (stale) return;
        setResults(page.items);
        setState("idle");
      } catch {
        if (!stale) setState("error");
      }
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [text]);

  async function choose(card: ProCard) {
    setState("loading");
    try {
      const pro = await api.proBySlug(card.slug);
      onPick({ id: pro.id, name: pro.name });
      setQ("");
      setResults(null);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <View style={styles.block} testID="commercial-picker">
      {pick ? (
        <View style={styles.chosenRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={L.commercialChange}
            disabled={disabled}
            onPress={() => onPick(null)}
            style={[styles.chip, { backgroundColor: c.ink }]}
            testID="commercial-picked"
          >
            <Icon name="briefcase" size={14} color={c.surface} />
            <Text variant="bodyStrong" color={c.surface}>
              {L.commercialPicked(pick.name)}
            </Text>
            <Icon name="close" size={14} color={c.surface} />
          </Pressable>
          <Muted variant="caption">
            {kind === "story" ? L.commercialNotifiedStory(pick.name) : L.commercialNotifiedPost(pick.name)}
          </Muted>
        </View>
      ) : (
        <>
          <TextField
            label={L.commercialPick}
            value={q}
            onChangeText={setQ}
            editable={!disabled}
            placeholder={L.commercialPickPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            testID="commercial-input"
          />
          {state === "error" ? (
            <Text variant="caption" color={c.winText} accessibilityRole="alert" testID="commercial-error">
              {L.commercialPickError}
            </Text>
          ) : null}
          {results && state === "idle" && results.length === 0 ? (
            <Muted variant="caption" testID="commercial-none">
              {L.commercialPickEmpty}
            </Muted>
          ) : null}
          {(results ?? []).map((p) => (
            <Pressable
              key={p.slug}
              accessibilityRole="button"
              accessibilityLabel={p.name}
              disabled={disabled}
              onPress={() => void choose(p)}
              style={[styles.result, { backgroundColor: c.surface, borderColor: c.line }]}
              testID="commercial-result"
            >
              <Icon name="briefcase" size={18} color={c.ink} />
              <Text variant="bodyStrong" color={c.ink}>
                {p.name}
              </Text>
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2 },
  chosenRow: { gap: space1 },
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space1 + 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
  },
});
