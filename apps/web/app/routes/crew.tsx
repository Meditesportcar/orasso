import { Button, Chip, SelectField, TextField } from "@orasso/design-system/web";
import {
  CREW_DESCRIPTION_MAX,
  CREW_REQUEST_MESSAGE_MAX,
  type CrewMemberView,
  type CrewPendingList,
  type CrewView,
  crewLabels,
  departments,
  gradeLabels,
  type UploadResult,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { CrewLogo } from "../components/Crews";
import { PersonAvatar } from "../components/People";
import { ReportDialog } from "../components/ReportDialog";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { type CrewActionData, crewAction, isCrewIntent } from "../lib/crews.server";
import type { Route } from "./+types/crew";

// Fiche d'un crew (lot 19, ARCHITECTURE-SUITE § 4.4) : nom, logo, description, département, chef et nombre de membres
// pour toute personne connectée ; liste des membres et discussion pour les membres (S16) ; demandes, invitations,
// modification, logo et dissolution pour le chef.
export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.crew.name ?? "Crew"} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const crew = await apiOrThrow<CrewView>(request, `/crews/by-slug/${encodeURIComponent(params.slug)}`);
  const member = crew.viewerState === "member" || crew.viewerState === "leader";
  const members = member ? await apiOrThrow<CrewMemberView[]>(request, `/crews/${crew.id}/members`) : null;
  const pending =
    crew.viewerState === "leader" && !crew.archived
      ? await apiOrThrow<CrewPendingList>(request, `/crews/${crew.id}/requests`)
      : null;
  return { crew, members, pending, userId: me.user.id };
}

type ActionData = CrewActionData;

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (isCrewIntent(intent)) return crewAction(request, form);
  const crewId = encodeURIComponent(String(form.get("crewId") ?? ""));
  if (intent === "crew_edit") {
    const res = await api(request, `/crews/${crewId}`, {
      method: "PATCH",
      json: {
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
        department: String(form.get("department") ?? ""),
      },
    });
    if (!res.ok) return data<ActionData>({ crewError: res.error.message }, { status: res.status });
    const updated = res.data as CrewView;
    if (updated.slug !== params.slug) throw redirect(`/c/${updated.slug}`);
    return data<ActionData>({ crewError: null, crewOk: crewLabels.saved });
  }
  if (intent === "crew_logo") {
    const file = form.get("logo");
    if (!(file instanceof File) || file.size === 0) {
      return data<ActionData>({ crewError: "Choisis une image." }, { status: 400 });
    }
    const body = new FormData();
    body.append("purpose", "crew_logo");
    body.append("file", file);
    const up = await api<UploadResult>(request, "/me/uploads", { method: "POST", body });
    if (!up.ok) return data<ActionData>({ crewError: up.error.message }, { status: up.status });
    const res = await api(request, `/crews/${crewId}/logo`, { method: "POST", json: { key: up.data.key } });
    if (!res.ok) return data<ActionData>({ crewError: res.error.message }, { status: res.status });
    return data<ActionData>({ crewError: null, crewOk: crewLabels.saved });
  }
  if (intent === "crew_logo_remove") {
    const res = await api(request, `/crews/${crewId}/logo`, { method: "POST", json: { key: null } });
    if (!res.ok) return data<ActionData>({ crewError: res.error.message }, { status: res.status });
    return data<ActionData>({ crewError: null });
  }
  if (intent === "crew_archive") {
    const res = await api(request, `/crews/${crewId}`, { method: "DELETE" });
    if (!res.ok) return data<ActionData>({ crewError: res.error.message }, { status: res.status });
    throw redirect("/app/crews");
  }
  return data<ActionData>({ crewError: "Action inconnue." }, { status: 400 });
}

function Hidden({ crewId, userId, intent }: { crewId: string; userId?: string; intent: string }) {
  return (
    <>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="crewId" value={crewId} />
      {userId && <input type="hidden" name="userId" value={userId} />}
    </>
  );
}

export default function Crew({ loaderData, actionData }: Route.ComponentProps) {
  const { crew, members, pending, userId } = loaderData;
  const result = actionData as ActionData | undefined;
  const busy = useNavigation().state !== "idle";
  const leader = crew.viewerState === "leader";
  const member = crew.viewerState === "member" || leader;
  const confirm = (text: string) => (e: React.FormEvent<HTMLFormElement>) => {
    if (!window.confirm(text)) e.preventDefault();
  };
  return (
    <div className="s-narrow s-stack" data-testid="crew" data-state={crew.viewerState}>
      <div className="crw-head">
        <CrewLogo url={crew.logoUrl} name={crew.name} size={88} />
        <div className="s-grow s-stack s-stack--tight">
          <div className="s-label o-t-label">{crewLabels.crew}</div>
          <h1 className="s-title o-never-truncate">{crew.name}</h1>
          <div className="s-row s-row--tight">
            <Chip>{crew.department}</Chip>
            <Chip>{crewLabels.membersCount(crew.membersCount)}</Chip>
            {leader && <Chip variant="accent">{crewLabels.leader}</Chip>}
          </div>
          {crew.leader && <span className="o-t-caption s-muted">{crewLabels.leaderOf(crew.leader.pseudo)}</span>}
        </div>
      </div>
      {crew.archived && <p className="s-notice">{crewLabels.archived}</p>}
      {crew.description && <p className="s-prewrap">{crew.description}</p>}

      {result?.crewError && (
        <p className="s-error" role="alert">
          {result.crewError}
        </p>
      )}
      {result?.crewOk && (
        <p className="s-notice s-notice--ok" role="status" data-testid="crew-ok">
          {result.crewOk}
        </p>
      )}

      {/* Une seule action principale selon la relation. */}
      {!crew.archived && crew.viewerState === "none" && (
        <Form method="post" className="s-form s-card" data-testid="crew-request-form">
          <Hidden crewId={crew.id} intent="crew_request" />
          <label className="s-label o-t-label" htmlFor="crew-message">
            {crewLabels.requestMessage}
          </label>
          <textarea
            id="crew-message"
            name="message"
            className="s-textarea"
            rows={3}
            maxLength={CREW_REQUEST_MESSAGE_MAX}
          />
          <Button type="submit" icon="crew" loading={busy} data-testid="crew-request">
            {crewLabels.requestJoin}
          </Button>
        </Form>
      )}
      {crew.viewerState === "requested" && (
        <div className="s-row">
          <Button variant="secondary" icon="wait" disabled data-testid="crew-requested">
            {crewLabels.requestSent}
          </Button>
          <Form method="post">
            <Hidden crewId={crew.id} userId={userId} intent="crew_request_cancel" />
            <Button type="submit" variant="secondary" icon="close" loading={busy}>
              {crewLabels.cancelRequest}
            </Button>
          </Form>
        </div>
      )}
      {crew.viewerState === "invited" && (
        <div className="s-row">
          <Form method="post">
            <Hidden crewId={crew.id} intent="crew_invitation_accept" />
            <Button type="submit" icon="check" loading={busy} data-testid="crew-invitation-accept">
              {crewLabels.acceptInvitation}
            </Button>
          </Form>
          <Form method="post">
            <Hidden crewId={crew.id} intent="crew_invitation_decline" />
            <Button type="submit" variant="secondary" icon="close" loading={busy}>
              {crewLabels.declineInvitation}
            </Button>
          </Form>
        </div>
      )}
      {member && crew.conversationId && (
        <Button
          variant={leader ? "secondary" : "primary"}
          icon="chat"
          href={`/app/boite/${crew.conversationId}`}
          data-testid="crew-discussion"
        >
          {crewLabels.openDiscussion}
        </Button>
      )}
      {!member && <p className="o-t-caption s-muted">{crewLabels.membersPrivate}</p>}
      {!leader && !crew.archived && <ReportDialog look="link" targetType="crew" targetId={crew.id} />}

      {leader && pending && (
        <section className="s-section" aria-labelledby="demandes-titre" data-testid="crew-pending">
          <h2 id="demandes-titre" className="s-h2">
            {crewLabels.pendingRequests}
          </h2>
          {pending.requests.length === 0 ? (
            <p className="s-muted">{crewLabels.noPending}</p>
          ) : (
            <ul className="s-people">
              {pending.requests.map((r) => (
                <li key={r.person.userId} className="s-person" data-testid="crew-pending-request">
                  <PersonAvatar url={r.person.avatarUrl} pseudo={r.person.pseudo} size={44} />
                  <div className="s-person__main">
                    <a className="s-person__name o-t-title" href={`/u/${encodeURIComponent(r.person.pseudo)}`}>
                      {r.person.pseudo}
                    </a>
                    {r.message && <p className="o-t-caption s-muted s-prewrap">{r.message}</p>}
                  </div>
                  <div className="s-row">
                    <Form method="post">
                      <Hidden crewId={crew.id} userId={r.person.userId} intent="crew_request_accept" />
                      <Button type="submit" variant="secondary" icon="check" loading={busy}>
                        {crewLabels.accept}
                      </Button>
                    </Form>
                    <Form method="post">
                      <Hidden crewId={crew.id} userId={r.person.userId} intent="crew_request_decline" />
                      <Button type="submit" variant="secondary" icon="close" loading={busy}>
                        {crewLabels.decline}
                      </Button>
                    </Form>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Form method="post" className="s-row crw-row-end" data-testid="crew-invite-form">
            <Hidden crewId={crew.id} intent="crew_invite" />
            <TextField label={crewLabels.invitePseudo} name="pseudo" required autoComplete="off" />
            <Button type="submit" variant="secondary" icon="add" loading={busy}>
              {crewLabels.invite}
            </Button>
          </Form>
          {pending.invitations.length > 0 && (
            <>
              <h3 className="s-label o-t-label">{crewLabels.pendingInvitations}</h3>
              <ul className="s-people">
                {pending.invitations.map((r) => (
                  <li key={r.person.userId} className="s-person">
                    <PersonAvatar url={r.person.avatarUrl} pseudo={r.person.pseudo} size={36} />
                    <span className="s-person__main">{r.person.pseudo}</span>
                    <Form method="post">
                      <Hidden crewId={crew.id} userId={r.person.userId} intent="crew_invitation_cancel" />
                      <Button type="submit" variant="secondary" icon="close" loading={busy}>
                        {crewLabels.cancelInvitation}
                      </Button>
                    </Form>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {members && (
        <section className="s-section" aria-labelledby="membres-titre" data-testid="crew-members">
          <h2 id="membres-titre" className="s-h2">
            {crewLabels.members}
          </h2>
          <ul className="s-people">
            {members.map((m) => (
              <li key={m.userId} className="s-person" data-testid="crew-member">
                <PersonAvatar url={m.avatarUrl} pseudo={m.pseudo} size={44} />
                <div className="s-person__main">
                  <a className="s-person__name o-t-title" href={`/u/${encodeURIComponent(m.pseudo)}`}>
                    {m.pseudo}
                  </a>
                  <div className="s-row s-row--tight">
                    <Chip>{gradeLabels[m.grade]}</Chip>
                    {m.role === "leader" && <Chip variant="accent">{crewLabels.leader}</Chip>}
                  </div>
                </div>
                {leader && m.role !== "leader" && !crew.archived && (
                  <Form method="post" onSubmit={confirm(crewLabels.removeConfirm(m.pseudo))}>
                    <Hidden crewId={crew.id} userId={m.userId} intent="crew_remove" />
                    <Button type="submit" variant="secondary" icon="close" loading={busy}>
                      {crewLabels.remove}
                    </Button>
                  </Form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {leader && !crew.archived && (
        <section className="s-section" aria-labelledby="modifier-titre">
          <h2 id="modifier-titre" className="s-h2">
            {crewLabels.edit}
          </h2>
          <Form method="post" encType="multipart/form-data" className="s-row crw-row-end" data-testid="crew-logo-form">
            <input type="hidden" name="intent" value="crew_logo" />
            <input type="hidden" name="crewId" value={crew.id} />
            <label className="s-stack s-stack--tight">
              <span className="s-label o-t-label">{crewLabels.logo}</span>
              <input type="file" name="logo" accept="image/jpeg,image/png,image/webp,image/heic" required />
            </label>
            <Button type="submit" variant="secondary" icon="add" loading={busy}>
              {crewLabels.changeLogo}
            </Button>
          </Form>
          {crew.logoUrl && (
            <Form method="post">
              <Hidden crewId={crew.id} intent="crew_logo_remove" />
              <Button type="submit" variant="secondary" icon="close" loading={busy}>
                {crewLabels.removeLogo}
              </Button>
            </Form>
          )}
          <Form method="post" className="s-form s-card" data-testid="crew-edit-form">
            <Hidden crewId={crew.id} intent="crew_edit" />
            <TextField
              label={crewLabels.name}
              name="name"
              defaultValue={crew.name}
              minLength={3}
              maxLength={40}
              required
            />
            <label className="s-label o-t-label" htmlFor="crew-description">
              {crewLabels.description}
            </label>
            <textarea
              id="crew-description"
              name="description"
              className="s-textarea"
              rows={4}
              maxLength={CREW_DESCRIPTION_MAX}
              defaultValue={crew.description ?? ""}
            />
            <SelectField
              label={crewLabels.department}
              name="department"
              defaultValue={crew.department}
              options={departments.map((d) => ({ value: d, label: d }))}
            />
            <Button type="submit" variant="secondary" icon="check" loading={busy}>
              {crewLabels.save}
            </Button>
          </Form>
          <Form method="post" onSubmit={confirm(crewLabels.archiveConfirm)}>
            <Hidden crewId={crew.id} intent="crew_archive" />
            <Button type="submit" variant="secondary" icon="close" loading={busy} data-testid="crew-archive">
              {crewLabels.archive}
            </Button>
          </Form>
          <p className="o-t-caption s-muted">{crewLabels.leaderCannotLeave}</p>
        </section>
      )}

      {crew.viewerState === "member" && !crew.archived && (
        <Form method="post" onSubmit={confirm(crewLabels.leaveConfirm)}>
          <Hidden crewId={crew.id} userId={userId} intent="crew_leave" />
          <Button type="submit" variant="secondary" icon="undo" loading={busy} data-testid="crew-leave">
            {crewLabels.leave}
          </Button>
        </Form>
      )}
    </div>
  );
}
