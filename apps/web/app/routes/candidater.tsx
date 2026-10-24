import { AppBar, Button, CheckboxField, Chip, ChipRow, VehicleThumb } from "@orasso/design-system/web";
import {
  type ApplicationCreate,
  type ApplyContext,
  type EventPublic,
  eventDaysLabels,
  formatDayDate,
  type MyApplication,
  mainVehicleLabels,
  preselectVehicle,
  type StructurePublic,
  type VehicleFull,
  vehicleTypeLabels,
} from "@orasso/shared";
import { useState } from "react";
import { redirect, useNavigate } from "react-router";
import { ArrivalSeen, arrivalBody } from "../components/ArrivalSeen";
import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { nowMs } from "../lib/clock";
import { registrationState } from "../lib/status";
import type { Route } from "./+types/candidater";

export function meta() {
  return [{ title: "Candidater · Orasso" }, { name: "robots", content: "noindex" }];
}

// Lot M4, tour 2 : la page (et ses données `.data`) peut porter le créneau privé des exposants : ni le navigateur ni un
// relais ne la gardent. En-têtes du parent conservés (`root.tsx`).
export const headers: Route.HeadersFunction = ({ parentHeaders }) => {
  const h = new Headers(parentHeaders);
  h.set("cache-control", "private, no-store");
  return h;
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const event = await apiOrThrow<EventPublic>(request, `/events/by-slug/${encodeURIComponent(params.slug)}`);
  // Plusieurs jours (lot 26) : on peut candidater pour un autre jour ; l'API refuse le doublon du même jour.
  const active = (event.myApplications ?? []).filter((a) =>
    ["pending", "accepted", "waitlisted", "offered"].includes(a.status),
  );
  if (active.length && (event.days.length === 0 || active.some((a) => a.eventDayId === null))) {
    throw redirect("/app/sorties");
  }
  // Lot M4, tour 2 : le créneau des exposants est privé (la fiche ne le donne qu'aux inscrits) ; la candidature le lit
  // à part, seulement si l'on peut candidater maintenant (sinon l'état « pas encore ouvert », « clos »… s'affiche).
  const [structure, vehicles, context, upcoming, past] = await Promise.all([
    apiOrThrow<StructurePublic>(request, `/structures/by-slug/${encodeURIComponent(event.structure.slug)}`),
    apiOrThrow<VehicleFull[]>(request, "/me/vehicles"),
    api<ApplyContext>(request, `/events/${event.id}/apply-context`),
    // Lot R4c : le dernier véhicule utilisé (après le principal, avant le premier qui convient), comme l'appli.
    api<MyApplication[]>(request, "/me/applications?scope=upcoming"),
    api<MyApplication[]>(request, "/me/applications?scope=past"),
  ]);
  const slot = context.ok ? context.data.exhibitors : (event.arrivals?.exhibitors ?? null);
  // Tour 2 : l'API n'a pas répondu (5xx, réseau) : on ne sait pas s'il faut cocher « J'ai vu », l'envoi attend.
  const contextError = !context.ok && context.status >= 500 ? context.error.message : null;
  const wanted = new Set(event.criteria?.categoryIds ?? []);
  const activeVehicles = vehicles
    .filter((v) => v.status === "active")
    // Ceux qui collent aux catégories recherchées d'abord (écran 1 du prototype).
    .sort(
      (a, b) => Number(b.categories.some((c) => wanted.has(c.id))) - Number(a.categories.some((c) => wanted.has(c.id))),
    );
  const mainVehicleId = me.profile.mainVehicleId ?? null;
  const withPhoto = new Set(activeVehicles.filter((v) => v.photos.length > 0).map((v) => v.id));
  const lastUsed =
    [...(upcoming.ok ? upcoming.data : []), ...(past.ok ? past.data : [])]
      .filter((a) => a.vehicle && withPhoto.has(a.vehicle.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.vehicle?.id ?? null;
  const admitted = activeVehicles.filter((v) => event.admittedVehicleTypes.includes(v.vehicleType));
  // Lot R4c (R4.5b) : `?vehicule=` d'abord (lien de la fiche), sinon principal → dernier utilisé → premier qui convient.
  const preselected =
    new URL(request.url).searchParams.get("vehicule") ??
    preselectVehicle(
      admitted.map((v) => ({
        id: v.id,
        hasPhoto: v.photos.length > 0,
        matches: wanted.size === 0 || v.categories.some((c) => wanted.has(c.id)),
      })),
      mainVehicleId,
      lastUsed,
    )?.id ??
    null;
  const preselectedDay = new URL(request.url).searchParams.get("jour");
  return {
    event,
    structure,
    vehicles: activeVehicles.map((v) => ({
      id: v.id,
      label: v.label,
      year: v.year,
      powerHp: v.powerHp,
      photo: v.photos[0]?.url ?? null,
      photoCount: v.photos.length,
      admitted: event.admittedVehicleTypes.includes(v.vehicleType),
      typeLabel: vehicleTypeLabels[v.vehicleType],
      matches: v.categories.filter((c) => wanted.has(c.id)).map((c) => c.label),
      main: v.id === mainVehicleId,
      lastUsed: v.id === lastUsed && v.id !== mainVehicleId,
    })),
    preselected,
    slot,
    contextError,
    preselectedDay,
    takenDays: active.map((a) => a.eventDayId),
    state: registrationState(event, nowMs()),
  };
}

type Step = 1 | 2 | 3;

export default function Candidater({ loaderData }: Route.ComponentProps) {
  const { event, structure, vehicles, preselected, preselectedDay, takenDays, state, slot, contextError } = loaderData;
  const navigate = useNavigate();
  const backHref = `/e/${event.slug}`;
  const here = `/e/${event.slug}/candidater`;
  const selectable = vehicles.filter((v) => v.admitted && v.photoCount > 0);
  const [step, setStep] = useState<Step>(1);
  const [selected, setSelected] = useState<string[]>(() => {
    const first = preselected && selectable.some((v) => v.id === preselected) ? [preselected] : [];
    if (first.length === 0 && selectable.length === 1 && selectable[0]) return [selectable[0].id];
    return first;
  });
  // Plusieurs jours (lot 26) : « Tout l'événement » et/ou un jour, selon le mode d'accès choisi par l'organisateur.
  const multiDay = event.days.length > 1;
  const dayChoices: { id: string | null; label: string; full: boolean; mine: boolean }[] = multiDay
    ? [
        ...(event.dayAccess !== "per_day"
          ? [
              {
                id: null,
                label: eventDaysLabels.wholeEvent,
                full: event.days.some((d) => d.remaining === 0),
                mine: takenDays.length > 0,
              },
            ]
          : []),
        ...(event.dayAccess !== "whole"
          ? event.days.map((d) => ({
              id: d.id as string | null,
              label: formatDayDate(d.date),
              full: d.remaining === 0,
              mine: takenDays.includes(d.id),
            }))
          : []),
      ]
    : [];
  const [dayId, setDayId] = useState<string | null>(() => {
    if (!multiDay) return null;
    const wanted = dayChoices.find((c) => c.id === preselectedDay && !c.full && !c.mine);
    return (wanted ?? dayChoices.find((c) => !c.full && !c.mine) ?? dayChoices[0])?.id ?? null;
  });
  const [rules, setRules] = useState(false);
  // Lot 47 : « J'ai vu » l'horaire d'arrivée des exposants (obligatoire s'il existe) et une note facultative.
  const [arrivalSeen, setArrivalSeen] = useState(false);
  const [arrivalNote, setArrivalNote] = useState("");
  const [follow, setFollow] = useState(true);
  const [newsletter, setNewsletter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.kind !== "open") {
    return (
      <div className="s-narrow s-stack">
        <h1 className="s-title">Candidater</h1>
        <p className="s-notice s-notice--alert">
          {state.kind === "cancelled"
            ? "Cet événement est annulé."
            : state.kind === "locked"
              ? "Les inscriptions sont closes."
              : "Les inscriptions ne sont pas encore ouvertes."}
        </p>
        <Button variant="secondary" icon="back" href={backHref}>
          Retour à l'événement
        </Button>
      </div>
    );
  }

  function toggle(id: string) {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= event.maxVehiclesPerUser) return cur;
      return [...cur, id];
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const body: ApplicationCreate = {
      vehicleIds: selected,
      rulesAccepted: true,
      followStructure: follow,
      newsletterOptIn: newsletter,
      companions: 0,
      message: null,
      eventDayId: multiDay ? dayId : undefined,
      ...arrivalBody(slot, arrivalSeen, arrivalNote),
    };
    const res = await apiFetch<MyApplication[]>(`/events/${event.id}/applications`, { method: "POST", json: body });
    if (res.ok) {
      navigate("/app/sorties?candidature=envoyee");
      return;
    }
    setBusy(false);
    setError(res.error.message);
  }

  return (
    <div className="s-narrow s-stack">
      <AppBar kind="flow" title="Candidater" counter={`${step} / 3`} closeHref={backHref} bleed />
      <div className="s-steps" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <div key={n} className={n <= step ? "s-steps__step is-done" : "s-steps__step"} />
        ))}
      </div>

      {step === 1 && (
        <div className="s-stack" data-step="1">
          <div>
            <div className="s-label o-t-label">1 / 3 · {event.title}</div>
            <h1 className="s-title">Avec quel véhicule ?</h1>
            <p className="s-muted">
              Ceux qui collent aux catégories recherchées sont en premier. Limite : {event.maxVehiclesPerUser} par
              personne pour cet événement.
            </p>
          </div>
          {multiDay ? (
            <fieldset className="s-fieldset s-stack s-stack--tight" data-testid="day-choice">
              <legend className="o-t-label s-label">{eventDaysLabels.chooseDay}</legend>
              <ChipRow className="s-chips-wrap">
                {dayChoices.map((c) => (
                  <Chip key={c.id ?? "whole"} selected={dayId === c.id} onClick={() => setDayId(c.id)}>
                    {c.mine
                      ? `${c.label} · ${eventDaysLabels.alreadyApplied}`
                      : c.full
                        ? `${c.label} · ${eventDaysLabels.dayFull}`
                        : c.label}
                  </Chip>
                ))}
              </ChipRow>
              {dayChoices.find((c) => c.id === dayId)?.full ? (
                <p className="o-t-caption s-muted">
                  Complet : ta candidature passera par la liste d'attente si l'équipe organisatrice le décide.
                </p>
              ) : null}
            </fieldset>
          ) : null}
          {vehicles.length === 0 ? (
            <div className="s-card">
              <p>Ton garage est vide. Ajoute un véhicule, tu reviendras ici juste après.</p>
              <Button variant="primary" icon="add" href={`/app/garage/nouveau?retour=${encodeURIComponent(here)}`}>
                Ajouter un véhicule
              </Button>
            </div>
          ) : (
            <>
              <div className="s-vehicles">
                {vehicles.map((v) => {
                  const ok = v.admitted && v.photoCount > 0;
                  return (
                    <CheckboxField
                      key={v.id}
                      checked={selected.includes(v.id)}
                      disabled={!ok}
                      onChange={() => toggle(v.id)}
                      aria-label={v.label}
                      label={
                        <VehicleThumb
                          photo={v.photo ? <img src={v.photo} alt="" /> : undefined}
                          title={v.label}
                          meta={
                            !v.admitted
                              ? `${v.typeLabel} : type non admis`
                              : v.photoCount === 0
                                ? "Ajoute une photo pour candidater"
                                : [
                                    v.main ? `★ ${mainVehicleLabels.candTag}` : null,
                                    v.lastUsed ? mainVehicleLabels.lastUsed : null,
                                    v.year,
                                    v.powerHp ? `${v.powerHp} ch` : null,
                                    ...v.matches,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")
                          }
                        />
                      }
                    />
                  );
                })}
              </div>
              <p className="o-t-caption s-muted">
                {selected.length} véhicule{selected.length > 1 ? "s" : ""} · plaque visible par l'équipe organisatrice
                seulement
              </p>
              <Button variant="secondary" icon="add" href={`/app/garage/nouveau?retour=${encodeURIComponent(here)}`}>
                Ajouter un autre véhicule
              </Button>
            </>
          )}
          <Button variant="primary" icon="next" disabled={selected.length === 0} onClick={() => setStep(2)} fullWidth>
            Continuer
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="s-stack" data-step="2">
          <div>
            <div className="s-label o-t-label">2 / 3 · {event.title}</div>
            <h1 className="s-title">Règlement</h1>
          </div>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: zone défilante : elle doit se lire au clavier */}
          <div className="s-rules" tabIndex={0}>
            {event.rulesText ??
              "L'organisateur n'a pas ajouté de règlement particulier. Respecte les consignes sur place et les autres participants."}
          </div>
          <CheckboxField
            checked={rules}
            onChange={(e) => setRules(e.currentTarget.checked)}
            label="J'ai lu le règlement de l'événement et je l'accepte."
          />
          <ArrivalSeen
            slot={slot}
            seen={arrivalSeen}
            onSeen={setArrivalSeen}
            note={arrivalNote}
            onNote={setArrivalNote}
          />
          {contextError && (
            <p className="s-error" role="alert" data-testid="context-error">
              {contextError}
            </p>
          )}
          <div className="s-actions">
            <Button variant="secondary" icon="back" onClick={() => setStep(1)}>
              Retour
            </Button>
            <Button
              variant="primary"
              icon="next"
              disabled={!rules || contextError !== null || (slot !== null && !arrivalSeen)}
              onClick={() => setStep(3)}
              className="s-grow"
            >
              Continuer
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="s-stack" data-step="3">
          <div>
            <div className="s-label o-t-label">3 / 3 · {event.title}</div>
            <h1 className="s-title">Dernier clic</h1>
          </div>
          <CheckboxField
            checked={follow}
            onChange={(e) => setFollow(e.currentTarget.checked)}
            label={`Suivre ${structure.name} : ses prochains événements et l'avant-première des inscriptions.`}
          />
          <CheckboxField
            checked={newsletter}
            onChange={(e) => setNewsletter(e.currentTarget.checked)}
            label="Recevoir la newsletter Orasso."
          />
          {error && (
            <p className="s-error" role="alert">
              {error}
            </p>
          )}
          <div className="s-actions">
            <Button variant="secondary" icon="back" onClick={() => setStep(2)}>
              Retour
            </Button>
            <Button
              variant="primary"
              icon="check"
              loading={busy}
              disabled={contextError !== null}
              onClick={submit}
              className="s-grow"
            >
              Envoyer ma candidature
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
