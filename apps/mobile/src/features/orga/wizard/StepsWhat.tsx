// Assistant d'événement de l'appli (lot 35b) : les trois écrans de la première étape du site — format et titre, dates
// (un jour ou plusieurs, lot 26), lieu (recherche d'adresse par le géocodeur de l'API, ou position du téléphone).
import { Button, CheckboxField, Plate, Text, TextField, useTheme } from "@orasso/design-system/native";
import {
  dayAccesses,
  dayAccessLabels,
  eventDaysLabels,
  eventFormatLabels,
  eventEditorLabels as L,
  withAddedDay,
  withMultiDay,
} from "@orasso/shared";
import * as Location from "expo-location";
import { useState } from "react";
import { Platform, View } from "react-native";

import { api } from "@/lib/api";
import { now } from "@/lib/clock";
import { errorMessage } from "@/lib/http";
import { Muted } from "@/ui/Muted";
import { Choices, DateTimeFields, Group, TimeField, wizardStyles } from "./fields";
import type { StepContext } from "./types";

export function FormatStep({ d, set, formats }: StepContext) {
  return (
    <>
      <Choices
        label={L.format}
        options={formats.map((f) => ({ value: f, label: eventFormatLabels[f] }))}
        value={d.format}
        onChange={(f) => set("format", f)}
        testID="wizard-formats"
      />
      <TextField
        label={L.title}
        value={d.title}
        onChangeText={(v) => set("title", v)}
        maxLength={120}
        testID="wizard-title"
      />
      <TextField
        label={L.description}
        value={d.description}
        onChangeText={(v) => set("description", v)}
        multiline
        tall
        maxLength={5000}
        testID="wizard-description"
      />
    </>
  );
}

export function DatesStep({ d, set, setD }: StepContext) {
  const { t } = useTheme();
  const updateDay = (i: number, patch: Partial<StepContext["d"]["days"][number]>) =>
    setD((p) => ({ ...p, days: p.days.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  return (
    <>
      <CheckboxField
        label={eventDaysLabels.multiDay}
        checked={d.multiDay}
        onChange={(multiDay) => setD((p) => withMultiDay(p, multiDay, now()))}
      />
      {d.multiDay ? (
        <View style={wizardStyles.block} testID="wizard-days">
          {d.days.map((day, i) => (
            <Plate key={`day-${i.toString()}`} style={wizardStyles.block} testID="wizard-day">
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {`${eventDaysLabels.day} ${i + 1}`}
              </Text>
              <TextField
                label={L.date}
                value={day.date}
                placeholder={L.datePlaceholder}
                onChangeText={(v) => updateDay(i, { date: v.trim() })}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                testID={`wizard-day-${i}-date`}
              />
              <View style={wizardStyles.row}>
                <TimeField
                  label={L.start}
                  value={day.startTime}
                  onChange={(v) => updateDay(i, { startTime: v })}
                  testID={`wizard-day-${i}-start`}
                />
                <TimeField
                  label={L.end}
                  value={day.endTime}
                  onChange={(v) => updateDay(i, { endTime: v })}
                  testID={`wizard-day-${i}-end`}
                />
              </View>
              <TextField
                label={eventDaysLabels.dayCapacity}
                value={day.capacity}
                placeholder={eventDaysLabels.dayCapacityHint}
                onChangeText={(v) => updateDay(i, { capacity: v.replace(/\D/g, "") })}
                keyboardType="number-pad"
                testID={`wizard-day-${i}-capacity`}
              />
              {d.days.length > 2 ? (
                <Button
                  variant="plate"
                  tone="dashed"
                  icon="close"
                  onPress={() => setD((p) => ({ ...p, days: p.days.filter((_, j) => j !== i) }))}
                >
                  {eventDaysLabels.removeDay}
                </Button>
              ) : null}
            </Plate>
          ))}
          <Button
            variant="secondary"
            icon="add"
            onPress={() => setD((p) => withAddedDay(p, now()))}
            testID="wizard-day-add"
          >
            {eventDaysLabels.addDay}
          </Button>
          <Choices
            label={eventDaysLabels.dayAccess}
            options={dayAccesses.map((a) => ({ value: a, label: dayAccessLabels[a] }))}
            value={d.dayAccess}
            onChange={(a) => set("dayAccess", a)}
          />
        </View>
      ) : (
        <>
          <DateTimeFields
            dateLabel={L.startDate}
            timeLabel={L.startTime}
            value={d.startsAt}
            onChange={(v) => set("startsAt", v)}
            testID="wizard-start"
          />
          <DateTimeFields
            dateLabel={L.endDate}
            timeLabel={L.endTime}
            value={d.endsAt}
            onChange={(v) => set("endsAt", v)}
            testID="wizard-end"
          />
        </>
      )}
      <Muted variant="caption">{L.datesHint}</Muted>
    </>
  );
}

export function PlaceStep({ d, setD }: StepContext) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"address" | "position" | null>(null);
  const edit = (patch: Partial<StepContext["d"]>) => setD((p) => ({ ...p, ...patch, lat: null, lng: null }));

  async function checkAddress() {
    const query = [d.addressLine, d.postalCode, d.city].filter(Boolean).join(" ");
    if (query.trim().length < 3) return setStatus(L.addressTooShort);
    setBusy("address");
    setStatus(L.addressSearching);
    try {
      const { match } = await api.geocode(query);
      if (!match) {
        setD((p) => ({ ...p, lat: null, lng: null }));
        setStatus(L.addressNotFound);
        return;
      }
      setD((p) => ({
        ...p,
        lat: match.lat,
        lng: match.lng,
        postalCode: p.postalCode || match.postalCode || "",
        city: p.city || match.city || "",
      }));
      setStatus(L.addressFound(match.label));
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  /** Position précise du téléphone (le lieu de l'événement, pas la personne) ; l'adresse se remplit si le système la donne. */
  async function takePosition() {
    setBusy("position");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setStatus(L.positionDenied);
        return;
      }
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = Math.round(fix.coords.latitude * 1e6) / 1e6;
      const lng = Math.round(fix.coords.longitude * 1e6) / 1e6;
      let place: Location.LocationGeocodedAddress | undefined;
      // Adresse inverse : fournie par le système sur téléphone ; absente dans le navigateur (recette).
      if (Platform.OS !== "web") {
        place = (await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }).catch(() => []))[0];
      }
      const street = [place?.streetNumber, place?.street].filter(Boolean).join(" ");
      setD((p) => ({
        ...p,
        lat,
        lng,
        addressLine: p.addressLine || street,
        postalCode: p.postalCode || place?.postalCode || "",
        city: p.city || place?.city || "",
      }));
      setStatus(
        place && (street || place.city)
          ? L.positionFilled([street, place.postalCode, place.city].filter(Boolean).join(" "))
          : L.positionFromDevice,
      );
    } catch {
      setStatus(L.positionDenied);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <TextField
        label={L.addressLine}
        value={d.addressLine}
        onChangeText={(v) => edit({ addressLine: v })}
        maxLength={200}
        testID="wizard-address"
      />
      <View style={wizardStyles.row}>
        <TextField
          label={L.postalCode}
          value={d.postalCode}
          onChangeText={(v) => edit({ postalCode: v })}
          keyboardType="number-pad"
          maxLength={10}
          style={wizardStyles.grow}
          testID="wizard-postal-code"
        />
        <TextField
          label={L.city}
          value={d.city}
          onChangeText={(v) => edit({ city: v })}
          maxLength={80}
          style={wizardStyles.grow}
          testID="wizard-city"
        />
      </View>
      <Group label={L.steps.lieu}>
        <Button
          variant="secondary"
          icon="search"
          loading={busy === "address"}
          disabled={busy !== null}
          onPress={() => void checkAddress()}
          testID="wizard-check-address"
        >
          {L.checkAddress}
        </Button>
        <Button
          variant="secondary"
          icon="place"
          loading={busy === "position"}
          disabled={busy !== null}
          onPress={() => void takePosition()}
          testID="wizard-use-position"
        >
          {L.useMyPosition}
        </Button>
      </Group>
      <Muted variant="caption" testID="wizard-address-status">
        {status ?? (d.lat !== null ? L.positionSaved : L.addressPublic)}
      </Muted>
    </>
  );
}
