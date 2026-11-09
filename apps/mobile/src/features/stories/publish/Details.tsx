// Les détails de la story (lot R7f3, maquette R7.8 étape 3) : la légende (200 au plus), l'@identification (parmi ceux qui
// peuvent voir la story), l'autocollant d'événement (grisé, avec la raison, pour un compte privé ou une story de crew), le
// lieu (texte libre ou « Ma ville », jamais des coordonnées), la voiture du garage, puis « Qui la voit ». Organisateur, pro,
// prestataire, média : « Public » seul, au nom de la structure ou de la fiche. La ligne « Collaboration commerciale » est
// réservée au lot R7m2 (`CommercialLine`).
import { Chip, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  storyPublishLabels as L,
  STORY_CAPTION_MAX,
  STORY_PLACE_MAX,
  type StoryAudienceOption,
  type StoryAuthor,
  storyEventSticker,
  taggableHint,
} from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { CommercialLine } from "./CommercialLine";
import { audienceOption, chooseAudience, type DetailsState } from "./detailsModel";
import type { StoryDraft } from "./model";
import { Label, Option, StoryOverlays } from "./parts";
import { currentCity } from "./place";
import { StoryCanvas } from "./StoryCanvas";
import { TagPicker } from "./TagPicker";

const { space2, space3 } = tokens.spacing;

type Panel = "tag" | "event" | "place" | "vehicle" | null;

export function Details({
  draft,
  details,
  onDetails,
  author,
  visibility,
  options,
  vehicles,
  events,
  locked,
}: {
  draft: StoryDraft;
  details: DetailsState;
  onDetails: (next: DetailsState) => void;
  author: StoryAuthor;
  visibility: "public" | "private";
  options: readonly StoryAudienceOption[];
  vehicles: { id: string; label: string }[];
  events: { id: string; title: string }[];
  locked: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const win = useWindowDimensions();
  const [panel, setPanel] = useState<Panel>(null);
  const [dropped, setDropped] = useState(false);
  const [city, setCity] = useState<"idle" | "busy" | "failed">("idle");

  const chosen = audienceOption(options, details.audienceKey);
  const audience = chosen?.audience ?? "followers";
  const crewId = chosen?.crewId ?? null;
  const sticker = storyEventSticker(visibility, audience);
  const event = events.find((e) => e.id === details.eventId) ?? null;
  const vehicle = vehicles.find((v) => v.id === details.vehicleId) ?? null;
  const patch = (next: Partial<DetailsState>) => onDetails({ ...details, ...next });
  const toggle = (next: Exclude<Panel, null>) => setPanel(panel === next ? null : next);

  const previewWidth = Math.min(150, Math.round(win.width * 0.4));
  const { photo, frame } = { photo: draft.plate.photo, frame: draft.frame };

  async function fillCity() {
    setCity("busy");
    const found = await currentCity();
    if (found) {
      patch({ place: found });
      setCity("idle");
    } else setCity("failed");
  }

  const tool = (key: Exclude<Panel, null>, label: string, on: boolean, disabled = false) => (
    <Chip
      key={key}
      selected={panel === key || on}
      onPress={() => !disabled && !locked && toggle(key)}
      accessibilityLabel={disabled ? `${label} : indisponible` : label}
    >
      {label}
    </Chip>
  );

  return (
    <View style={styles.block} testID="story-details">
      <View style={styles.previewRow}>
        <StoryCanvas
          uri={photo.uri}
          width={photo.width}
          height={photo.height}
          frame={frame}
          viewWidth={previewWidth}
          testID="story-details-canvas"
        >
          <StoryOverlays
            width={previewWidth}
            data={{
              caption: details.caption,
              eventTitle: event?.title ?? null,
              place: details.place.trim() || null,
              vehicle: vehicle?.label ?? null,
              tags: details.tags.map((x) => `@${x.pseudo}`),
            }}
          />
        </StoryCanvas>
        <View style={styles.previewSide}>
          <TextField
            label={L.caption}
            value={details.caption}
            onChangeText={(caption) => patch({ caption })}
            editable={!locked}
            placeholder={L.captionPlaceholder}
            maxLength={STORY_CAPTION_MAX}
            multiline
            testID="story-caption"
          />
          <Muted variant="caption">{L.captionHint}</Muted>
        </View>
      </View>

      <Label>{L.tools}</Label>
      <View style={styles.chips} testID="story-tools">
        {tool("tag", L.toolTag, details.tags.length > 0)}
        {tool("event", L.toolEvent, Boolean(event), !sticker.allowed)}
        {tool("place", L.toolPlace, Boolean(details.place.trim()))}
        {tool("vehicle", L.toolVehicle, Boolean(vehicle))}
      </View>
      {!sticker.allowed ? (
        <Muted variant="caption" testID="story-event-disabled">
          {`${L.eventTitle} : ${sticker.reason}`}
        </Muted>
      ) : null}
      {dropped ? (
        <Notice testID="story-dropped">
          Ce public ne voit pas tout : les identifications et l'événement qui n'y valent plus ont été retirés.
        </Notice>
      ) : null}

      {panel === "tag" ? (
        <TagPicker
          tags={details.tags}
          onTags={(tags) => patch({ tags })}
          taggable={{ taggableFor: audience, crewId: crewId ?? undefined, persona: author.persona }}
          hint={taggableHint(audience, visibility, author.persona)}
          disabled={locked}
        />
      ) : null}
      {panel === "event" && sticker.allowed ? (
        <View style={styles.panel} testID="story-event-panel">
          <Text variant="bodyStrong" color={c.ink}>
            {L.eventTitle}
          </Text>
          {events.length ? (
            <View style={styles.chips}>
              {events.map((e) => (
                <Chip
                  key={e.id}
                  selected={details.eventId === e.id}
                  onPress={() => !locked && patch({ eventId: details.eventId === e.id ? null : e.id })}
                >
                  {e.title}
                </Chip>
              ))}
            </View>
          ) : (
            <Muted variant="caption">{L.eventNone}</Muted>
          )}
          <Muted variant="caption">{details.eventId ? L.eventWarn : L.eventHint}</Muted>
        </View>
      ) : null}
      {panel === "place" ? (
        <View style={styles.panel} testID="story-place-panel">
          <TextField
            label={L.placeTitle}
            value={details.place}
            onChangeText={(place) => patch({ place })}
            editable={!locked}
            placeholder={L.placePlaceholder}
            maxLength={STORY_PLACE_MAX}
            testID="story-place"
          />
          <Muted variant="caption">{city === "failed" ? L.placeFailed : L.placeHint}</Muted>
          <View style={styles.chips}>
            <SmButton
              kind="s"
              icon="place"
              disabled={locked || city === "busy"}
              onPress={() => void fillCity()}
              testID="story-place-city"
            >
              {city === "busy" ? L.placeUsing : L.placeUse}
            </SmButton>
          </View>
        </View>
      ) : null}
      {panel === "vehicle" ? (
        <View style={styles.panel} testID="story-vehicle-panel">
          <Text variant="bodyStrong" color={c.ink}>
            {L.vehicleTitle}
          </Text>
          {vehicles.length ? (
            <View style={styles.chips}>
              {vehicles.map((v) => (
                <Chip
                  key={v.id}
                  selected={details.vehicleId === v.id}
                  onPress={() => !locked && patch({ vehicleId: details.vehicleId === v.id ? null : v.id })}
                >
                  {v.label}
                </Chip>
              ))}
            </View>
          ) : (
            <Muted variant="caption">{L.vehicleNone}</Muted>
          )}
        </View>
      ) : null}

      <CommercialLine taggedProIds={[]} />

      <Label>{L.audienceTitle}</Label>
      <View style={styles.panel} testID="story-audience">
        {options.map((o) => (
          <Option
            key={o.key}
            icon={o.audience === "crew" ? "shield" : o.audience === "public" ? "explore" : "profile"}
            title={o.label}
            hint={o.hint}
            selected={chosen?.key === o.key}
            disabled={locked || options.length === 1}
            onPress={() => {
              const next = chooseAudience(details, options, o.key);
              setDropped(next.dropped);
              onDetails(next.state);
            }}
            testID={`story-audience-${o.audience}`}
          />
        ))}
      </View>
      <Muted variant="caption">{L.audienceNote}</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2 },
  previewRow: { flexDirection: "row", gap: space3, alignItems: "flex-start" },
  previewSide: { flex: 1, gap: space2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  panel: { gap: space2 },
});
