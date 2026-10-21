// Casquette Organisateur, billetterie d'un événement (lot 35c, D20) : ouverture, nom du billet, places, prix, et compte
// Stripe de la structure (billets payants, mode présentation). Mêmes règles et mêmes phrases que la page de l'événement
// sur le site ; l'API juge (interrupteur général, capacité, propriétaire seul pour Stripe, structure suspendue : son
// message s'affiche tel quel). Le parcours Stripe s'ouvre dans le navigateur du téléphone ; l'état est relu au retour.
import {
  Button,
  CheckboxField,
  Chip,
  ChipRow,
  Counters,
  Plate,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { eventPublicAccessLabels, ticketingAppLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, StyleSheet } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { isTwoFactorError } from "@/lib/orga";
import { useSession } from "@/lib/session";
import { formOf, isStructureOwner, isTicketed, stripeStep, type TicketingForm, ticketingBody } from "@/lib/ticketing";
import { useApi } from "@/lib/useApi";
import { Feedback } from "@/ui/Feedback";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";
import { ConfirmSheet } from "./ConfirmSheet";
import { OrgaFailure, TwoFactorGate, useOrga } from "./OrgaGate";

const { space2, space3 } = tokens.spacing;

export function Ticketing({ eventId }: { eventId: string }) {
  const { t } = useTheme();
  const router = useRouter();
  const { structureId, structureName } = useOrga();
  const { me } = useSession();
  const event = useApi(() => api.orgEvent(eventId), [eventId]);
  const ticketing = useApi(() => api.eventTicketing(eventId), [eventId]);
  const [form, setForm] = useState<TicketingForm | null>(null);
  const dirty = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);

  const e = event.data;
  const tk = ticketing.data;
  const foreign = e ? e.structure.id !== structureId : false;
  const paid = e?.publicAccess === "paid_orasso";
  const step = tk ? stripeStep(tk.stripe) : null;
  // Le compte Stripe se connecte et se déconnecte par le propriétaire seulement : les autres voient l'état, sans bouton.
  const isOwner = isStructureOwner(me?.memberships, structureId);

  // Les champs reprennent les réglages de l'API, sauf pendant une saisie non enregistrée.
  useEffect(() => {
    if (tk && !dirty.current) setForm(formOf(tk));
  }, [tk]);

  // Retour dans l'appli (après le parcours Stripe dans le navigateur) : l'état du compte est relu.
  const reloadRef = useRef(ticketing.reload);
  reloadRef.current = ticketing.reload;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void reloadRef.current();
    });
    return () => sub.remove();
  }, []);

  // Double authentification exigée par l'API : l'étape existante (se reconnecter avec son code) ; sinon le message de l'API.
  const fail = (err: unknown) => {
    setError(errorMessage(err));
    setTwoFactor(isTwoFactorError(err));
  };

  const edit = (patch: Partial<TicketingForm>) => {
    dirty.current = true;
    setForm((f) => (f ? { ...f, ...patch } : f));
  };

  async function save() {
    if (!form) return;
    const parsed = ticketingBody(form, paid);
    if ("error" in parsed) return setError(parsed.error);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const fresh = await api.configureTicketing(eventId, parsed.body);
      dirty.current = false;
      ticketing.setData(fresh);
      setForm(formOf(fresh));
      setNotice(L.saved);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.startStripeConnect(structureId);
      setOpened(true);
      await Linking.openURL(url);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await api.disconnectStripe(structureId);
      await ticketing.reload();
      setConfirm(false);
      setOpened(false);
      setNotice(L.stripeDisconnected);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const open = tk?.block === null;
  return (
    <FlowScreen
      title={L.title}
      facts={e?.title ?? structureName}
      onClose={() => (router.canGoBack() ? router.back() : router.replace(`/evenement/${eventId}`))}
      onRefresh={async () => {
        await Promise.all([event.reload(), ticketing.reload()]);
      }}
      overlays={
        <ConfirmSheet
          visible={confirm}
          title={L.stripeDisconnectTitle}
          body={L.stripeDisconnectBody}
          confirmLabel={L.stripeDisconnect}
          confirmIcon="close"
          danger
          busy={busy}
          error={confirm ? error : null}
          onConfirm={() => void disconnect()}
          onClose={() => {
            setConfirm(false);
            setError(null);
          }}
        />
      }
    >
      <Button variant="plate" icon="back" onPress={() => router.replace(`/evenement/${eventId}`)} fullWidth>
        {L.back}
      </Button>
      <OrgaFailure error={event.error ?? ticketing.error} />
      {twoFactor ? <TwoFactorGate primary={false} /> : null}
      {foreign ? <Notice tone="error">{L.foreign}</Notice> : null}

      {e && !foreign && !isTicketed(e.publicAccess) ? (
        <Notice>{L.notTicketed(eventPublicAccessLabels[e.publicAccess])}</Notice>
      ) : null}

      {e && !foreign && isTicketed(e.publicAccess) && tk && form ? (
        <>
          <Plate style={styles.block} testID="ticketing">
            <ChipRow>
              <Chip surface="plate" selected={open}>
                {open ? L.stateOpen : (tk.blockLabel ?? L.stateClosed)}
              </Chip>
            </ChipRow>
            <Text variant="body" color={t.color.plateMuted}>
              {paid ? L.paidText : L.freeText}
            </Text>
          </Plate>

          {!paid && !tk.generalSwitch ? <Notice tone="error">{L.generalOff}</Notice> : null}

          <Counters
            items={[
              { value: tk.sold, label: L.sold },
              { value: tk.used, label: L.used },
            ]}
          />

          <SectionTitle>{L.title}</SectionTitle>
          <Plate style={styles.block} testID="ticketing-form">
            <CheckboxField label={L.enabled} checked={form.enabled} onChange={(enabled) => edit({ enabled })} />
            <TextField
              label={L.name}
              value={form.name}
              onChangeText={(name) => edit({ name })}
              maxLength={60}
              testID="ticketing-name"
            />
            <TextField
              label={L.capacity}
              help={L.capacityHelp}
              value={form.capacity}
              onChangeText={(capacity) => edit({ capacity })}
              keyboardType="number-pad"
              testID="ticketing-capacity"
            />
            {paid ? (
              <TextField
                label={L.price}
                help={L.priceHelp}
                value={form.price}
                onChangeText={(price) => edit({ price })}
                keyboardType="decimal-pad"
                testID="ticketing-price"
              />
            ) : null}
            <Feedback error={confirm ? null : error} notice={notice} testID="ticketing-notice" />
            <Button
              variant="primary"
              icon="check"
              loading={busy}
              onPress={() => void save()}
              fullWidth
              testID="ticketing-save"
            >
              {L.save}
            </Button>
          </Plate>

          {paid ? (
            <>
              <SectionTitle>{L.stripeTitle}</SectionTitle>
              <Plate style={styles.block} testID="stripe">
                {step === "soon" ? (
                  <Text variant="body" color={t.color.plateInk} testID="stripe-soon">
                    {L.stripeSoon}
                  </Text>
                ) : step === "connected" ? (
                  <>
                    <ChipRow>
                      <Chip surface="plate" selected>
                        {L.stripeConnected}
                      </Chip>
                    </ChipRow>
                    <Text variant="bodyStrong" color={t.color.plateInk} testID="stripe-connected">
                      {tk.stripe.accountHint}
                    </Text>
                    {isOwner ? (
                      <Button
                        variant="plate"
                        tone="dashed"
                        icon="close"
                        disabled={busy}
                        onPress={() => setConfirm(true)}
                        fullWidth
                        testID="stripe-disconnect"
                      >
                        {L.stripeDisconnect}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Text variant="body" color={t.color.plateInk} testID="stripe-not-connected">
                      {L.stripeNotConnected}
                    </Text>
                    {isOwner ? (
                      <>
                        <Text variant="caption" color={t.color.plateMuted}>
                          {opened ? L.stripeOpened : L.stripeConnectHelp}
                        </Text>
                        <Button
                          variant="plate"
                          icon="export"
                          loading={busy}
                          onPress={() => void connect()}
                          fullWidth
                          testID="stripe-connect"
                        >
                          {L.stripeConnect}
                        </Button>
                      </>
                    ) : null}
                    {isOwner && opened ? (
                      <Button
                        variant="plate"
                        icon="undo"
                        disabled={busy}
                        onPress={() => void ticketing.reload()}
                        fullWidth
                        testID="stripe-refresh"
                      >
                        {L.stripeRefresh}
                      </Button>
                    ) : null}
                  </>
                )}
                {isOwner ? null : (
                  <Text variant="caption" color={t.color.plateMuted} testID="stripe-owner-only">
                    {L.stripeOwnerOnly}
                  </Text>
                )}
              </Plate>
            </>
          ) : null}
        </>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
});
