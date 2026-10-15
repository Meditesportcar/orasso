import { Button, Chip, Plate, StatusBadge } from "@orasso/design-system/web";
import {
  type AccessPass,
  applicationStatusLabels,
  type ContestStatus,
  contestStatusLabels,
  eventFormatLabels,
  gradeLabels,
  type MyApplication,
  type MyPoints,
  POINTS_PENDING_LABEL,
  refusalReasonLabels,
} from "@orasso/shared";
import { data, Form, useNavigate, useNavigation, useRevalidator } from "react-router";

import { Countdown } from "../components/Countdown";
import { Qr } from "../components/Qr";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { formatDateTime, formatWhen } from "../lib/format";
import { badgeFor } from "../lib/status";
import { useChannel } from "../lib/useChannel";
import type { Route } from "./+types/acces";

export function meta() {
  return [{ title: "Accès · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const past = url.searchParams.get("vue") === "passes";
  const applications = await apiOrThrow<MyApplication[]>(
    request,
    `/me/applications?scope=${past ? "past" : "upcoming"}`,
  );
  const passes: Record<string, AccessPass> = {};
  await Promise.all(
    applications
      .filter((a) => a.status === "accepted")
      .map(async (a) => {
        const res = await api<AccessPass>(request, `/applications/${a.id}/pass`);
        if (res.ok && res.data.payload) passes[a.id] = res.data;
      }),
  );
  const points = past ? await apiOrThrow<MyPoints>(request, "/me/points") : null;
  const me = await requireMe(request);
  return {
    past,
    applications,
    passes,
    points,
    userId: me.user.id,
    sent: url.searchParams.get("candidature") === "envoyee",
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = String(form.get("applicationId") ?? "");
  if (!id) return data({ error: "Candidature inconnue." }, { status: 400 });
  let res: Awaited<ReturnType<typeof api>>;
  if (intent === "withdraw") res = await api(request, `/applications/${id}/withdraw`, { method: "POST", json: {} });
  else if (intent === "accept")
    res = await api(request, `/applications/${id}/offer/accept`, { method: "POST", json: {} });
  else if (intent === "decline")
    res = await api(request, `/applications/${id}/offer/decline`, { method: "POST", json: {} });
  else if (intent === "contest") {
    const message = String(form.get("message") ?? "").trim();
    if (!message)
      return data(
        { error: "Explique en une phrase pourquoi tu contestes." },
        { status: 400, statusText: "Message requis" },
      );
    res = await api(request, `/applications/${id}/malus-contest`, { method: "POST", json: { message } });
  } else return data({ error: "Action inconnue." }, { status: 400 });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  return data({ error: null });
}

function ApplicationCard({ app, pass, past }: { app: MyApplication; pass?: AccessPass; past: boolean }) {
  const busy = useNavigation().state !== "idle";
  const badge = badgeFor(app);
  const confirmWithdraw = (e: React.FormEvent<HTMLFormElement>) => {
    const message =
      new Date(app.withdrawDeadline).getTime() > Date.now()
        ? "Te désister ? Sans pénalité jusqu'au verrouillage."
        : "Te désister maintenant ? Après le verrouillage, un malus sera appliqué à J+2.";
    if (!window.confirm(message)) e.preventDefault();
  };
  const active = ["pending", "accepted", "waitlisted", "offered"].includes(app.status);
  return (
    <article className="s-card acc" data-testid="application" data-status={app.status}>
      <div className="acc__head">
        <div className="s-stack s-stack--tight">
          <div className="s-label o-t-label">{eventFormatLabels[app.event.format]}</div>
          <h2 className="s-h2">
            <a href={`/e/${app.event.slug}`}>{app.event.title}</a>
          </h2>
          <div className="o-t-meta s-muted">
            {formatWhen(app.event.startsAt, app.event.endsAt)}
            {app.event.city ? ` · ${app.event.city}` : ""}
          </div>
          {app.vehicle && <div className="o-never-truncate">{app.vehicle.label}</div>}
        </div>
        {badge ? (
          <StatusBadge status={badge.status} rank={badge.rank} />
        ) : (
          <Chip>{applicationStatusLabels[app.status]}</Chip>
        )}
      </div>

      {app.status === "accepted" && pass?.payload && (
        <>
          <div className="acc__qr" data-testid="pass-qr">
            <Qr payload={pass.payload} label={`QR d'inscription : ${app.event.title}`} />
          </div>
          <p className="o-t-caption s-muted s-center">
            Présente ce QR à l'entrée. {app.zone ? `Zone ${app.zone.code} · ${app.zone.name}.` : ""}
            {app.checkedInAt ? ` Entrée enregistrée à ${formatDateTime(app.checkedInAt)}.` : ""}
          </p>
        </>
      )}

      {app.status === "offered" && app.offerExpiresAt && (
        <div className="s-notice s-notice--ok">
          <strong>Une place s'est libérée.</strong> Tu as <Countdown until={app.offerExpiresAt} /> pour l'accepter.
          <Form method="post" className="acc__actions">
            <input type="hidden" name="applicationId" value={app.id} />
            <Button type="submit" name="intent" value="accept" icon="check" loading={busy}>
              Accepter la place
            </Button>
            <Button type="submit" name="intent" value="decline" variant="secondary" icon="close" loading={busy}>
              Refuser
            </Button>
          </Form>
        </div>
      )}

      {app.status === "refused" && (
        <p className="s-muted">
          {app.refusalReasons?.length
            ? `Motifs : ${app.refusalReasons.map((r) => refusalReasonLabels[r]).join(", ")}.`
            : "Ta candidature n'a pas été retenue."}
          {app.refusalNote ? ` ${app.refusalNote}` : ""}
        </p>
      )}

      {past && (
        <div className="s-stack s-stack--tight">
          {app.pointsPending && <Chip>{POINTS_PENDING_LABEL}</Chip>}
          {app.points != null && (
            <div data-testid="points">
              <strong>
                {app.points > 0 ? "+" : ""}
                {app.points} pts
              </strong>{" "}
              <span className="s-muted">
                {app.points > 0 ? "présence enregistrée" : app.points < 0 ? "absence sans désistement" : "aucun point"}
              </span>
            </div>
          )}
          {app.malus && <MalusBlock app={app} malus={app.malus} busy={busy} />}
          {app.status === "accepted" && app.checkedInAt && (
            <Button variant="secondary" icon="chat" disabled>
              Laisser un avis (bientôt)
            </Button>
          )}
        </div>
      )}

      {!past && active && (
        <Form method="post" onSubmit={confirmWithdraw}>
          <input type="hidden" name="applicationId" value={app.id} />
          <Button type="submit" name="intent" value="withdraw" variant="secondary" icon="undo" loading={busy}>
            Me désister
          </Button>
          <p className="o-t-caption s-muted">
            {new Date(app.withdrawDeadline).getTime() > Date.now()
              ? `Sans pénalité jusqu'au ${formatDateTime(app.withdrawDeadline)}.`
              : "Inscriptions verrouillées : un désistement entraîne un malus."}
          </p>
        </Form>
      )}
    </article>
  );
}

function MalusBlock({
  app,
  malus,
  busy,
}: {
  app: MyApplication;
  malus: NonNullable<MyApplication["malus"]>;
  busy: boolean;
}) {
  if (malus.contestStatus) {
    return <Chip>{contestStatusLabels[malus.contestStatus as ContestStatus] ?? malus.contestStatus}</Chip>;
  }
  if (!malus.canContest)
    return (
      <p className="o-t-caption s-muted">Malus : contestation possible jusqu'au {formatDateTime(malus.deadline)}.</p>
    );
  return (
    <Form method="post" className="s-form" data-testid="contest-form">
      <input type="hidden" name="applicationId" value={app.id} />
      <label className="o-t-label" htmlFor={`contest-${app.id}`}>
        Contester ce malus (jusqu'au {formatDateTime(malus.deadline)})
      </label>
      <textarea
        id={`contest-${app.id}`}
        name="message"
        className="s-textarea o-t-body"
        rows={3}
        required
        placeholder="Ex. j'étais bien sur place, mon QR n'a pas été lu."
      />
      <Button type="submit" name="intent" value="contest" variant="secondary" icon="incident" loading={busy}>
        Contester le malus
      </Button>
    </Form>
  );
}

export default function Acces({ loaderData, actionData }: Route.ComponentProps) {
  const { past, applications, passes, points, sent, userId } = loaderData;
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  // Une décision de l'organisateur, une offre ou un pass émis : la page se met à jour sans rechargement.
  useChannel(`user:${userId}`, (message) => {
    if (message.type === "application.changed" || message.type === "notification") revalidator.revalidate();
  });
  return (
    <div className="s-stack">
      <h1 className="s-title">Accès</h1>
      <div className="s-tabs" role="tablist">
        <Chip selected={!past} onClick={() => navigate("/app/acces")}>
          À venir
        </Chip>
        <Chip selected={past} onClick={() => navigate("/app/acces?vue=passes")}>
          Passés · carnet de route
        </Chip>
      </div>

      {sent && <p className="s-notice s-notice--ok">Candidature envoyée. L'organisateur te répond ici.</p>}
      {actionData?.error && (
        <p className="s-error" role="alert">
          {actionData.error}
        </p>
      )}

      {past && points && (
        <Plate as="section" className="s-stack s-stack--tight" aria-label="Mes points">
          <div className="s-label o-t-label">Saison {points.season.name}</div>
          <div className="o-t-number" data-testid="season-points">
            {points.pointsSeason} pts
          </div>
          <div>
            Grade <strong>{gradeLabels[points.grade]}</strong>
            {points.next ? ` · prochain : ${gradeLabels[points.next.grade]} à ${points.next.threshold} pts` : ""}
          </div>
        </Plate>
      )}

      {applications.length === 0 ? (
        <p className="s-notice">
          {past
            ? "Aucun événement passé pour l'instant."
            : "Aucune candidature à venir. Trouve un événement et candidate avec un véhicule."}
        </p>
      ) : (
        applications.map((app) => <ApplicationCard key={app.id} app={app} pass={passes[app.id]} past={past} />)
      )}
    </div>
  );
}
