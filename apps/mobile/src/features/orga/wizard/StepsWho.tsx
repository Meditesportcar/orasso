// Assistant d'événement de l'appli (lot 35b) : véhicules admis, places, prestataires attendus, entrée du public, mode
// d'admission et critères (catégories, origine, marques en liste blanche, précisions). Mêmes champs que le site.
import { Button, CheckboxField, Chip, Plate, Text, TextField, useTheme } from "@orasso/design-system/native";
import {
  criteriaCountries,
  eventAdmissionLabels,
  eventPublicAccessLabels,
  eventEditorLabels as L,
  ON_SITE_PAYMENT_LABEL,
  vehicleTypeLabels,
  vehicleTypes,
} from "@orasso/shared";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { Muted } from "@/ui/Muted";
import { Choices, Group, MultiChoices, wizardStyles } from "./fields";
import { type StepContext, toggle } from "./types";

export function VehiclesStep({ d, set }: StepContext) {
  return (
    <>
      <Group label={L.vehicleTypes} testID="wizard-vehicle-types">
        {vehicleTypes.map((v) => (
          <CheckboxField
            key={v}
            label={vehicleTypeLabels[v]}
            checked={d.vehicleTypes.includes(v)}
            onChange={() => set("vehicleTypes", toggle(d.vehicleTypes, v))}
          />
        ))}
      </Group>
      <TextField
        label={L.maxVehicles}
        value={d.maxVehiclesPerUser}
        onChangeText={(v) => set("maxVehiclesPerUser", v.replace(/\D/g, "").slice(0, 2))}
        keyboardType="number-pad"
        help={L.maxVehiclesHint}
        testID="wizard-max-vehicles"
      />
    </>
  );
}

export function PlacesStep({ d, set }: StepContext) {
  return (
    <>
      <Choices
        label={L.capacityTitle}
        options={[
          { value: "unlimited", label: L.unlimited },
          { value: "limited", label: L.limited },
        ]}
        value={d.unlimited ? "unlimited" : "limited"}
        onChange={(v) => set("unlimited", v === "unlimited")}
        testID="wizard-capacity-mode"
      />
      {!d.unlimited ? (
        <TextField
          label={L.capacityTitle}
          value={d.capacity}
          onChangeText={(v) => set("capacity", v.replace(/\D/g, ""))}
          keyboardType="number-pad"
          testID="wizard-capacity"
        />
      ) : null}
      <Muted variant="body">{L.capacityHint}</Muted>
    </>
  );
}

export function VendorsStep({ d, set, vendorSuggestions }: StepContext) {
  const [custom, setCustom] = useState("");
  const options = [...vendorSuggestions, ...d.vendorTypes.filter((v) => !vendorSuggestions.includes(v))];
  return (
    <>
      <Muted variant="body">{L.vendorsIntro}</Muted>
      <Group label={L.vendorsTitle} testID="wizard-vendors">
        {options.map((v) => (
          <CheckboxField
            key={v}
            label={v}
            checked={d.vendorTypes.includes(v)}
            onChange={() => set("vendorTypes", toggle(d.vendorTypes, v))}
          />
        ))}
      </Group>
      <TextField
        label={L.customVendor}
        value={custom}
        onChangeText={setCustom}
        maxLength={40}
        testID="wizard-vendor-custom"
      />
      <Button
        variant="secondary"
        icon="add"
        disabled={!custom.trim()}
        onPress={() => {
          const v = custom.trim();
          if (v && !d.vendorTypes.includes(v)) set("vendorTypes", [...d.vendorTypes, v]);
          setCustom("");
        }}
      >
        {L.add}
      </Button>
    </>
  );
}

export function PublicStep({ d, set }: StepContext) {
  return (
    <>
      <Choices
        label={L.publicTitle}
        options={(["free", "free_reservation", "paid_orasso", "paid_external", "closed"] as const).map((p) => ({
          value: p,
          label: eventPublicAccessLabels[p],
        }))}
        value={d.publicAccess}
        onChange={(p) => set("publicAccess", p)}
        testID="wizard-public"
      />
      {d.publicAccess === "paid_external" ? (
        <>
          <Choices
            label={L.paymentTitle}
            options={[
              { value: "link" as const, label: L.paymentLink },
              { value: "on_site" as const, label: L.paymentOnSite },
            ]}
            value={d.paymentMode}
            onChange={(m) => set("paymentMode", m)}
          />
          {d.paymentMode === "link" ? (
            <TextField
              label={L.ticketUrl}
              value={d.externalTicketUrl}
              onChangeText={(v) => set("externalTicketUrl", v)}
              placeholder="https://"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              testID="wizard-ticket-url"
            />
          ) : (
            <Muted variant="body">{L.onSiteHint(ON_SITE_PAYMENT_LABEL)}</Muted>
          )}
        </>
      ) : null}
      {d.publicAccess === "free_reservation" || d.publicAccess === "paid_orasso" ? (
        <Muted variant="body">
          {d.publicAccess === "free_reservation" ? L.freeReservationHint : L.paidOrassoHint}
          {L.ticketingLater(d.publicAccess === "paid_orasso")}
        </Muted>
      ) : null}
    </>
  );
}

export function AdmissionStep({ d, set }: StepContext) {
  return (
    <>
      <Choices
        label={L.admissionTitle}
        options={(["open", "filtered", "invite_only"] as const).map((a) => ({
          value: a,
          label: eventAdmissionLabels[a],
        }))}
        value={d.admission}
        onChange={(a) => set("admission", a)}
        testID="wizard-admission"
      />
      <Muted variant="body">
        {d.admission === "open"
          ? L.admissionOpen
          : d.admission === "invite_only"
            ? L.admissionInvite
            : L.admissionFiltered}
      </Muted>
    </>
  );
}

/** Marques : beaucoup trop pour des pastilles ; une recherche, les marques retenues en tête. */
function MakesPicker({ d, set, makes }: StepContext) {
  const { t } = useTheme();
  const [q, setQ] = useState("");
  const list = useMemo(() => makes.filter((m) => m.name !== "Autre"), [makes]);
  const chosen = list.filter((m) => d.makeIds.includes(m.id));
  const needle = q.trim().toLowerCase();
  const found = needle
    ? list.filter((m) => !d.makeIds.includes(m.id) && m.name.toLowerCase().includes(needle)).slice(0, 12)
    : [];
  return (
    <Group label={L.makes} testID="wizard-makes">
      {chosen.length > 0 ? (
        <Plate style={wizardStyles.block}>
          <Text variant="caption" color={t.color.plateMuted}>
            {L.makesChosen(chosen.length)}
          </Text>
          <View style={wizardStyles.row}>
            {chosen.map((m) => (
              <Chip
                key={m.id}
                surface="plate"
                selected
                onPress={() => set("makeIds", toggle(d.makeIds, m.id))}
                accessibilityLabel={m.name}
              >
                {m.name}
              </Chip>
            ))}
          </View>
        </Plate>
      ) : null}
      <TextField label={L.makesSearch} value={q} onChangeText={setQ} autoCorrect={false} testID="wizard-makes-search" />
      {found.map((m) => (
        <CheckboxField
          key={m.id}
          label={m.name}
          checked={false}
          onChange={() => {
            set("makeIds", toggle(d.makeIds, m.id));
            setQ("");
          }}
        />
      ))}
    </Group>
  );
}

export function CriteriaStep(ctx: StepContext) {
  const { d, set, categories } = ctx;
  return (
    <>
      <Muted variant="body">{L.criteriaIntro}</Muted>
      <MultiChoices
        label={L.categories}
        options={categories.map((c) => ({ value: c.id, label: c.label }))}
        values={d.categoryIds}
        onToggle={(id) => set("categoryIds", toggle(d.categoryIds, id))}
        testID="wizard-categories"
      />
      <MultiChoices
        label={L.countries}
        options={criteriaCountries.map(([code, label]) => ({ value: code, label }))}
        values={d.countries}
        onToggle={(code) => set("countries", toggle(d.countries, code))}
      />
      <MakesPicker {...ctx} />
      <TextField
        label={L.criteriaText}
        value={d.criteriaText}
        onChangeText={(v) => set("criteriaText", v)}
        multiline
        tall
        maxLength={1000}
        help={L.criteriaTextHint}
      />
    </>
  );
}
