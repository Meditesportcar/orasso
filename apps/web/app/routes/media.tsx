// Casquette Média sur le site (lot 57, parité de l'appli du lot 55, prototype DA v2 `s-agenda`, `s-accred`,
// `s-contenus`) : mes accréditations (badge presse, consignes, refus avec la raison, couverture), la recherche dans
// toute la France avec « Accréditation ouverte » et la demande, mes contenus (lien ou galerie, floutage des plaques
// proposé à l'envoi : D28) et mon agenda, semaine par semaine. Pas de numéro de carte de presse (D26).
import { Button, CheckboxField, Chip, ChipRow, Plate, SelectField, TextField } from "@orasso/design-system/web";
import {
  type AccessPass,
  type EventCard,
  eventFormatLabels,
  mediaAppLabels as L,
  type MediaAccreditationView,
  type MediaAgenda,
  type MediaContentView,
  type MediaProfileView,
  mediaFormatLabels,
  mediaFormats,
  mediaLabels,
  mediaPlatformLabels,
  mediaPlatforms,
  type Page,
  regions,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { TextAreaField } from "../components/Fields";
import { MediaGalleryPicker } from "../components/MediaGalleryPicker";
import { Qr } from "../components/Qr";
import { RotatingQr } from "../components/RotatingQr";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { formatDay, formatWhen } from "../lib/format";
import "../styles/garage.css";
import "../styles/media.css";
import type { Route } from "./+types/media";

export function meta() {
  return [{ title: "Média · Orasso" }, { name: "robots", content: "noindex" }];
}

const TABS = [
  { id: "presse", label: L.pressTitle },
  { id: "explorer", label: L.explorerTitle },
  { id: "contenus", label: L.contentsTitle },
  { id: "agenda", label: L.segAgenda },
] as const;
type Tab = (typeof TABS)[number]["id"];

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const { profile } = await apiOrThrow<{ profile: MediaProfileView | null }>(request, "/me/media-profile");
  if (!profile) throw redirect("/app/media/nouveau");
  const url = new URL(request.url);
  const asked = url.searchParams.get("onglet");
  const tab: Tab = TABS.some((t) => t.id === asked) ? (asked as Tab) : "presse";
  const out = {
    tab,
    profile,
    serverTime: new Date().toISOString(),
    upcoming: [] as MediaAccreditationView[],
    past: [] as MediaAccreditationView[],
    passes: {} as Record<string, AccessPass>,
    events: [] as EventCard[],
    filters: { region: "", q: "", open: true },
    contents: [] as MediaContentView[],
    accredited: [] as { id: string; title: string }[],
    agenda: null as MediaAgenda | null,
    sent: url.searchParams.get("fait"),
  };
  if (tab === "presse") {
    const [upcoming, past] = await Promise.all([
      apiOrThrow<MediaAccreditationView[]>(request, "/me/accreditations?scope=upcoming"),
      apiOrThrow<MediaAccreditationView[]>(request, "/me/accreditations?scope=past"),
    ]);
    out.upcoming = upcoming;
    out.past = past;
    await Promise.all(
      upcoming
        .filter((a) => a.status === "accepted" && a.pass?.valid)
        .map(async (a) => {
          const res = await api<AccessPass>(request, `/applications/${a.id}/pass`);
          if (res.ok && res.data.payload) out.passes[a.id] = res.data;
        }),
    );
  } else if (tab === "explorer") {
    const region = url.searchParams.get("region") ?? "";
    const q = url.searchParams.get("q")?.trim() ?? "";
    // « Accréditation ouverte » cochée par défaut ; décochée seulement par le formulaire (qui envoie toujours `q`).
    const open = url.searchParams.has("q") ? url.searchParams.get("ouverte") === "1" : true;
    const params = new URLSearchParams({ limit: "30" });
    if (open) params.set("accreditationOpen", "1");
    if (regions.some((r) => r.code === region)) params.set("region", region);
    if (q) params.set("q", q);
    const res = await api<Page<EventCard>>(request, `/events?${params}`);
    out.events = res.ok ? res.data.items : [];
    out.filters = { region, q, open };
  } else if (tab === "contenus") {
    const [contents, all] = await Promise.all([
      apiOrThrow<MediaContentView[]>(request, "/me/media-contents"),
      apiOrThrow<MediaAccreditationView[]>(request, "/me/accreditations?scope=all"),
    ]);
    out.contents = contents;
    out.accredited = all.filter((a) => a.status === "accepted").map((a) => ({ id: a.event.id, title: a.event.title }));
  } else {
    out.agenda = await apiOrThrow<MediaAgenda>(request, "/me/media/agenda");
  }
  return out;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function action({ request }: Route.ActionArgs) {
  await requireMe(request);
  const form = await request.formData();
  const intent = text(form, "intent");
  const back = (tab: Tab, done: string) => redirect(`/app/media?onglet=${tab}&fait=${done}`);
  const fail = (res: { status: number; error: { message: string } }) =>
    data({ error: res.error.message }, { status: res.status });

  if (intent === "request") {
    const formats = form.getAll("formats").map(String);
    const res = await api(request, `/events/${encodeURIComponent(text(form, "eventId"))}/accreditations`, {
      method: "POST",
      json: { formats, message: text(form, "message") || null },
    });
    return res.ok ? back("presse", "demande") : fail(res);
  }
  if (intent === "withdraw") {
    const res = await api(request, `/applications/${encodeURIComponent(text(form, "applicationId"))}/withdraw`, {
      method: "POST",
      json: {},
    });
    return res.ok ? back("presse", "retiree") : fail(res);
  }
  if (intent === "save" || intent === "unsave") {
    const res = await api(request, `/me/media/saved/${encodeURIComponent(text(form, "eventId"))}`, {
      method: intent === "save" ? "POST" : "DELETE",
    });
    return res.ok ? data({ error: null }) : fail(res);
  }
  if (intent === "content") {
    const kind = text(form, "kind") === "gallery" ? "gallery" : "link";
    let photoKeys: string[] = [];
    try {
      photoKeys = kind === "gallery" ? (JSON.parse(text(form, "photoKeys") || "[]") as string[]) : [];
    } catch {
      photoKeys = [];
    }
    const res = await api(request, "/me/media-contents", {
      method: "POST",
      json: {
        eventId: text(form, "eventId"),
        kind,
        title: text(form, "title"),
        url: kind === "link" ? text(form, "url") : null,
        platform: kind === "link" ? text(form, "platform") || "other" : "other",
        photoKeys,
      },
    });
    return res.ok ? back("contenus", "contenu") : fail(res);
  }
  if (intent === "content-delete") {
    const res = await api(request, `/me/media-contents/${encodeURIComponent(text(form, "contentId"))}`, {
      method: "DELETE",
    });
    return res.ok ? back("contenus", "supprime") : fail(res);
  }
  return data({ error: "Action inconnue." }, { status: 400 });
}

const DONE: Record<string, string> = {
  demande: L.requestSentText,
  retiree: L.withdrawn,
  contenu: "Contenu publié : il s'affiche sur la page de l'événement.",
  supprime: "Contenu supprimé.",
  profil: L.profileSaved,
};

function AccreditationCard({
  a,
  pass,
  serverTime,
  busy,
  past = false,
}: {
  a: MediaAccreditationView;
  pass?: AccessPass;
  serverTime: string;
  busy: boolean;
  /** Accréditation passée : plus de badge à montrer. */
  past?: boolean;
}) {
  const formats = a.formats.map((f) => mediaFormatLabels[f]).join(" · ");
  const state =
    a.status === "accepted"
      ? mediaLabels.accredited
      : a.status === "refused"
        ? mediaLabels.refused
        : mediaLabels.pending;
  return (
    <article className="s-card s-stack s-stack--tight" data-testid="media-accreditation" data-status={a.status}>
      <div className="s-row s-row--between">
        <div className="s-stack s-stack--tight">
          <div className="o-t-label s-label">{eventFormatLabels[a.event.format]}</div>
          <h3 className="s-h2 o-never-truncate">
            <a href={`/e/${a.event.slug}`}>{a.event.title}</a>
          </h3>
          <div className="o-t-meta s-muted">
            {formatWhen(a.event.startsAt, a.event.endsAt)}
            {a.event.city ? ` · ${a.event.city}` : ""} · {a.event.structureName}
          </div>
        </div>
        <Chip variant={a.status === "accepted" ? "accent" : "default"}>{state}</Chip>
      </div>
      <p className="o-t-caption">{L.requestedOn(formatDay(a.createdAt), formats)}</p>
      {a.status === "refused" && (
        <p className="s-notice" data-testid="media-refusal">
          {a.refusalNote ?? L.refusedDefault}
        </p>
      )}
      {a.status === "accepted" && (
        <>
          {pass?.payload ? (
            <div className="acc__qr" data-testid="media-badge">
              <div className="o-t-label">{a.briefing?.zones ? L.badgeZones(a.briefing.zones) : L.badgeOf}</div>
              {pass.otpSecret ? (
                <RotatingQr
                  secret={pass.otpSecret}
                  eventNo={pass.eventNo}
                  passId={pass.passId}
                  serverTime={serverTime}
                  label={`${L.badgeOf} : ${a.event.title}`}
                />
              ) : (
                <Qr payload={pass.payload} label={`${L.badgeOf} : ${a.event.title}`} />
              )}
            </div>
          ) : past ? null : (
            <p className="o-t-caption s-muted">{L.badgeNotYet}</p>
          )}
          <section className="s-stack s-stack--tight" aria-label={L.briefingTitle} data-testid="media-briefing">
            <div className="o-t-label">{L.briefingTitle}</div>
            {a.briefing && (a.briefing.zones || a.briefing.instructions || a.briefing.contact) ? (
              <dl className="md-brief">
                {a.briefing.zones && (
                  <>
                    <dt>{L.briefingZones}</dt>
                    <dd>{a.briefing.zones}</dd>
                  </>
                )}
                {a.briefing.instructions && (
                  <>
                    <dt>{L.briefingInstructions}</dt>
                    <dd className="s-prewrap">{a.briefing.instructions}</dd>
                  </>
                )}
                {a.briefing.contact && (
                  <>
                    <dt>{L.briefingContact}</dt>
                    <dd>{a.briefing.contact}</dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="o-t-caption s-muted">{L.briefingNone}</p>
            )}
          </section>
        </>
      )}
      {(a.coverage.contents > 0 || a.status === "accepted") && (
        <p className="o-t-caption" data-testid="media-coverage">
          {a.coverage.contents > 0
            ? `${L.covered(a.coverage.contents)} · ${L.coveredViews(a.coverage.views)}`
            : L.notCovered}
        </p>
      )}
      {a.canWithdraw && (
        <Form
          method="post"
          onSubmit={(e) => {
            if (!window.confirm(`${L.withdrawConfirm} ${L.withdrawText}`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="intent" value="withdraw" />
          <input type="hidden" name="applicationId" value={a.id} />
          <Button type="submit" variant="secondary" icon="undo" loading={busy}>
            {L.withdraw}
          </Button>
        </Form>
      )}
    </article>
  );
}

function RequestForm({ event, busy }: { event: EventCard; busy: boolean }) {
  return (
    <details className="md-request" data-testid="media-request">
      <summary className="o-t-label">{L.request}</summary>
      <Form method="post" className="s-form">
        <input type="hidden" name="intent" value="request" />
        <input type="hidden" name="eventId" value={event.id} />
        <p className="o-t-caption">{L.requestFor(event.title)}</p>
        <fieldset className="s-stack s-stack--tight">
          <legend className="o-t-label">{L.requestFormats}</legend>
          {mediaFormats.map((f) => (
            <CheckboxField key={f} name="formats" value={f} label={mediaFormatLabels[f]} />
          ))}
        </fieldset>
        <TextAreaField label={L.requestMessage} help={L.requestMessageHelp} name="message" rows={2} maxLength={500} />
        <p className="o-t-caption s-muted">{L.requestRulesNote}</p>
        <div>
          <Button type="submit" variant="secondary" icon="send" loading={busy}>
            {L.requestSend}
          </Button>
        </div>
      </Form>
    </details>
  );
}

export default function Media({ loaderData, actionData }: Route.ComponentProps) {
  const d = loaderData;
  const busy = useNavigation().state !== "idle";
  const error = actionData && "error" in actionData ? actionData.error : null;
  const p = d.profile;
  return (
    <div className="s-stack" data-testid="media-space" data-tab={d.tab}>
      <div className="s-row s-row--between md-head">
        <div className="s-row">
          {p.logoUrl && <img className="md-logo" src={p.logoUrl} alt="" />}
          <div className="s-stack s-stack--tight">
            <div className="o-t-label s-label">Casquette Média</div>
            <h1 className="s-title o-never-truncate" data-testid="media-name">
              {p.name}
            </h1>
            <ChipRow className="s-chips-wrap">
              <Chip variant={p.verifiedAt ? "verified" : "default"} data-testid="media-verified">
                {p.verifiedAt ? L.profileVerified : L.profileToVerify}
              </Chip>
              {p.formats.map((f) => (
                <Chip key={f}>{mediaFormatLabels[f]}</Chip>
              ))}
            </ChipRow>
          </div>
        </div>
        <div className="s-row">
          <Button variant="secondary" icon="profile" href="/app/media/nouveau">
            {L.casquetteEdit}
          </Button>
          <Button variant="secondary" icon="eye" href={`/m/${p.id}`}>
            Ma fiche
          </Button>
        </div>
      </div>
      {p.issue && <p className="s-notice">{p.issue}</p>}

      <nav className="s-tabs md-tabs" aria-label="Média">
        {TABS.map((t) => (
          <a key={t.id} href={`/app/media?onglet=${t.id}`} aria-current={d.tab === t.id ? "page" : undefined}>
            <Chip selected={d.tab === t.id}>{t.label}</Chip>
          </a>
        ))}
      </nav>

      {d.sent && DONE[d.sent] && (
        <p className="s-notice s-notice--ok" role="status" data-testid="media-done">
          {DONE[d.sent]}
        </p>
      )}
      {error && (
        <p className="s-error" role="alert" data-testid="media-error">
          {error}
        </p>
      )}

      {d.tab === "presse" && (
        <>
          <section className="s-stack" aria-labelledby="md-upcoming">
            <h2 id="md-upcoming" className="s-h2">
              {L.upcoming(d.upcoming.length)}
            </h2>
            {d.upcoming.length === 0 ? (
              <Plate className="s-stack s-stack--tight">
                <strong>{L.pressEmpty}</strong>
                <p>{L.pressEmptyText}</p>
                <div>
                  <Button icon="search" href="/app/media?onglet=explorer">
                    {L.pressSeeExplorer}
                  </Button>
                </div>
              </Plate>
            ) : (
              d.upcoming.map((a) => (
                <AccreditationCard key={a.id} a={a} pass={d.passes[a.id]} serverTime={d.serverTime} busy={busy} />
              ))
            )}
          </section>
          <section className="s-stack" aria-labelledby="md-past">
            <h2 id="md-past" className="s-h2">
              {L.past(d.past.length)}
            </h2>
            {d.past.length === 0 ? (
              <p className="s-muted">{L.pressPastEmptyText}</p>
            ) : (
              d.past.map((a) => <AccreditationCard key={a.id} a={a} serverTime={d.serverTime} busy={busy} past />)
            )}
          </section>
        </>
      )}

      {d.tab === "explorer" && (
        <section className="s-stack" aria-label={L.explorerTitle}>
          <Form method="get" className="s-card md-filters" role="search">
            <input type="hidden" name="onglet" value="explorer" />
            <TextField label={L.searchLabel} name="q" defaultValue={d.filters.q} placeholder={L.searchPlaceholder} />
            <SelectField
              label={L.where}
              name="region"
              defaultValue={d.filters.region}
              options={[{ value: "", label: L.allFrance }, ...regions.map((r) => ({ value: r.code, label: r.name }))]}
            />
            <CheckboxField name="ouverte" value="1" defaultChecked={d.filters.open} label={L.openOnly} />
            <div>
              <Button type="submit" icon="search">
                {L.segSearch}
              </Button>
            </div>
          </Form>
          <p className="o-t-caption s-muted">{L.results(d.events.length, false, d.filters.open)}</p>
          {d.events.length === 0 ? (
            <Plate className="s-stack s-stack--tight">
              <strong>{L.emptyTitle}</strong>
              <p>{L.emptyText}</p>
            </Plate>
          ) : (
            d.events.map((e) => {
              const acc = e.accreditation;
              return (
                <article key={e.id} className="s-card s-stack s-stack--tight" data-testid="media-event">
                  <div className="s-row s-row--between">
                    <div className="s-stack s-stack--tight">
                      <div className="o-t-label s-label">{eventFormatLabels[e.format]}</div>
                      <h3 className="s-h2 o-never-truncate">
                        <a href={`/e/${e.slug}`}>{e.title}</a>
                      </h3>
                      <div className="o-t-meta s-muted">
                        {formatWhen(e.startsAt, e.endsAt)}
                        {e.city ? ` · ${e.city}` : ""}
                        {e.department ? ` (${e.department})` : ""} · {e.structure.name}
                        {e.travelMinutes ? ` · ${mediaLabels.travelTime(e.travelMinutes)}` : ""}
                      </div>
                    </div>
                    <Chip variant={acc?.mine === "accepted" ? "accent" : "default"}>
                      {acc?.mine === "accepted"
                        ? mediaLabels.accredited
                        : acc?.mine === "refused"
                          ? mediaLabels.refused
                          : acc?.mine
                            ? mediaLabels.pending
                            : acc?.open
                              ? mediaLabels.accreditationOpen
                              : L.closed}
                    </Chip>
                  </div>
                  <div className="s-row">
                    <Form method="post">
                      <input type="hidden" name="intent" value="save" />
                      <input type="hidden" name="eventId" value={e.id} />
                      <Button type="submit" variant="secondary" icon="heart" aria-label={L.keepA11y(e.title)}>
                        {L.keep}
                      </Button>
                    </Form>
                  </div>
                  {acc?.open && (!acc.mine || acc.mine === "withdrawn" || acc.mine === "refused") && (
                    <RequestForm event={e} busy={busy} />
                  )}
                </article>
              );
            })
          )}
        </section>
      )}

      {d.tab === "contenus" && (
        <>
          <section className="s-stack" aria-labelledby="md-add">
            <h2 id="md-add" className="s-h2">
              {L.addTitle}
            </h2>
            {d.accredited.length === 0 ? (
              <p className="s-notice">{L.needAccreditation}</p>
            ) : (
              <Form key={d.contents.length} method="post" className="s-card s-form" data-testid="media-content-form">
                <input type="hidden" name="intent" value="content" />
                <SelectField
                  label={L.addEvent}
                  name="eventId"
                  options={d.accredited.map((e) => ({ value: e.id, label: e.title }))}
                />
                <TextField label={L.addTitleField} help={L.addTitleHelp} name="title" required maxLength={80} />
                <fieldset className="s-stack s-stack--tight">
                  <legend className="o-t-label">{L.addKind}</legend>
                  <label className="o-check">
                    <input type="radio" name="kind" value="link" defaultChecked className="md-radio" />{" "}
                    {L.kindOf({ kind: "link", platform: "other" })}
                  </label>
                  <label className="o-check">
                    <input type="radio" name="kind" value="gallery" className="md-radio" /> Galerie
                  </label>
                </fieldset>
                <div className="md-kind md-kind--link s-stack s-stack--tight">
                  <TextField label={L.addUrl} help={L.addUrlHelp} name="url" type="url" />
                  <SelectField
                    label={L.addPlatform}
                    name="platform"
                    options={mediaPlatforms.map((x) => ({ value: x, label: mediaPlatformLabels[x] }))}
                  />
                </div>
                <div className="md-kind md-kind--gallery">
                  <MediaGalleryPicker />
                </div>
                <div>
                  <Button type="submit" icon="send" loading={busy}>
                    {L.addPublish}
                  </Button>
                </div>
              </Form>
            )}
          </section>
          <section className="s-stack" aria-labelledby="md-contents">
            <h2 id="md-contents" className="s-h2">
              {L.contents} · {d.contents.length}
            </h2>
            <p className="o-t-caption s-muted" data-testid="media-views">
              {L.views} · {d.contents.reduce((s, c) => s + c.views, 0).toLocaleString("fr-FR")}
            </p>
            {d.contents.length === 0 ? (
              <Plate className="s-stack s-stack--tight">
                <strong>{L.noContents}</strong>
                <p>{L.noContentsText}</p>
              </Plate>
            ) : (
              d.contents.map((c) => (
                <article key={c.id} className="s-card s-stack s-stack--tight" data-testid="media-content">
                  <div className="s-row s-row--between">
                    <div className="s-stack s-stack--tight">
                      <div className="o-t-label s-label">
                        {L.kindOf(c)} · {c.event.title}
                      </div>
                      <h3 className="s-h2 o-never-truncate">
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noreferrer">
                            {c.title}
                          </a>
                        ) : (
                          c.title
                        )}
                      </h3>
                      <div className="o-t-caption s-muted">
                        {c.kind === "gallery" ? `${L.galleryStats(c.photos.length)} · ` : ""}
                        {L.viewsCount(c.views)}
                      </div>
                    </div>
                    {c.featured && <Chip variant="accent">{L.featured}</Chip>}
                  </div>
                  {c.photos.length > 0 && (
                    <ul className="md-thumbs">
                      {c.photos.slice(0, 6).map((ph) => (
                        <li key={ph.key}>
                          <img src={ph.url} alt="" />
                        </li>
                      ))}
                    </ul>
                  )}
                  <Form
                    method="post"
                    onSubmit={(e) => {
                      if (!window.confirm(`${L.deleteConfirm} ${L.deleteText}`)) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="intent" value="content-delete" />
                    <input type="hidden" name="contentId" value={c.id} />
                    <Button type="submit" variant="secondary" icon="close" loading={busy}>
                      {L.deleteContent}
                    </Button>
                  </Form>
                </article>
              ))
            )}
          </section>
        </>
      )}

      {d.tab === "agenda" && d.agenda && (
        <section className="s-stack" aria-label={L.segAgenda} data-testid="media-agenda">
          <p className="s-muted">{L.agendaIntro}</p>
          {d.agenda.weeks.length === 0 ? (
            <Plate className="s-stack s-stack--tight">
              <strong>{L.agendaEmpty}</strong>
              <p>{L.agendaEmptyText}</p>
            </Plate>
          ) : (
            d.agenda.weeks.map((w) => (
              <section key={w.weekStart} className="s-stack s-stack--tight" aria-label={`Semaine du ${w.weekStart}`}>
                <h2 className="s-h2">Semaine du {formatDay(`${w.weekStart}T12:00:00Z`)}</h2>
                {w.items.map((it) => (
                  <div key={it.event.id} className="s-card s-row s-row--between" data-testid="media-agenda-item">
                    <div className="s-stack s-stack--tight">
                      <a href={`/e/${it.event.slug}`} className="o-never-truncate">
                        <strong>{it.event.title}</strong>
                      </a>
                      <span className="o-t-caption s-muted">
                        {formatWhen(it.event.startsAt, it.event.endsAt)}
                        {it.event.city ? ` · ${it.event.city}` : ""}
                      </span>
                    </div>
                    <Chip variant={it.accreditation?.status === "accepted" ? "accent" : "default"}>
                      {it.accreditation
                        ? it.accreditation.status === "accepted"
                          ? mediaLabels.accredited
                          : it.accreditation.status === "refused"
                            ? mediaLabels.refused
                            : mediaLabels.pending
                        : it.accreditationOpen
                          ? L.keptOpen
                          : L.keptOnly}
                    </Chip>
                  </div>
                ))}
              </section>
            ))
          )}
        </section>
      )}
    </div>
  );
}
