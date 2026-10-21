// Assistant d'événement de l'appli (lot 35b) : véhicules admis, places, prestataires attendus, entrée du public, mode
// d'admission. Mêmes champs que le site. Les critères (trois questions) sont dans `Temps.tsx` (lot 53).
import { Button, CheckboxField, TextField } from "@orasso/design-system/native";
import {
  eventAdmissionLabels,
  eventPublicAccessLabels,
  eventEditorLabels as L,
  ON_SITE_PAYMENT_LABEL,
  vehicleTypeLabels,
  vehicleTypes,
} from "@orasso/shared";
import { useState } from "react";

import { Muted } from "@/ui/Muted";
import { Choices, Group } from "./fields";
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
