// Mes sanctions (lot 32) : ce que la modération a décidé sur mon compte, et la contestation (une seule fois par
// sanction, docs/01). Jamais qui a signalé ni les signalements. Possible même pendant une suspension (§ 0.4).
import { Button, Chip, Plate } from "@orasso/design-system/web";
import {
  contestStateLabels,
  MODERATION,
  type MySanction,
  moderationLabels,
  reportReasonLabels,
  sanctionKindLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import { TextAreaField } from "../components/Fields";
import { api, apiOrThrow } from "../lib/api.server";
import { formatDateTime } from "../lib/format";
import type { Route } from "./+types/sanctions";

// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta() {
  return [{ title: `${moderationLabels.mySanctions} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return {
    rows: await apiOrThrow<MySanction[]>(request, "/me/sanctions"),
    sent: new URL(request.url).searchParams.has("contestee"),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const id = String(form.get("sanctionId") ?? "");
  const res = await api(request, `/sanctions/${encodeURIComponent(id)}/contest`, {
    method: "POST",
    json: { message: String(form.get("message") ?? "") },
  });
  if (!res.ok) return data({ error: res.error.message, id }, { status: res.status });
  return redirect("/app/sanctions?contestee=1");
}

export default function MySanctions({ loaderData, actionData }: Route.ComponentProps) {
  const { rows, sent } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <div className="s-narrow s-stack" data-testid="my-sanctions">
      <FicheBar title={moderationLabels.mySanctions} back="/app/moi" />
      {sent && (
        <p className="s-notice s-notice--ok" role="status" data-testid="contest-sent">
          {moderationLabels.contestSent}
        </p>
      )}
      {rows.length === 0 && <p className="s-notice">{moderationLabels.mySanctionsEmpty}</p>}
      {rows.map((s) => (
        <section
          key={s.id}
          className="s-card s-stack"
          aria-label={sanctionKindLabels[s.kind]}
          data-testid="my-sanction"
        >
          <div className="s-row s-row--between">
            <h2 className="s-h2">{sanctionKindLabels[s.kind]}</h2>
            {s.active && <Chip variant="accent">En cours</Chip>}
          </div>
          <p>
            {moderationLabels.suspendedReason(reportReasonLabels[s.reason])} ·{" "}
            {moderationLabels.sanctionFrom(formatDateTime(s.startsAt))}
            {s.endsAt && s.kind !== "warning" ? ` ${moderationLabels.sanctionUntil(formatDateTime(s.endsAt))}` : ""}
          </p>
          {s.note && <p className="s-prewrap o-t-caption">{s.note}</p>}
          {s.active && <p className="o-t-caption s-muted">{moderationLabels.suspendedReadOnly}</p>}
          {s.liftedAt && <p className="o-t-caption">{moderationLabels.sanctionLifted(formatDateTime(s.liftedAt))}</p>}
          {s.contestStatus !== "none" && (
            <Plate className="s-stack s-stack--tight">
              <span className="s-label o-t-label">{contestStateLabels[s.contestStatus]}</span>
              {s.contestMessage && <p className="s-prewrap">{s.contestMessage}</p>}
            </Plate>
          )}
          {s.canContest && (
            <Form method="post" className="s-stack" data-testid="contest-form">
              <input type="hidden" name="sanctionId" value={s.id} />
              <p className="o-t-caption s-muted">{moderationLabels.contestHint}</p>
              <TextAreaField
                label={moderationLabels.contestMessage}
                name="message"
                rows={4}
                maxLength={MODERATION.contestMax}
                required
              />
              {actionData && "error" in actionData && actionData.id === s.id && (
                <p className="s-error" role="alert">
                  {actionData.error}
                </p>
              )}
              <div className="s-row">
                <Button type="submit" variant="secondary" icon="next" loading={busy} data-testid="contest-send">
                  {moderationLabels.contestSend}
                </Button>
              </div>
            </Form>
          )}
        </section>
      ))}
    </div>
  );
}
