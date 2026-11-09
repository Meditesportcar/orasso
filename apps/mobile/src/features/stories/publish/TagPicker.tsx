// @identification d'une story (lot R7f3, maquette R7.8) : un champ `@`, la liste des personnes **qui pourraient voir la story**
// (l'API filtre : `GET /users/search?taggableFor=…`, abonnés acceptés pour un compte privé, membres du crew pour une story de
// crew, tout membre pour un compte public), les personnes choisies en pastilles qu'on retire d'un toucher. La personne est
// prévenue et peut retirer l'identification ; l'API refuse de toute façon ce que la liste ne propose pas.
import { Icon, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  addTag,
  storyPublishLabels as L,
  type PersonCard,
  removeTag,
  STORY_TAGS_MAX,
  type StoryAudience,
  type StoryPersona,
  type StoryTagPick,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { Muted } from "@/ui/Muted";

const { space1, space2 } = tokens.spacing;

export type Taggable = { taggableFor: StoryAudience; crewId?: string; persona: StoryPersona };

export function TagPicker({
  tags,
  onTags,
  taggable,
  hint,
  disabled,
}: {
  tags: readonly StoryTagPick[];
  onTags: (next: StoryTagPick[]) => void;
  taggable: Taggable;
  hint: string;
  disabled: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PersonCard[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const text = q.replace(/^@/, "").trim();
  const { taggableFor, crewId, persona } = taggable;

  // La recherche part 300 ms après la dernière lettre ; un résultat qui arrive après un autre texte est jeté.
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
        const page = await api.searchTaggable(text, { taggableFor, crewId, persona });
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
  }, [text, taggableFor, crewId, persona]);

  const free = (results ?? []).filter((p) => !tags.some((x) => x.id === p.userId));
  const full = tags.length >= STORY_TAGS_MAX;
  return (
    <View style={styles.block} testID="story-tag-picker">
      <TextField
        label={L.tagFieldLabel}
        value={q}
        onChangeText={setQ}
        editable={!disabled && !full}
        placeholder={L.tagPlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        testID="story-tag-input"
      />
      <Muted variant="caption">{full ? L.tagMax : hint}</Muted>
      {text.length > 0 && text.length < 2 ? <Muted variant="caption">{L.tagTyping}</Muted> : null}
      {state === "loading" ? <Muted variant="caption">{L.tagSearching}</Muted> : null}
      {state === "error" ? (
        <Text variant="caption" color={c.winText} accessibilityRole="alert">
          {L.tagFailed}
        </Text>
      ) : null}
      {results && state === "idle" && free.length === 0 ? (
        <Muted variant="caption" testID="story-tag-none">
          {L.tagNone}
        </Muted>
      ) : null}
      {free.slice(0, 6).map((p) => (
        <Pressable
          key={p.userId}
          accessibilityRole="button"
          accessibilityLabel={`@${p.pseudo}`}
          disabled={disabled || full}
          onPress={() => {
            onTags(addTag(tags, { id: p.userId, pseudo: p.pseudo }));
            setQ("");
            setResults(null);
          }}
          style={[styles.result, { backgroundColor: c.surface, borderColor: c.line }]}
          testID="story-tag-result"
        >
          <Icon name="profile" size={18} color={c.ink} />
          <Text variant="bodyStrong" color={c.ink}>
            {`@${p.pseudo}`}
          </Text>
        </Pressable>
      ))}
      {tags.length ? (
        <View style={styles.chosen}>
          {tags.map((tag) => (
            <Pressable
              key={tag.id}
              accessibilityRole="button"
              accessibilityLabel={L.tagRemove(tag.pseudo)}
              disabled={disabled}
              onPress={() => onTags(removeTag(tags, tag.id))}
              style={[styles.chip, { backgroundColor: c.ink }]}
              testID="story-tag-chosen"
            >
              <Text variant="bodyStrong" color={c.surface}>
                {`@${tag.pseudo}`}
              </Text>
              <Icon name="close" size={14} color={c.surface} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {tags.length ? <Muted variant="caption">{L.tagWarn(tags.map((x) => x.pseudo).join(", "))}</Muted> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2 },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    padding: space2 + 2,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 1,
  },
  chosen: { flexDirection: "row", flexWrap: "wrap", gap: space1 + 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space1,
    paddingHorizontal: space2 + 2,
    paddingVertical: space1 + 2,
    borderRadius: tokens.radius.radiusPill,
  },
});
