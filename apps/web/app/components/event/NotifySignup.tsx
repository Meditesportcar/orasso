import { Button, CheckboxField, Icon } from "@orasso/design-system/web";
import {
  type EventNotificationPrefsView,
  eventNotifyLabels as L,
  type NotificationType,
  notificationFamilyLabels,
  notificationTypeLabels,
  settingsEventRows,
} from "@orasso/shared";
import { useState } from "react";

import { apiFetch } from "../../lib/api.client";
import "../../styles/event-notify.css";

// Lot R8n2 (maquette R8.11) : les pièces des notifications d'un événement sur le site, partagées par la fin de la
// candidature (« Ce que tu recevras pour cet événement »), la cloche de la fiche, les Réglages et la confirmation de
// l'organisateur. Mêmes mots que l'appli (`eventNotifyLabels`).

/** Le bloc « Essentiel » : cadenas, « toujours actif », les six lignes. */
export function EssentialBlock() {
  return (
    <div className="en-ess" data-testid="notify-essential">
      <div className="en-row">
        <Icon name="lock" size={20} />
        <div>
          <b>
            {L.essentialBlockTitle}
            <span className="o-visually-hidden">, {L.alwaysOn.toLowerCase()}</span>
          </b>
          <small>{L.essentialBlockHelp}</small>
        </div>
        <Icon name="lock" size={14} />
      </div>
      <ul>
        {L.essentialItems.map((item) => (
          <li key={item}>
            <Icon name="check" size={16} strokeWidth={3} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Une ligne à interrupteur (case à cocher native : clavier et lecteur d'écran annoncent son état). */
export function NotifySwitch({
  title,
  help,
  checked,
  onChange,
  disabled = false,
  name,
  testId,
}: {
  title: string;
  help: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Dans un formulaire : le nom du champ envoyé. */
  name?: string;
  testId: string;
}) {
  return (
    <label className="en-row" aria-disabled={disabled || undefined}>
      <Icon name="bell" size={20} />
      <div>
        <b>{title}</b>
        <small>{help}</small>
      </div>
      <span className="en-switch">
        <input
          type="checkbox"
          role="switch"
          name={name}
          checked={checked}
          aria-checked={checked}
          disabled={disabled}
          aria-label={title}
          onChange={(e) => onChange(e.currentTarget.checked)}
          data-testid={testId}
        />
        <span aria-hidden="true" />
      </span>
    </label>
  );
}

/** Réglages > Notifications : les deux lignes de la famille « Événements » (vue `reg` de la maquette). */
export function EventSettingsRows({
  eventNews,
  familyOn,
}: {
  /** Le réglage enregistré (absent = activé). */
  eventNews: boolean | undefined;
  /** La case « Recevoir les notifications Événements » telle qu'elle est cochée maintenant. */
  familyOn: boolean;
}) {
  const [news, setNews] = useState(eventNews !== false);
  const rows = settingsEventRows({ event: familyOn, eventNews: news });
  return (
    <div className="en-box" data-testid="notif-event-rows">
      <div className="en-row" data-testid="notif-essential">
        <Icon name="lock" size={20} />
        <div>
          <b>{L.essentialTitle}</b>
          <small>{L.essentialHelp}</small>
        </div>
        <span className="en-lock-state">{L.alwaysOn}</span>
      </div>
      {/* Grisée, la case n'est pas envoyée par le navigateur : la valeur part par un champ caché. */}
      {rows.news.disabled ? <input type="hidden" name="eventNews" value={news ? "on" : ""} /> : null}
      <NotifySwitch
        title={L.newsTitle}
        help={rows.news.reason ?? L.newsHelp}
        checked={rows.news.on}
        onChange={setNews}
        disabled={rows.news.disabled}
        name={rows.news.disabled ? undefined : "eventNews"}
        testId="notif-news"
      />
    </div>
  );
}

/**
 * Réglages : la famille « Événements » en entier (légende, deux lignes, case de la famille, types restants). Le client
 * suit la case de la famille pour griser « Nouveautés de mes sorties » (le formulaire reste celui de la page).
 */
export function EventNotificationsFieldset({
  familyOn,
  eventNews,
  types,
  mutedTypes,
}: {
  familyOn: boolean;
  eventNews: boolean | undefined;
  types: readonly NotificationType[];
  mutedTypes: readonly string[];
}) {
  const [on, setOn] = useState(familyOn);
  return (
    <fieldset className="s-fieldset s-stack s-stack--tight" data-testid="notif-family-event">
      <legend className="s-label o-t-label">{L.settingsGroup}</legend>
      <EventSettingsRows eventNews={eventNews} familyOn={on} />
      <CheckboxField
        name="fam_event"
        label={`Recevoir les notifications « ${notificationFamilyLabels.event} »`}
        checked={on}
        onChange={(e) => setOn(e.currentTarget.checked)}
      />
      <div className="s-checklist">
        {types.map((type) => (
          <CheckboxField
            key={type}
            name={`type_${type}`}
            label={notificationTypeLabels[type]}
            defaultChecked={!mutedTypes.includes(type)}
          />
        ))}
      </div>
    </fieldset>
  );
}

/** Organisateur : « 148 inscrits seront prévenus. » (`count` nul : le nombre n'a pas pu être lu). */
export function RecipientsBanner({ count, timing }: { count: number | null; timing: string | null }) {
  return (
    <div className="en-banner" role="status" data-testid="notify-recipients">
      <Icon name="bell" size={20} />
      <div>
        <b data-testid="notify-recipients-count">{count === null ? L.recipientsFallback : L.recipientsBanner(count)}</b>
        <small>{L.autoNotify}</small>
        {timing ? <small data-testid="notify-recipients-timing">{timing}</small> : null}
      </div>
    </div>
  );
}

/**
 * Fin d'une candidature : « Ce que tu recevras pour cet événement ». « C'est noté » (le bouton principal) enregistre
 * (seulement si l'interrupteur a changé) puis continue. Un échec garde le défaut et ne remet jamais la candidature en cause.
 */
export function NotifySignup({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const [news, setNews] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function noted() {
    if (busy) return;
    if (news) return onDone();
    setBusy(true);
    setMessage(null);
    const res = await apiFetch<EventNotificationPrefsView>(
      `/me/events/${encodeURIComponent(eventId)}/notification-prefs`,
      { method: "PUT", json: { news } },
    );
    if (res.ok) return onDone();
    setBusy(false);
    setNews(true);
    setMessage(L.saveFailed);
  }

  return (
    <section className="en-box" aria-labelledby="notify-signup-title" data-testid="notify-signup">
      <h2 id="notify-signup-title" className="o-t-poster-m">
        {L.signupTitle}
      </h2>
      <EssentialBlock />
      <NotifySwitch
        title={L.eventNewsTitle}
        help={L.eventNewsHelpOnSignup}
        checked={news}
        onChange={setNews}
        testId="notify-signup-news"
      />
      {message ? (
        <p className="en-error" role="alert" data-testid="notify-signup-message">
          {message}
        </p>
      ) : (
        <p className="en-note o-t-caption">{L.signupNote}</p>
      )}
      <Button icon="check" onClick={() => void noted()} loading={busy} data-testid="notify-noted">
        {L.noted}
      </Button>
    </section>
  );
}
