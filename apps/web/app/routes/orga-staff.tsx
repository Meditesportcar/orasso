// Staff côté site (lot 24, ARCHITECTURE-SUITE § 8.1) : membres de la structure (rôles de structure et rôles du staff,
// droit de trancher), invitations, demandes reçues, puis, pour chaque événement à venir, les rôles ajustés, les
// présences, les relances et le lien vers la discussion du staff. Réservé au propriétaire et aux co-organisateurs
// (le layout cache l'entrée au staff ; l'API le refuse de toute façon). Sable imposé (layout).

import { Button, CheckboxField, Chip, Plate, SelectField, TextField } from "@orasso/design-system/web";
import {
  type EventCard,
  type EventStaffMember,
  type StaffRole,
  type StructureMember,
  staffPresenceLabels,
  staffRequestLabels,
  staffRoleLabels,
  staffRoleSchema,
  staffRoles,
  structureRoleLabels,
} from "@orasso/shared";
import { data, Form, useNavigation } from "react-router";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { nowMs } from "../lib/clock";
import { formatDateTime, formatWhen } from "../lib/format";
import type { Route } from "./+types/orga-staff";
import "../styles/staff.css";

export function meta() {
  return [{ title: "Staff · Orasso" }, { name: "robots", content: "noindex" }];
}

async function organizerOf(request: Request, slug: string) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === slug && m.status === "active");
  if (!membership || membership.role === "staff") {
    throw new Response("Réservé aux organisateurs de la structure.", { status: 403 });
  }
  return membership;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const membership = await organizerOf(request, params.structure);
  const id = membership.structureId;
  const [members, events] = await Promise.all([
    apiOrThrow<StructureMember[]>(request, `/structures/${id}/members`),
    apiOrThrow<EventCard[]>(request, `/structures/${id}/events`),
  ]);
  // Événements publiés pas encore fermés (J+1) : leurs présences et leurs relances.
  const open = events.filter((e) => e.status === "published" && Date.parse(e.endsAt) + 86_400_000 > nowMs());
  const perEvent = await Promise.all(
    open.map(async (e) => {
      const staff = await api<EventStaffMember[]>(request, `/events/${e.id}/staff`);
      return {
        id: e.id,
        title: e.title,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        staff: staff.ok ? staff.data : [],
      };
    }),
  );
  return { members, events: perEvent, isOwner: membership.role === "owner", slug: params.structure };
}

type Result = { section: string; error?: string; ok?: string };

const rolesOf = (form: FormData): StaffRole[] =>
  form
    .getAll("staffRoles")
    .map(String)
    .filter((r): r is StaffRole => staffRoleSchema.safeParse(r).success);

export async function action({ request, params }: Route.ActionArgs) {
  const membership = await organizerOf(request, params.structure);
  const id = membership.structureId;
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const intent = text("intent");
  const userId = encodeURIComponent(text("userId"));
  const fail = (section: string, res: { status: number; error: { message: string } }) =>
    data({ section, error: res.error.message } satisfies Result, { status: res.status });

  if (intent === "invite") {
    const who = text("who");
    const res = await api(request, `/structures/${id}/members`, {
      method: "POST",
      json: {
        ...(who.includes("@") ? { email: who } : { pseudo: who }),
        role: text("role") === "co_organizer" ? "co_organizer" : "staff",
        staffRoles: rolesOf(form),
        canDecide: form.get("canDecide") === "on",
      },
    });
    if (!res.ok) return fail("invite", res);
    return data({ section: "invite", ok: "Invitation envoyée." } satisfies Result);
  }
  if (intent === "accept" || intent === "decline") {
    const res = await api(request, `/structures/${id}/members/${userId}/${intent}`, {
      method: "POST",
      // Lot 36 : accepter fait entrer dans l'équipe, sans rôle ; les rôles se donnent pour chaque événement.
      json: {},
    });
    if (!res.ok) return fail("requests", res);
    return data({
      section: "requests",
      ok: intent === "accept" ? "Demande acceptée." : "Demande refusée.",
    } satisfies Result);
  }
  if (intent === "update-member") {
    const res = await api(request, `/structures/${id}/members/${userId}`, {
      method: "PATCH",
      // Lot 36 : accepter fait entrer dans l'équipe, sans rôle ; les rôles se donnent pour chaque événement.
      json: {},
    });
    if (!res.ok) return fail(`member-${text("userId")}`, res);
    return data({ section: `member-${text("userId")}`, ok: "Rôles enregistrés." } satisfies Result);
  }
  if (intent === "remove-member") {
    const res = await api(request, `/structures/${id}/members/${userId}`, { method: "DELETE" });
    if (!res.ok) return fail("members", res);
    return data({ section: "members", ok: "Membre retiré : son accès hors ligne est coupé à sa prochaine synchro." });
  }
  const eventId = encodeURIComponent(text("eventId"));
  if (intent === "event-roles" || intent === "event-roles-inherit") {
    const res = await api(request, `/events/${eventId}/staff/${userId}`, {
      method: "PATCH",
      json: {
        roles: intent === "event-roles-inherit" ? null : rolesOf(form),
        canDecide: form.get("canDecide") === "on",
      },
    });
    if (!res.ok) return fail(`event-${text("eventId")}`, res);
    return data({ section: `event-${text("eventId")}`, ok: "Rôles de l'événement enregistrés." } satisfies Result);
  }
  if (intent === "remind") {
    const res = await api<{ reminded: number }>(request, `/events/${eventId}/staff/remind`, {
      method: "POST",
      json: text("userId") ? { userId: text("userId") } : {},
    });
    if (!res.ok) return fail(`event-${text("eventId")}`, res);
    return data({
      section: `event-${text("eventId")}`,
      ok: res.data.reminded > 0 ? `${res.data.reminded} relance(s) envoyée(s).` : "Personne à relancer aujourd'hui.",
    } satisfies Result);
  }
  return data({ section: "members", error: "Action inconnue." } satisfies Result, { status: 400 });
}

function RoleBoxes({ selected, prefix }: { selected: readonly StaffRole[]; prefix: string }) {
  return (
    <fieldset className="staffp__roles">
      <legend className="o-t-label s-label">Rôles du staff</legend>
      {staffRoles.map((r) => (
        <CheckboxField
          key={`${prefix}-${r}`}
          label={staffRoleLabels[r]}
          name="staffRoles"
          value={r}
          defaultChecked={selected.includes(r)}
        />
      ))}
    </fieldset>
  );
}

export default function OrgaStaff({ loaderData, actionData }: Route.ComponentProps) {
  const { members, events, isOwner, slug } = loaderData;
  const busy = useNavigation().state !== "idle";
  const result = actionData as Result | undefined;
  const message = (section: string) =>
    result?.section === section ? (
      result.error ? (
        <p className="s-error" role="alert">
          {result.error}
        </p>
      ) : result.ok ? (
        <p className="s-notice s-notice--ok" role="status">
          {result.ok}
        </p>
      ) : null
    ) : null;
  const requests = members.filter((m) => m.status === "requested");
  const invited = members.filter((m) => m.status === "invited");
  const active = members.filter((m) => m.status === "active");
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Espace organisateur</div>
          <h1 className="s-title">Staff</h1>
        </div>
      </div>

      {requests.length > 0 && (
        <section className="orga__panel s-stack" aria-labelledby="staff-demandes" data-testid="staff-requests">
          <h2 id="staff-demandes" className="s-h2">
            Demandes reçues · {requests.length}
          </h2>
          <p className="s-muted">
            Ces personnes demandent à rejoindre ton équipe. Accepter les fait entrer dans l'équipe : leurs rôles se
            donnent ensuite pour chaque événement.
          </p>
          {message("requests")}
          {requests.map((m) => (
            <Plate as="div" key={m.userId} className="staffp__member s-stack" data-testid="staff-request">
              <Form method="post" className="staffp__form">
                <input type="hidden" name="userId" value={m.userId} />
                <div className="staffp__line">
                  <strong>{m.pseudo}</strong>
                  <Chip>{staffRequestLabels.pending}</Chip>
                </div>
                <div className="staffp__actions">
                  <Button type="submit" name="intent" value="accept" variant="secondary" icon="check" loading={busy}>
                    Accepter
                  </Button>
                  <Button type="submit" name="intent" value="decline" variant="secondary" icon="close" loading={busy}>
                    Refuser
                  </Button>
                </div>
              </Form>
            </Plate>
          ))}
        </section>
      )}

      <section className="orga__panel s-stack" aria-labelledby="staff-membres" data-testid="staff-members">
        <h2 id="staff-membres" className="s-h2">
          Membres · {active.length}
        </h2>
        {message("members")}
        {active.map((m) => {
          const editable = m.role === "staff" || (m.role === "co_organizer" && isOwner);
          return (
            <Plate as="div" key={m.userId} className="staffp__member s-stack" data-testid="staff-member">
              <Form method="post" className="staffp__form">
                <input type="hidden" name="userId" value={m.userId} />
                <div className="staffp__line">
                  <strong>{m.pseudo}</strong>
                  <Chip variant={m.role === "staff" ? undefined : "accent"}>{structureRoleLabels[m.role]}</Chip>
                </div>
                {m.role === "staff" ? (
                  <>
                    <RoleBoxes selected={m.staffRoles} prefix={`m-${m.userId}`} />
                    <CheckboxField
                      label="Peut aider à trancher (filtration)"
                      name="canDecide"
                      defaultChecked={m.canDecide}
                    />
                    {message(`member-${m.userId}`)}
                    <div className="staffp__actions">
                      <Button
                        type="submit"
                        name="intent"
                        value="update-member"
                        variant="secondary"
                        icon="check"
                        loading={busy}
                      >
                        Enregistrer les rôles
                      </Button>
                      <Button
                        type="submit"
                        name="intent"
                        value="remove-member"
                        variant="secondary"
                        icon="close"
                        loading={busy}
                      >
                        Retirer
                      </Button>
                    </div>
                  </>
                ) : editable ? (
                  <div className="staffp__actions">
                    <Button
                      type="submit"
                      name="intent"
                      value="remove-member"
                      variant="secondary"
                      icon="close"
                      loading={busy}
                    >
                      Retirer
                    </Button>
                  </div>
                ) : (
                  <span className="s-muted o-t-caption">Géré par le propriétaire de la structure.</span>
                )}
              </Form>
            </Plate>
          );
        })}
        {active.length === 0 && <p className="s-muted">Personne pour l'instant : invite des membres ci-dessous.</p>}
      </section>

      <section className="orga__panel s-stack" aria-labelledby="staff-inviter">
        <h2 id="staff-inviter" className="s-h2">
          Inviter
        </h2>
        <Form method="post" className="staffp__form" data-testid="staff-invite-form">
          <input type="hidden" name="intent" value="invite" />
          <TextField label="Pseudo ou e-mail du compte" name="who" required autoComplete="off" />
          {isOwner && (
            <SelectField
              label="Rôle dans la structure"
              name="role"
              defaultValue="staff"
              options={[
                { value: "staff", label: structureRoleLabels.staff },
                { value: "co_organizer", label: structureRoleLabels.co_organizer },
              ]}
            />
          )}
          <RoleBoxes selected={[]} prefix="invite" />
          <CheckboxField label="Peut aider à trancher (filtration)" name="canDecide" />
          {message("invite")}
          <div className="staffp__actions">
            <Button type="submit" variant="primary" icon="add" loading={busy}>
              Envoyer l'invitation
            </Button>
          </div>
        </Form>
        {invited.length > 0 && (
          <div className="s-stack s-stack--tight" data-testid="staff-invited">
            <h3 className="s-tile__title">Invitations en attente · {invited.length}</h3>
            {invited.map((m) => (
              <Form method="post" key={m.userId} className="staffp__line">
                <input type="hidden" name="userId" value={m.userId} />
                <span>
                  {m.pseudo} · {structureRoleLabels[m.role]}
                  {m.staffRoles.length > 0 ? ` · ${m.staffRoles.map((r) => staffRoleLabels[r]).join(", ")}` : ""}
                </span>
                <Button
                  type="submit"
                  name="intent"
                  value="remove-member"
                  variant="secondary"
                  icon="close"
                  loading={busy}
                >
                  Retirer l'invitation
                </Button>
              </Form>
            ))}
          </div>
        )}
      </section>

      {events.map((e) => {
        const unknown = e.staff.filter((s) => s.presence === "unknown");
        const present = e.staff.filter((s) => s.presence === "present").length;
        return (
          <section
            key={e.id}
            className="orga__panel s-stack staffp__event"
            aria-labelledby={`staff-ev-${e.id}`}
            data-testid="staff-event"
          >
            <div className="staffp__line">
              <div>
                <h2 id={`staff-ev-${e.id}`} className="s-h2">
                  {e.title}
                </h2>
                <div className="o-t-meta s-muted">{formatWhen(e.startsAt, e.endsAt)}</div>
              </div>
              <div className="staffp__actions">
                <Chip>
                  {present}/{e.staff.length} présents
                </Chip>
                <Button
                  variant="secondary"
                  icon="chat"
                  href={`/orga/${slug}/communication?onglet=staff&ouvrir=${e.id}`}
                  data-testid="staff-discussion-link"
                >
                  Discussion du staff
                </Button>
              </div>
            </div>
            {message(`event-${e.id}`)}
            {unknown.length > 0 && (
              <Form method="post" className="staffp__actions">
                <input type="hidden" name="eventId" value={e.id} />
                <Button type="submit" name="intent" value="remind" variant="secondary" icon="bell" loading={busy}>
                  Relancer ceux qui n'ont pas répondu · {unknown.length}
                </Button>
              </Form>
            )}
            {e.staff.length === 0 && <p className="s-muted">Aucun membre du staff sur cet événement.</p>}
            {e.staff.map((s) => (
              <Plate as="div" key={s.userId} className="staffp__member s-stack" data-testid="staff-event-member">
                <Form method="post" className="staffp__form">
                  <input type="hidden" name="eventId" value={e.id} />
                  <input type="hidden" name="userId" value={s.userId} />
                  <div className="staffp__line">
                    <strong>{s.pseudo}</strong>
                    <span className="staffp__actions">
                      <Chip variant={s.presence === "present" ? "accent" : undefined}>
                        {staffPresenceLabels[s.presence]}
                      </Chip>
                      {s.presence === "unknown" && s.reminderCount > 0 && (
                        <Chip data-testid="never-answered">
                          Jamais répondu · relancé {s.reminderCount} fois
                          {s.lastRemindedAt ? ` (dernière : ${formatDateTime(s.lastRemindedAt)})` : ""}
                        </Chip>
                      )}
                    </span>
                  </div>
                  <RoleBoxes selected={s.roles} prefix={`ev-${e.id}-${s.userId}`} />
                  {s.rolesOverride && <span className="o-t-caption s-muted">Rôles ajustés pour cet événement.</span>}
                  <CheckboxField
                    label="Peut aider à trancher (filtration)"
                    name="canDecide"
                    defaultChecked={s.canDecide}
                  />
                  <div className="staffp__actions">
                    <Button
                      type="submit"
                      name="intent"
                      value="event-roles"
                      variant="secondary"
                      icon="check"
                      loading={busy}
                    >
                      Enregistrer pour l'événement
                    </Button>
                    {s.rolesOverride && (
                      <Button
                        type="submit"
                        name="intent"
                        value="event-roles-inherit"
                        variant="secondary"
                        icon="undo"
                        loading={busy}
                      >
                        Revenir aux rôles de la structure
                      </Button>
                    )}
                    {s.presence === "unknown" && (
                      <Button type="submit" name="intent" value="remind" variant="secondary" icon="bell" loading={busy}>
                        Relancer
                      </Button>
                    )}
                  </div>
                </Form>
              </Plate>
            ))}
          </section>
        );
      })}
    </>
  );
}
