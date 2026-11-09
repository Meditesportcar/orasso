// Lancer un rendez-vous au spot sur le site (lot R7i, maquette R7.9), mêmes règles et mêmes mots que l'appli
// (`features/spot/SpotNewScreen.tsx`) : le lieu (adresse trouvée par le géocodage, puis la carte pour viser le point), l'heure
// (maintenant ou plus tard, 24 h devant au plus), la durée (puces de `durationOptions`, 12 h au plus), un mot, et qui est
// prévenu (mes abonnés ou un de mes crews). La position de l'appareil sert seulement à centrer la carte : jamais envoyée,
// seul le point visé est envoyé. L'heure vient du navigateur (rendu après l'hydratation seulement).
import { Button, Chip, Icon, TextField } from "@orasso/design-system/web";
import {
  afterRecentre,
  clampStart,
  coarsePosition,
  customEndsAt,
  defaultDuration,
  durationOptions,
  spotLabels as L,
  SPOT_CUSTOM_MAX_MIN,
  SPOT_CUSTOM_MIN_MIN,
  SPOT_CUSTOM_STEP_MIN,
  SPOT_NOTE_MAX,
  SPOT_PLACE_MAX,
  type SpotAudiences,
  type SpotMeetupView,
  spotEndLabel,
  spotTimeLabel,
  spotUntilLabel,
  startOptions,
} from "@orasso/shared";
import { useMemo, useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";
import { now as siteNow } from "../../lib/clock";
import { EventMap } from "../EventMap";
import "../../styles/spot.css";

const MIN = 60_000;
type Audience = { kind: "followers" } | { kind: "crew"; crewId: string };
type Geocoded = { match: { lat: number; lng: number; label: string } | null };

const durationLabel = (minutes: number) =>
  minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;

export function SpotNewForm({ audiences, crewParam }: { audiences: SpotAudiences; crewParam: string | null }) {
  const [now] = useState(() => siteNow());
  const [query, setQuery] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [pinHidden, setPinHidden] = useState(false);
  const pointRef = useRef(point);
  pointRef.current = point;
  const [status, setStatus] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);

  const starts = useMemo(() => startOptions(now), [now]);
  const [startKey, setStartKey] = useState("now");
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const startsAt =
    startKey === "custom" && customStart ? customStart : (starts.find((s) => s.id === startKey)?.startsAt ?? now);
  const options = useMemo(() => durationOptions(now, startsAt), [now, startsAt]);
  const [durKey, setDurKey] = useState<string | null>(null);
  const [customMin, setCustomMin] = useState(180);
  const chosenDur =
    durKey === "custom"
      ? "custom"
      : (options.find((o) => o.id === durKey)?.id ?? defaultDuration(options, now)?.id ?? null);
  const endsAt =
    chosenDur === "custom"
      ? customEndsAt(startsAt, customMin)
      : (options.find((o) => o.id === chosenDur)?.endsAt ?? null);

  const [note, setNote] = useState("");
  const [audience, setAudience] = useState<Audience>(
    crewParam && audiences.crews.some((c) => c.id === crewParam)
      ? { kind: "crew", crewId: crewParam }
      : { kind: "followers" },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const existing = activeId ?? audiences.activeMeetupId;
  const noAudience = audiences.followers === 0 && audiences.crews.length === 0;

  async function find() {
    const q = query.trim();
    if (q.length < 3) return;
    setFinding(true);
    setStatus(null);
    const res = await apiFetch<Geocoded>(`/geocode?q=${encodeURIComponent(q)}`);
    setFinding(false);
    if (!res.ok) return setStatus(res.error.message);
    const match = res.data.match;
    if (!match) return setStatus(L.whereNotFound);
    setPoint({ lat: match.lat, lng: match.lng });
    setPinHidden(false);
    setCenter({ lat: match.lat, lng: match.lng });
    setPlaceName((p) => p || match.label.slice(0, SPOT_PLACE_MAX));
    setStatus(L.whereFound(match.label));
  }

  /** « Autour de moi » : centre la carte seulement (position arrondie à 0,1°, jamais envoyée ni gardée). */
  function aroundMe() {
    if (!navigator.geolocation) return setStatus(L.whereMineDenied);
    navigator.geolocation.getCurrentPosition(
      (fix) => {
        const rough = coarsePosition({ lat: fix.coords.latitude, lng: fix.coords.longitude });
        setCenter({ lat: rough.lat, lng: rough.lng });
        // L'épingle montrée est toujours le point envoyé : recentrée ailleurs, le point est effacé jusqu'à une nouvelle sélection.
        const out = afterRecentre(pointRef.current, rough, true);
        setPoint(out.point);
        setPinHidden(out.pinHidden);
        setStatus(null);
      },
      () => setStatus(L.whereMineDenied),
      { maximumAge: 60_000, timeout: 10_000 },
    );
  }

  const missing = [
    point ? null : L.whereMissing,
    placeName.trim().length < 2 ? "Donne un nom au lieu." : null,
    endsAt ? null : "Choisis une durée.",
    noAudience ? L.noAudience : null,
  ].filter((x): x is string => x !== null);

  async function launch() {
    if (!point || !endsAt || missing.length) return;
    setBusy(true);
    setError(null);
    // « Maintenant » : l'instant du clic ; la durée choisie est recalculée depuis lui.
    const at = siteNow();
    const start = startKey === "now" ? at : startsAt;
    const end =
      chosenDur === "custom"
        ? customEndsAt(start, customMin)
        : (durationOptions(at, start).find((o) => o.id === chosenDur)?.endsAt ?? endsAt);
    const res = await apiFetch<SpotMeetupView>("/me/spot-meetups", {
      method: "POST",
      json: {
        placeLabel: placeName.trim(),
        lat: point.lat,
        lng: point.lng,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        note: note.trim() || null,
        audience: audience.kind,
        crewId: audience.kind === "crew" ? audience.crewId : null,
      },
    });
    if (res.ok) {
      window.location.assign(`/app/spot/${res.data.id}`);
      return;
    }
    if (res.error.code === "meetup_active") {
      const id = (res.error.details as { meetupId?: string } | undefined)?.meetupId;
      setActiveId(typeof id === "string" ? id : null);
      setError(L.active);
    } else setError(res.error.message);
    setBusy(false);
  }

  const until = endsAt ? spotUntilLabel(startsAt, endsAt) : null;

  return (
    <div className="spot-form" data-testid="spot-form">
      {existing ? (
        <div className="spot-form" data-testid="spot-active-notice">
          <p role="alert">{L.active}</p>
          <Button variant="secondary" icon="next" href={`/app/spot/${existing}`} data-testid="spot-see-active">
            {L.seeActive}
          </Button>
        </div>
      ) : null}

      <h2 className="o-t-label">{L.where}</h2>
      <TextField
        label={L.whereSearch}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        maxLength={200}
        placeholder="Port de Saint-Cyprien"
        data-testid="spot-query"
      />
      <div className="spot-two">
        <Button
          variant="secondary"
          icon="place"
          disabled={finding || query.trim().length < 3}
          onClick={() => void find()}
          data-testid="spot-find"
        >
          {L.whereFind}
        </Button>
        <Button variant="secondary" icon="target" onClick={aroundMe} data-testid="spot-around-me">
          {L.whereMine}
        </Button>
      </div>
      <EventMap
        lat={point?.lat ?? center?.lat ?? null}
        lng={point?.lng ?? center?.lng ?? null}
        label={L.where}
        draggablePin
        onPinMove={(lat, lng) => {
          setPoint({ lat, lng });
          setPinHidden(false);
        }}
        pinHidden={pinHidden && !point}
      />
      <p className="o-t-caption s-muted" data-testid="spot-point">
        {status ?? (point ? L.whereTouch : `${L.whereTouch} ${L.whereHint}`)}
      </p>
      <TextField
        label={L.placeName}
        value={placeName}
        onChange={(e) => setPlaceName(e.target.value)}
        maxLength={SPOT_PLACE_MAX}
        placeholder="Port de Saint-Cyprien"
        data-testid="spot-place-name"
      />

      <h2 className="o-t-label">{L.whatTime}</h2>
      <div className="spot-chips" data-testid="spot-starts">
        {starts.map((s) => (
          <Chip key={s.id} selected={startKey === s.id} onClick={() => setStartKey(s.id)}>
            {s.label}
          </Chip>
        ))}
        <Chip
          selected={startKey === "custom"}
          onClick={() => {
            setCustomStart((p) => p ?? clampStart(new Date(now.getTime() + 60 * MIN), now));
            setStartKey("custom");
          }}
        >
          {L.otherTime}
        </Chip>
      </div>
      {startKey === "custom" && customStart ? (
        <Stepper
          label={spotTimeLabel(customStart)}
          onLess={() => setCustomStart(clampStart(new Date(customStart.getTime() - SPOT_CUSTOM_STEP_MIN * MIN), now))}
          onMore={() => setCustomStart(clampStart(new Date(customStart.getTime() + SPOT_CUSTOM_STEP_MIN * MIN), now))}
          testid="spot-start-stepper"
        />
      ) : null}

      <h2 className="o-t-label">{L.howLong}</h2>
      <div className="spot-chips" data-testid="spot-durations">
        {options.map((o) => (
          <Chip key={o.id} selected={chosenDur === o.id} onClick={() => setDurKey(o.id)}>
            {o.label}
          </Chip>
        ))}
        <Chip selected={chosenDur === "custom"} onClick={() => setDurKey("custom")}>
          {L.otherLength}
        </Chip>
      </div>
      {chosenDur === "custom" ? (
        <Stepper
          label={durationLabel(customMin)}
          onLess={() => setCustomMin((m) => Math.max(SPOT_CUSTOM_MIN_MIN, m - SPOT_CUSTOM_STEP_MIN))}
          onMore={() => setCustomMin((m) => Math.min(SPOT_CUSTOM_MAX_MIN, m + SPOT_CUSTOM_STEP_MIN))}
          testid="spot-length-stepper"
        />
      ) : null}
      {until ? (
        <p className="spot-note o-t-caption" data-testid="spot-until">
          <Icon name="wait" size={16} />
          <span>{`${until.charAt(0).toUpperCase()}${until.slice(1)}. Un rendez-vous dure 12 h au plus.`}</span>
        </p>
      ) : null}

      <TextField
        label={`${L.note} (${L.noteOptional})`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={SPOT_NOTE_MAX}
        placeholder={L.notePlaceholder}
        data-testid="spot-note"
      />

      <h2 className="o-t-label">{L.warned}</h2>
      <div className="spot-opts" data-testid="spot-audience">
        <Option
          selected={audience.kind === "followers"}
          icon="profile"
          title={L.followers}
          hint={L.followersHint(audiences.followers)}
          onSelect={() => setAudience({ kind: "followers" })}
          testid="spot-audience-followers"
        />
        {audiences.crews.map((cr) => (
          <Option
            key={cr.id}
            selected={audience.kind === "crew" && audience.crewId === cr.id}
            icon="shield"
            title={L.crew(cr.name)}
            hint={L.crewHint(cr.members)}
            onSelect={() => setAudience({ kind: "crew", crewId: cr.id })}
            testid={`spot-audience-crew-${cr.id}`}
          />
        ))}
      </div>
      {until ? (
        <p className="spot-note o-t-caption" data-testid="spot-privacy">
          <Icon name="lock" size={16} />
          <span>{L.privacy(spotEndLabel(startsAt, endsAt as Date))}</span>
        </p>
      ) : null}
      {error ? (
        <p role="alert" data-testid="spot-error">
          {error}
        </p>
      ) : null}
      {missing.length ? (
        <p className="o-t-caption s-muted" data-testid="spot-missing">
          {missing[0]}
        </p>
      ) : null}
      <Button
        variant="primary"
        icon="send"
        fullWidth
        disabled={busy || missing.length > 0 || Boolean(existing)}
        onClick={() => void launch()}
        data-testid="spot-launch"
      >
        {busy ? L.launching : L.launch}
      </Button>
    </div>
  );
}

function Stepper({
  label,
  onLess,
  onMore,
  testid,
}: {
  label: string;
  onLess: () => void;
  onMore: () => void;
  testid: string;
}) {
  return (
    <div className="spot-stepper" data-testid={testid}>
      <Button variant="secondary" icon="minus" onClick={onLess} data-testid={`${testid}-less`}>
        {L.lengthLess}
      </Button>
      <strong>{label}</strong>
      <Button variant="secondary" icon="add" onClick={onMore} data-testid={`${testid}-more`}>
        {L.lengthMore}
      </Button>
    </div>
  );
}

function Option({
  selected,
  icon,
  title,
  hint,
  onSelect,
  testid,
}: {
  selected: boolean;
  icon: "profile" | "shield";
  title: string;
  hint: string;
  onSelect: () => void;
  testid: string;
}) {
  return (
    <button type="button" className="spot-opt" aria-pressed={selected} onClick={onSelect} data-testid={testid}>
      <Icon name={icon} size={22} />
      <span className="spot-opt__body">
        <strong className="o-never-truncate">{title}</strong>
        <span className="o-t-caption s-muted">{hint}</span>
      </span>
      {selected ? <Icon name="check" size={20} /> : null}
    </button>
  );
}
