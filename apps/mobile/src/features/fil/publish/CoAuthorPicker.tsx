// Le choix d'un co-auteur (lot R8o, maquette R8.13 `p-collab`, vue « pub ») : les quatre puces (une personne, une structure, un
// pro, un média), la recherche par le nom (deux lettres au moins : pas d'annuaire) et ses résultats. Aucune règle ici : l'API
// cherche et revérifie tout à l'envoi.
import { Chip, Icon, type IconName, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  COAUTHOR_SEARCH_MIN_CHARS,
  type CoAuthorSearchItem,
  type CoauthorKind,
  coauthorKindChip,
  coauthorKinds,
  coauthorLabels as T,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";

const { space1, space2, space3 } = tokens.spacing;

/** L'icône d'un genre de co-auteur (celles de « Publier en tant que »). */
export const coAuthorIcon = (kind: CoauthorKind): IconName =>
  kind === "user" ? "profile" : kind === "structure" ? "home" : kind === "pro" ? "briefcase" : "camera";

export function CoAuthorPicker({
  onPick,
  disabled,
}: {
  onPick: (item: CoAuthorSearchItem) => void;
  disabled: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [kind, setKind] = useState<CoauthorKind | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CoAuthorSearchItem[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const text = q.trim();

  // 300 ms après la dernière lettre ; une réponse arrivée après un autre texte ou un autre genre est jetée.
  useEffect(() => {
    if ([...text].length < COAUTHOR_SEARCH_MIN_CHARS) {
      setResults(null);
      setState("idle");
      return;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const page = await api.coAuthorSearch(text, kind ?? undefined);
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
  }, [text, kind]);

  return (
    <View style={styles.block} testID="coauthor-picker">
      <View style={styles.chips} accessibilityRole="radiogroup">
        {coauthorKinds.map((k) => (
          <Chip
            key={k}
            selected={kind === k}
            accessibilityRole="radio"
            onPress={() => !disabled && setKind((cur) => (cur === k ? null : k))}
          >
            {coauthorKindChip(k)}
          </Chip>
        ))}
      </View>
      <TextField
        label={T.pickSearch}
        value={q}
        onChangeText={setQ}
        editable={!disabled}
        placeholder={T.pickSearchHint}
        autoCapitalize="none"
        autoCorrect={false}
        testID="coauthor-input"
      />
      {state === "loading" ? (
        <Muted variant="caption" testID="coauthor-loading">
          {T.pickLoading}
        </Muted>
      ) : null}
      {state === "error" ? (
        <Text variant="caption" color={c.winText} accessibilityRole="alert" testID="coauthor-error">
          {T.pickFailed}
        </Text>
      ) : null}
      {results && state === "idle" && results.length === 0 ? (
        <Muted variant="caption" testID="coauthor-none">
          {T.pickNone}
        </Muted>
      ) : null}
      {(results ?? []).map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={item.partner ? `${item.name}. ${T.partnerTag}` : item.name}
          disabled={disabled}
          onPress={() => onPick(item)}
          style={[styles.result, { backgroundColor: c.surface, borderColor: c.line }]}
          testID="coauthor-result"
        >
          {item.avatarUrl ? (
            <Avatar url={item.avatarUrl} pseudo={item.name} size={32} />
          ) : (
            <Icon name={coAuthorIcon(item.kind)} size={22} color={c.ink} />
          )}
          <View style={styles.flex}>
            <Text variant="bodyStrong" color={c.ink}>
              {item.name}
            </Text>
            <Text variant="caption" color={c.inkMuted}>
              {item.partner ? `${coauthorKindChip(item.kind)} · ${T.partnerTag}` : coauthorKindChip(item.kind)}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  flex: { flex: 1, flexShrink: 1 },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    minHeight: tokens.spacing.touch,
    paddingHorizontal: space3,
    paddingVertical: space1 + 2,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: space1 / 2,
  },
});
