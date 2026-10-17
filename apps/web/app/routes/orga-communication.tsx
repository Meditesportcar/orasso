// Espace organisateur > Communication (lot 20, docs/02 « communication (consignes, annonces, messages groupés, modèles,
// fil public) » ; « staff (discussions) ») : onglets Consignes et annonces · Messages groupés · Modèles · Messages des
// participants · Discussions du staff. Le staff de la structure n'y voit que ses discussions. Sable imposé (layout).

import { Button, CheckboxField, Chip, SelectField, TextField } from "@orasso/design-system/web";
import {
  type AnnouncementView,
  announcementAudienceLabels,
  type ConversationPage,
  communicationLabels,
  type EventCard,
  type EventOrganizer,
  GROUP_MESSAGE_BODY_MAX,
  type GroupMessagePreview,
  type GroupMessageView,
  type MessageSegment,
  type MessagingQuota,
  type MyStaffEvent,
  messageSegmentLabels,
  messageSegments,
  type StaffConversationState,
  type StructurePublic,
  segmentNeedsEvent,
  type TemplateView,
  templateKindLabels,
  templateKinds,
  type UploadResult,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { data, Form, redirect, useActionData, useNavigation } from "react-router";
import { FeedItem } from "../components/EventFeed";
import { TextAreaField } from "../components/Fields";
import { ConversationRow } from "../components/Messaging";
import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { nowMs } from "../lib/clock";
import { formatDateTime, formatDay, formatWhen } from "../lib/format";
import "../styles/communication.css";
import type { Route } from "./+types/orga-communication";

const TABS = ["consignes", "messages", "modeles", "participants", "staff"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  consignes: communicationLabels.tabInstructions,
  messages: communicationLabels.tabGroup,
  modeles: communicationLabels.tabTemplates,
  participants: communicationLabels.tabParticipants,
  staff: communicationLabels.tabStaff,
};

export function meta() {
  return [{ title: "Communication · Orasso" }, { name: "robots", content: "noindex" }];
}

async function context(request: Request, slug: string) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === slug && m.status === "active");
  if (!membership) throw new Response("Réservé aux membres de la structure.", { status: 403 });
  const structure = await apiOrThrow<StructurePublic>(request, `/structures/by-slug/${encodeURIComponent(slug)}`);
  return { structure, organizer: membership.role !== "staff" };
}

const visible = (events: EventCard[]) => events.filter((e) => e.status !== "draft");

export async function loader({ request, params }: Route.LoaderArgs) {
  const { structure, organizer } = await context(request, params.structure);
  const url = new URL(request.url);
  const asked = url.searchParams.get("onglet") as Tab | null;
  const tab: Tab = organizer ? (asked && TABS.includes(asked) ? asked : "consignes") : "staff";
  const base = { tab, organizer, structureId: structure.id, structureName: structure.name };

  // Ouvrir la discussion du staff d'un événement : on résout la conversation puis on y va.
  const open = url.searchParams.get("ouvrir");
  if (open) {
    const res = await api<StaffConversationState>(request, `/events/${encodeURIComponent(open)}/staff-conversation`);
    if (res.ok) throw redirect(`/orga/${params.structure}/communication/conversation/${res.data.conversationId}`);
  }

  if (tab === "staff") {
    if (organizer) {
      const list = await apiOrThrow<{ items: StaffConversationState[] }>(
        request,
        `/structures/${structure.id}/staff-conversations`,
      );
      return { ...base, staff: list.items, staffEvents: [] as MyStaffEvent[] };
    }
    const permanent = await apiOrThrow<StaffConversationState>(
      request,
      `/structures/${structure.id}/staff-conversation`,
    );
    const mine = await apiOrThrow<MyStaffEvent[]>(request, "/me/staff-events");
    return { ...base, staff: [permanent], staffEvents: mine.filter((m) => m.structure.id === structure.id) };
  }
  if (tab === "participants") {
    const page = await apiOrThrow<ConversationPage>(request, `/structures/${structure.id}/conversations?limit=50`);
    return { ...base, conversations: page.items };
  }
  if (tab === "modeles") {
    const templates = await apiOrThrow<{ items: TemplateView[] }>(request, `/structures/${structure.id}/templates`);
    return { ...base, templates: templates.items };
  }
  const events = visible(await apiOrThrow<EventCard[]>(request, `/structures/${structure.id}/events`));
  if (tab === "messages") {
    const [templates, history, quota] = await Promise.all([
      apiOrThrow<{ items: TemplateView[] }>(request, `/structures/${structure.id}/templates`),
      apiOrThrow<{ items: GroupMessageView[] }>(request, `/structures/${structure.id}/group-messages`),
      apiOrThrow<MessagingQuota>(request, `/structures/${structure.id}/messaging/quota`),
    ]);
    return {
      ...base,
      events,
      templates: templates.items,
      history: history.items,
      quota,
      templateId: url.searchParams.get("modele"),
      // Identifiant d'envoi (idempotence : un double clic n'envoie qu'une fois), renouvelé après chaque envoi.
      clientId: crypto.randomUUID(),
    };
  }
  // Consignes et annonces : un événement à la fois (le prochain par défaut).
  const upcoming = events.find((e) => new Date(e.endsAt).getTime() > nowMs()) ?? events.at(-1) ?? null;
  const selectedId = url.searchParams.get("e") ?? upcoming?.id ?? null;
  if (!selectedId) return { ...base, events, event: null, feed: [] as AnnouncementView[] };
  const [event, feed] = await Promise.all([
    apiOrThrow<EventOrganizer>(request, `/events/${encodeURIComponent(selectedId)}`),
    apiOrThrow<{ items: AnnouncementView[] }>(request, `/events/${encodeURIComponent(selectedId)}/announcements`),
  ]);
  if (event.structure.id !== structure.id) throw new Response("Événement introuvable.", { status: 404 });
  return { ...base, events, event, feed: feed.items };
}

type Result = { error?: string; ok?: string };

export async function action({ request, params }: Route.ActionArgs) {
  const { structure, organizer } = await context(request, params.structure);
  if (!organizer) return data({ error: "Réservé aux organisateurs." } satisfies Result, { status: 403 });
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "");
  const fail = (res: { status: number; error: { message: string } }) =>
    data({ error: res.error.message } satisfies Result, { status: res.status });
  const eventId = encodeURIComponent(text("eventId"));
  const here = `/orga/${params.structure}/communication`;
  switch (text("intent")) {
    case "instructions": {
      const res = await api(request, `/events/${eventId}/instructions/send`, {
        method: "POST",
        json: { instructions: text("instructions") },
      });
      return res.ok ? data({ ok: communicationLabels.instructionsSent } satisfies Result) : fail(res);
    }
    case "announce": {
      const res = await api(request, `/events/${eventId}/announcements`, {
        method: "POST",
        json: {
          body: text("body"),
          imageKey: text("imageKey") || null,
          notify: form.get("notify") === "on",
          pinned: form.get("pinned") === "on",
          audience: text("audience") === "participants" ? "participants" : "public",
        },
      });
      return res.ok ? data({ ok: communicationLabels.announcementPublished } satisfies Result) : fail(res);
    }
    case "pin":
    case "unpin": {
      const res = await api(request, `/events/${eventId}/announcements/${encodeURIComponent(text("id"))}`, {
        method: "PATCH",
        json: { pinned: text("intent") === "pin" },
      });
      return res.ok ? redirect(`${here}?e=${eventId}`) : fail(res);
    }
    case "remove": {
      const res = await api(request, `/events/${eventId}/announcements/${encodeURIComponent(text("id"))}`, {
        method: "DELETE",
      });
      return res.ok ? redirect(`${here}?e=${eventId}`) : fail(res);
    }
    case "group": {
      const segment = text("segment") as MessageSegment;
      const res = await api<{ recipientsCount: number }>(request, `/structures/${structure.id}/group-messages`, {
        method: "POST",
        json: {
          clientId: text("clientId"),
          segment,
          eventId: text("eventId") || null,
          templateId: text("templateId") || null,
          subject: text("subject") || null,
          body: text("body"),
        },
      });
      return res.ok
        ? data({ ok: communicationLabels.groupSent(res.data.recipientsCount) } satisfies Result)
        : fail(res);
    }
    case "template_create": {
      const res = await api(request, `/structures/${structure.id}/templates`, {
        method: "POST",
        json: { kind: text("kind"), name: text("name"), subject: text("subject") || null, body: text("body") },
      });
      return res.ok ? redirect(`${here}?onglet=modeles`) : fail(res);
    }
    case "template_delete": {
      const res = await api(request, `/structures/${structure.id}/templates/${encodeURIComponent(text("id"))}`, {
        method: "DELETE",
      });
      return res.ok ? redirect(`${here}?onglet=modeles`) : fail(res);
    }
  }
  return data({ error: "Action inconnue." } satisfies Result, { status: 400 });
}

function Tabs({ tab, organizer, base }: { tab: Tab; organizer: boolean; base: string }) {
  const tabs = organizer ? TABS : (["staff"] as const);
  return (
    <nav className="comm__tabs" aria-label={communicationLabels.space}>
      {tabs.map((t) => (
        <a
          key={t}
          href={t === "consignes" ? base : `${base}?onglet=${t}`}
          className="s-chip-link"
          aria-current={tab === t ? "page" : undefined}
        >
          <Chip selected={tab === t}>{TAB_LABELS[t]}</Chip>
        </a>
      ))}
    </nav>
  );
}

function Feedback() {
  const result = useActionData() as Result | undefined;
  if (result?.error)
    return (
      <p className="s-notice s-notice--alert" role="alert">
        {result.error}
      </p>
    );
  if (result?.ok)
    return (
      <p className="s-notice s-notice--ok" role="status" data-testid="comm-ok">
        {result.ok}
      </p>
    );
  return null;
}

export default function OrgaCommunication({ loaderData, params }: Route.ComponentProps) {
  const base = `/orga/${params.structure}/communication`;
  const d = loaderData;
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">{d.structureName}</div>
          <h1 className="s-title">{communicationLabels.space}</h1>
        </div>
      </div>
      <Tabs tab={d.tab} organizer={d.organizer} base={base} />
      <Feedback />
      {"feed" in d && <InstructionsTab events={d.events} event={d.event} feed={d.feed} base={base} />}
      {"history" in d && (
        <GroupTab
          structureId={d.structureId}
          events={d.events}
          templates={d.templates}
          history={d.history}
          quota={d.quota}
          templateId={d.templateId}
          initialClientId={d.clientId}
        />
      )}
      {"templates" in d && !("history" in d) && <TemplatesTab templates={d.templates} base={base} />}
      {"conversations" in d && <ParticipantsTab conversations={d.conversations} base={base} />}
      {"staff" in d && <StaffTab staff={d.staff} staffEvents={d.staffEvents} base={base} />}
    </>
  );
}

function EventChips({ events, selected, base }: { events: EventCard[]; selected: string | null; base: string }) {
  return (
    <nav className="comm__tabs" aria-label="Événement">
      {events.map((e) => (
        <a
          key={e.id}
          href={`${base}?e=${e.id}`}
          className="s-chip-link"
          aria-current={e.id === selected ? "page" : undefined}
        >
          <Chip selected={e.id === selected}>
            {e.title} · {formatDay(e.startsAt)}
          </Chip>
        </a>
      ))}
    </nav>
  );
}

function InstructionsTab({
  events,
  event,
  feed,
  base,
}: {
  events: EventCard[];
  event: EventOrganizer | null;
  feed: AnnouncementView[];
  base: string;
}) {
  const busy = useNavigation().state !== "idle";
  if (!event) return <p className="s-notice">Publie un événement pour lui écrire des consignes et des annonces.</p>;
  return (
    <>
      <EventChips events={events} selected={event.id} base={base} />
      <section className="orga__panel s-stack" data-testid="instructions-panel">
        <h2 className="s-h2">{communicationLabels.instructions}</h2>
        <p className="s-muted">{communicationLabels.instructionsHint}</p>
        <Form method="post" className="s-stack">
          <input type="hidden" name="intent" value="instructions" />
          <input type="hidden" name="eventId" value={event.id} />
          <TextAreaField
            label={communicationLabels.instructions}
            name="instructions"
            defaultValue={event.instructions ?? ""}
            maxLength={2000}
            rows={5}
          />
          <div className="s-row">
            <Button type="submit" variant="secondary" icon="next" loading={busy} data-testid="send-instructions">
              {communicationLabels.instructionsSend}
            </Button>
          </div>
        </Form>
      </section>
      <AnnouncementForm eventId={event.id} />
      <section className="orga__panel s-stack" data-testid="orga-feed">
        <h2 className="s-h2">{communicationLabels.feed}</h2>
        <p className="s-muted">
          Public sur <a href={`/e/${event.slug}#fil`}>la page de l'événement</a> ; les entrées « Inscrits retenus » ne
          s'affichent qu'à eux.
        </p>
        {feed.length === 0 ? (
          <p className="s-muted">{communicationLabels.feedEmpty}</p>
        ) : (
          <ul className="comm__feed">
            {feed.map((item) => (
              <FeedItem
                key={item.id}
                item={item}
                actions={
                  <Form method="post" className="comm__actions">
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="id" value={item.id} />
                    <Button
                      type="submit"
                      name="intent"
                      value={item.pinned ? "unpin" : "pin"}
                      variant="secondary"
                      icon={item.pinned ? "undo" : "check"}
                    >
                      {item.pinned ? communicationLabels.unpin : communicationLabels.pin}
                    </Button>
                    <Button
                      type="submit"
                      name="intent"
                      value="remove"
                      variant="secondary"
                      icon="close"
                      onClick={(e) => {
                        if (!window.confirm(communicationLabels.removeConfirm)) e.preventDefault();
                      }}
                    >
                      {communicationLabels.remove}
                    </Button>
                  </Form>
                }
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** Nouvelle annonce : texte, photo (envoyée d'abord à `/api/me/uploads`), visibilité, « prévenir les inscrits ». */
function AnnouncementForm({ eventId }: { eventId: string }) {
  const navigation = useNavigation();
  const result = useActionData() as Result | undefined;
  const busy = navigation.state !== "idle";
  const [photo, setPhoto] = useState<{ key: string; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Annonce publiée : le formulaire se vide.
  useEffect(() => {
    if (result?.ok === communicationLabels.announcementPublished) {
      formRef.current?.reset();
      setPhoto(null);
    }
  }, [result]);

  const sendPhoto = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("purpose", "announcement");
      body.append("file", file);
      const res = await fetch("/api/me/uploads", { method: "POST", body, credentials: "same-origin" });
      const json = (await res.json().catch(() => null)) as UploadResult | { error?: { message?: string } } | null;
      if (!res.ok || !json || !("key" in json)) {
        setError((json as { error?: { message?: string } } | null)?.error?.message ?? "Envoi de la photo impossible.");
        return;
      }
      setPhoto({ key: json.key, preview: URL.createObjectURL(file) });
    } catch {
      setError("Connexion impossible. Réessaie.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section className="orga__panel s-stack" data-testid="announcement-panel">
      <h2 className="s-h2">{communicationLabels.announcementNew}</h2>
      <Form method="post" className="s-stack" ref={formRef}>
        <input type="hidden" name="intent" value="announce" />
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="imageKey" value={photo?.key ?? ""} />
        <TextAreaField label={communicationLabels.announcementBody} name="body" maxLength={1000} rows={4} required />
        <SelectField
          label={communicationLabels.announcementAudience}
          name="audience"
          defaultValue="public"
          options={(["public", "participants"] as const).map((a) => ({
            value: a,
            label: announcementAudienceLabels[a],
          }))}
        />
        <CheckboxField name="notify" label={communicationLabels.announcementNotify} />
        <CheckboxField name="pinned" label={communicationLabels.pin} />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          hidden
          data-testid="announcement-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void sendPhoto(file);
          }}
        />
        {photo && <img className="comm__preview" src={photo.preview} alt="" />}
        {error && (
          <p className="s-error" role="alert">
            {error}
          </p>
        )}
        <div className="s-row">
          {photo ? (
            <Button variant="secondary" icon="close" onClick={() => setPhoto(null)}>
              {communicationLabels.photoRemove}
            </Button>
          ) : (
            <Button variant="secondary" icon="add" loading={uploading} onClick={() => fileRef.current?.click()}>
              {communicationLabels.photo}
            </Button>
          )}
          <Button type="submit" variant="primary" icon="share" loading={busy} data-testid="publish-announcement">
            {communicationLabels.announcementPublish}
          </Button>
        </div>
      </Form>
    </section>
  );
}

function GroupTab({
  structureId,
  events,
  templates,
  history,
  quota,
  templateId,
  initialClientId,
}: {
  initialClientId: string;
  structureId: string;
  events: EventCard[];
  templates: TemplateView[];
  history: GroupMessageView[];
  quota: MessagingQuota;
  templateId: string | null;
}) {
  const busy = useNavigation().state !== "idle";
  const result = useActionData() as Result | undefined;
  const initial = templates.find((t) => t.id === templateId) ?? null;
  const upcoming = events.find((e) => new Date(e.endsAt).getTime() > nowMs()) ?? null;
  const [segment, setSegment] = useState<MessageSegment>("accepted");
  const [eventId, setEventId] = useState<string>(upcoming?.id ?? "");
  const [tpl, setTpl] = useState<string>(initial?.id ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [preview, setPreview] = useState<GroupMessagePreview | null>(null);
  const [clientId, setClientId] = useState(initialClientId);
  const needsEvent = segmentNeedsEvent(segment);

  // Nombre de destinataires et quota restant, recalculés à chaque choix (jamais la liste des personnes).
  useEffect(() => {
    if (needsEvent && !eventId) {
      setPreview(null);
      return;
    }
    const q = new URLSearchParams({ segment, ...(eventId ? { eventId } : {}) });
    let alive = true;
    void apiFetch<GroupMessagePreview>(`/structures/${structureId}/group-messages/preview?${q}`).then((res) => {
      if (alive) setPreview(res.ok ? res.data : null);
    });
    return () => {
      alive = false;
    };
  }, [segment, eventId, needsEvent, structureId]);

  // Envoyé : nouveau clientId (un autre envoi), formulaire vidé.
  useEffect(() => {
    if (result?.ok) {
      setClientId(crypto.randomUUID());
      setBody("");
      setSubject("");
      setTpl("");
    }
  }, [result]);

  const followers = quota.followers;
  const blocked = segment === "followers" && followers.remaining <= 0;
  return (
    <>
      <section className="orga__panel s-stack" data-testid="group-panel">
        <h2 className="s-h2">{communicationLabels.groupNew}</h2>
        <p className="s-muted">{communicationLabels.groupHint}</p>
        <Form method="post" className="s-stack">
          <input type="hidden" name="intent" value="group" />
          <input type="hidden" name="clientId" value={clientId} />
          <SelectField
            label={communicationLabels.groupSegment}
            name="segment"
            value={segment}
            onChange={(e) => setSegment(e.target.value as MessageSegment)}
            options={messageSegments.map((s) => ({ value: s, label: messageSegmentLabels[s] }))}
          />
          <SelectField
            label={communicationLabels.groupEvent}
            name="eventId"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            options={[
              ...(needsEvent ? [] : [{ value: "", label: communicationLabels.groupNoEvent }]),
              ...events.map((e) => ({ value: e.id, label: `${e.title} · ${formatDay(e.startsAt)}` })),
            ]}
          />
          <SelectField
            label={communicationLabels.groupTemplate}
            name="templateId"
            value={tpl}
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              setTpl(e.target.value);
              if (t) {
                setSubject(t.subject ?? "");
                setBody(t.body);
              }
            }}
            options={[
              { value: "", label: communicationLabels.groupNoTemplate },
              ...templates.map((t) => ({ value: t.id, label: `${t.name}${t.orasso ? " · Orasso" : ""}` })),
            ]}
          />
          <TextField
            label={communicationLabels.groupSubject}
            name="subject"
            maxLength={120}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <TextAreaField
            label={communicationLabels.groupBody}
            name="body"
            maxLength={GROUP_MESSAGE_BODY_MAX}
            rows={6}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            help={communicationLabels.groupVariables}
          />
          <div className="comm__meta o-t-meta" data-testid="group-preview">
            <strong>{preview ? communicationLabels.groupRecipients(preview.recipientsCount) : "—"}</strong>
            <span>{communicationLabels.quotaFollowers(followers.remaining, followers.quota)}</span>
            <span>{communicationLabels.quotaDaily(quota.dailyRemaining)}</span>
          </div>
          {blocked && followers.resetsAt && (
            <p className="s-notice">{communicationLabels.quotaResetsAt(formatDateTime(followers.resetsAt))}</p>
          )}
          <div className="s-row">
            <Button
              type="submit"
              variant="primary"
              icon="next"
              loading={busy}
              disabled={blocked || !body.trim() || preview?.recipientsCount === 0}
              data-testid="send-group"
            >
              {communicationLabels.groupSend}
            </Button>
          </div>
        </Form>
      </section>
      <section className="orga__panel s-stack" data-testid="group-history">
        <h2 className="s-h2">{communicationLabels.groupHistory}</h2>
        {history.length === 0 ? (
          <p className="s-muted">{communicationLabels.groupHistoryEmpty}</p>
        ) : (
          <ul className="comm__list">
            {history.map((g) => (
              <li key={g.id} className="s-card" data-testid="group-item">
                <div className="s-row s-row--between">
                  <span className="o-t-label s-muted">
                    {messageSegmentLabels[g.segment]}
                    {g.event ? ` · ${g.event.title}` : ""} · {formatDateTime(g.createdAt)}
                  </span>
                  {g.status !== "sent" && <Chip>{communicationLabels.groupSending}</Chip>}
                </div>
                {g.subject && <strong>{g.subject}</strong>}
                <p className="s-prewrap comm__body">{g.body}</p>
                <span className="o-t-meta" data-testid="group-stats">
                  {communicationLabels.groupRecipients(g.recipientsCount)} ·{" "}
                  {communicationLabels.groupRead(g.readCount)}
                  {g.authorPseudo ? ` · ${g.authorPseudo}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function TemplatesTab({ templates, base }: { templates: TemplateView[]; base: string }) {
  const busy = useNavigation().state !== "idle";
  const orasso = templates.filter((t) => t.orasso);
  const mine = templates.filter((t) => !t.orasso);
  const card = (t: TemplateView) => (
    <li key={t.id} className="s-card" data-testid="template">
      <div className="s-row s-row--between">
        <strong>{t.name}</strong>
        <span className="o-t-label s-muted">
          {templateKindLabels[t.kind]}
          {t.orasso ? ` · ${communicationLabels.templateReadOnly}` : ""}
        </span>
      </div>
      {t.subject && <span className="o-t-meta">{t.subject}</span>}
      <p className="s-prewrap comm__body s-muted">{t.body}</p>
      <Form method="post" className="comm__actions">
        <input type="hidden" name="id" value={t.id} />
        <Button variant="secondary" icon="chat" href={`${base}?onglet=messages&modele=${t.id}`}>
          {communicationLabels.templateUse}
        </Button>
        {!t.orasso && (
          <Button type="submit" name="intent" value="template_delete" variant="secondary" icon="close">
            {communicationLabels.templateDelete}
          </Button>
        )}
      </Form>
    </li>
  );
  return (
    <>
      <section className="orga__panel s-stack">
        <h2 className="s-h2">{communicationLabels.templatesOrasso}</h2>
        <ul className="comm__list">{orasso.map(card)}</ul>
      </section>
      <section className="orga__panel s-stack">
        <h2 className="s-h2">{communicationLabels.templatesMine}</h2>
        {mine.length === 0 ? (
          <p className="s-muted">{communicationLabels.templatesEmpty}</p>
        ) : (
          <ul className="comm__list">{mine.map(card)}</ul>
        )}
      </section>
      <section className="orga__panel s-stack" data-testid="template-form">
        <h2 className="s-h2">{communicationLabels.templateNew}</h2>
        <Form method="post" className="s-stack">
          <input type="hidden" name="intent" value="template_create" />
          <TextField label={communicationLabels.templateName} name="name" maxLength={60} required />
          <SelectField
            label={communicationLabels.templateKind}
            name="kind"
            defaultValue="message"
            options={templateKinds.map((k) => ({ value: k, label: templateKindLabels[k] }))}
          />
          <TextField label={communicationLabels.groupSubject} name="subject" maxLength={120} />
          <TextAreaField
            label={communicationLabels.groupBody}
            name="body"
            maxLength={GROUP_MESSAGE_BODY_MAX}
            rows={5}
            required
            help={communicationLabels.groupVariables}
          />
          <div className="s-row">
            <Button type="submit" variant="primary" icon="add" loading={busy}>
              {communicationLabels.templateSave}
            </Button>
          </div>
        </Form>
      </section>
    </>
  );
}

function ParticipantsTab({ conversations, base }: { conversations: ConversationPage["items"]; base: string }) {
  if (conversations.length === 0) return <p className="s-notice">{communicationLabels.participantsEmpty}</p>;
  return (
    <section className="orga__panel s-stack" data-testid="participants">
      <ul className="s-convos comm__list">
        {conversations.map((c) => (
          <ConversationRow key={c.id} c={c} href={`${base}/conversation/${c.id}`} />
        ))}
      </ul>
    </section>
  );
}

function StaffTab({
  staff,
  staffEvents,
  base,
}: {
  staff: StaffConversationState[];
  staffEvents: MyStaffEvent[];
  base: string;
}) {
  const permanent = staff.find((s) => s.kind === "structure_staff");
  const events = staff.filter((s) => s.kind === "event_staff");
  return (
    <>
      {permanent && (
        <section className="orga__panel s-stack" data-testid="staff-permanent">
          <h2 className="s-h2">{communicationLabels.staffPermanent}</h2>
          <p className="s-muted">{communicationLabels.staffPermanentHint}</p>
          <div className="s-row">
            <Button variant="secondary" icon="chat" href={`${base}/conversation/${permanent.conversationId}`}>
              {communicationLabels.staffOpenChat}
              {permanent.unreadCount > 0 ? ` · ${communicationLabels.unread(permanent.unreadCount)}` : ""}
            </Button>
          </div>
        </section>
      )}
      <section className="orga__panel s-stack" data-testid="staff-events">
        <h2 className="s-h2">{communicationLabels.staffByEvent}</h2>
        <p className="s-muted">{communicationLabels.staffByEventHint}</p>
        {events.length === 0 && staffEvents.length === 0 && <p className="s-muted">{communicationLabels.staffEmpty}</p>}
        <ul className="comm__list">
          {events.map((s) => (
            <li key={s.conversationId} className="s-card" data-testid="staff-event">
              <strong>{s.event?.title}</strong>
              {s.event && <span className="o-t-meta s-muted">{formatWhen(s.event.startsAt, s.event.endsAt)}</span>}
              <span className="o-t-meta" data-testid="staff-state">
                {s.open
                  ? s.closedAt
                    ? communicationLabels.staffClosesAt(formatDateTime(s.closedAt))
                    : communicationLabels.staffOpen
                  : communicationLabels.staffClosed(
                      formatDateTime(s.closedAt ?? ""),
                      formatDateTime(s.readableUntil ?? ""),
                    )}
              </span>
              <div className="s-row">
                <Button variant="secondary" icon="chat" href={`${base}/conversation/${s.conversationId}`}>
                  {communicationLabels.staffOpenChat}
                  {s.unreadCount > 0 ? ` · ${communicationLabels.unread(s.unreadCount)}` : ""}
                </Button>
              </div>
            </li>
          ))}
          {staffEvents.map((m) => (
            <li key={m.event.id} className="s-card" data-testid="staff-event">
              <strong>{m.event.title}</strong>
              <span className="o-t-meta s-muted">{formatWhen(m.event.startsAt, m.event.endsAt)}</span>
              <div className="s-row">
                <Button variant="secondary" icon="chat" href={`${base}?onglet=staff&ouvrir=${m.event.id}`}>
                  {communicationLabels.staffOpenChat}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
