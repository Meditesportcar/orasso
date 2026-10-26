import { Button, SelectField, TextField } from "@orasso/design-system/web";
import {
  CREW_DESCRIPTION_MAX,
  type CrewMemberView,
  type CrewView,
  crewErrors,
  crewLabels,
  departments,
  crewPageLabels as L,
  type UploadResult,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { CrewSecHead, MemberRow } from "../components/crew-page/CrewPage";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import { PhotoWithPlate, plateDecisionError } from "../components/PlateFrame";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { type CrewActionData, crewAction } from "../lib/crews.server";
import { plateFields } from "../lib/vehicle-add";
import type { Route } from "./+types/crew-reglages";

// Réglages du crew sur le site (lot R5c2, maquette R5.7 : la longue liste « Modifier le crew » quitte la page), comme
// l'appli : nom, description, département, Instagram ; logo ; bannière (même chaîne de plaque que les photos de
// véhicule) ; « Les membres peuvent proposer une sortie » ; retirer un membre ; dissoudre. Chef seulement. Mode B.
export const handle = ficheHandle;

export function meta() {
  return [{ title: `${L.settingsTitle} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireMe(request);
  const crew = await apiOrThrow<CrewView>(request, `/crews/by-slug/${encodeURIComponent(params.slug)}`);
  const leader = crew.viewerState === "leader" && !crew.archived;
  const members = leader ? await apiOrThrow<CrewMemberView[]>(request, `/crews/${crew.id}/members`) : [];
  return { crew, members, leader };
}

type ActionData = CrewActionData;

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const crewId = encodeURIComponent(String(form.get("crewId") ?? ""));
  const fail = (res: { error: { message: string }; status: number }) =>
    data<ActionData>({ crewError: res.error.message }, { status: res.status });
  if (intent === "crew_remove") return crewAction(request, form);
  if (intent === "crew_edit") {
    const res = await api<CrewView>(request, `/crews/${crewId}`, {
      method: "PATCH",
      json: {
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
        department: String(form.get("department") ?? ""),
        instagram: String(form.get("instagram") ?? "").trim() || null,
      },
    });
    if (!res.ok) return fail(res);
    if (res.data.slug !== params.slug) throw redirect(`/c/${res.data.slug}/reglages`);
    return data<ActionData>({ crewError: null, crewOk: L.saved });
  }
  if (intent === "crew_outings_right") {
    const res = await api(request, `/crews/${crewId}`, {
      method: "PATCH",
      json: { membersCanProposeOutings: form.get("value") === "yes" },
    });
    return res.ok ? data<ActionData>({ crewError: null, crewOk: L.saved }) : fail(res);
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
    if (!up.ok) return fail(up);
    const res = await api(request, `/crews/${crewId}/logo`, { method: "POST", json: { key: up.data.key } });
    return res.ok ? data<ActionData>({ crewError: null, crewOk: crewLabels.saved }) : fail(res);
  }
  if (intent === "crew_logo_remove") {
    const res = await api(request, `/crews/${crewId}/logo`, { method: "POST", json: { key: null } });
    return res.ok ? data<ActionData>({ crewError: null }) : fail(res);
  }
  if (intent === "crew_banner") {
    const photo = form.get("photo");
    if (!(photo instanceof File) || photo.size === 0) {
      return data<ActionData>({ crewError: "Choisis une image." }, { status: 400 });
    }
    // Comme une photo de véhicule : un cadre sur la plaque, ou « aucune plaque visible » confirmé.
    const issue = plateDecisionError(form);
    if (issue) return data<ActionData>({ crewError: issue }, { status: 400 });
    const upload = new FormData();
    upload.set("banner", photo);
    plateFields(form, upload);
    const res = await api(request, `/crews/${crewId}/banner`, { method: "POST", body: upload });
    return res.ok ? data<ActionData>({ crewError: null, crewOk: crewLabels.saved }) : fail(res);
  }
  if (intent === "crew_banner_remove") {
    const res = await api(request, `/crews/${crewId}/banner`, { method: "DELETE" });
    return res.ok ? data<ActionData>({ crewError: null }) : fail(res);
  }
  if (intent === "crew_archive") {
    const res = await api(request, `/crews/${crewId}`, { method: "DELETE" });
    if (!res.ok) return fail(res);
    throw redirect("/app/crews");
  }
  return data<ActionData>({ crewError: "Action inconnue." }, { status: 400 });
}

function Hidden({ crewId, intent, userId }: { crewId: string; intent: string; userId?: string }) {
  return (
    <>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="crewId" value={crewId} />
      {userId ? <input type="hidden" name="userId" value={userId} /> : null}
    </>
  );
}

export default function CrewSettings({ loaderData, actionData }: Route.ComponentProps) {
  const { crew, members, leader } = loaderData;
  const result = actionData as ActionData | undefined;
  const busy = useNavigation().state !== "idle";
  const back = `/c/${crew.slug}`;
  const confirm = (text: string) => (e: React.FormEvent<HTMLFormElement>) => {
    if (!window.confirm(text)) e.preventDefault();
  };
  if (!leader) {
    return (
      <>
        <FicheBar title={L.settingsTitle} back={back} />
        <div className="crw-narrow">
          <p className="s-error" role="alert">
            {crewErrors.leaderOnly}
          </p>
        </div>
      </>
    );
  }
  const canPropose = crew.space?.membersCanProposeOutings !== false;
  return (
    <>
      <FicheBar title={L.settingsTitle} back={back} />
      <div className="crw-narrow" data-testid="crew-settings-page">
        <p className="o-t-caption s-muted">{crew.name}</p>
        {result?.crewError ? (
          <p className="s-error" role="alert">
            {result.crewError}
          </p>
        ) : null}
        {result?.crewOk ? (
          <p className="s-notice s-notice--ok" role="status" data-testid="crew-settings-ok">
            {result.crewOk}
          </p>
        ) : null}

        <CrewSecHead title={L.identityTitle} />
        <Form method="post" className="s-form" data-testid="crew-edit-form">
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
          <TextField
            label={L.instagram}
            name="instagram"
            defaultValue={crew.instagram ? `@${crew.instagram}` : ""}
            placeholder={L.instagramPlaceholder}
            help={L.instagramHint}
            autoComplete="off"
            data-testid="crew-settings-instagram"
          />
          <Button type="submit" icon="check" loading={busy} data-testid="crew-settings-save">
            {crewLabels.save}
          </Button>
        </Form>

        <CrewSecHead title={L.imagesTitle} />
        <Form method="post" encType="multipart/form-data" className="s-row crw-row-end" data-testid="crew-logo-form">
          <Hidden crewId={crew.id} intent="crew_logo" />
          <label className="s-stack s-stack--tight">
            <span className="s-label o-t-label">{crewLabels.logo}</span>
            <input type="file" name="logo" accept="image/jpeg,image/png,image/webp,image/heic" required />
          </label>
          <Button type="submit" variant="secondary" icon="add" loading={busy}>
            {crewLabels.changeLogo}
          </Button>
        </Form>
        {crew.logoUrl ? (
          <Form method="post">
            <Hidden crewId={crew.id} intent="crew_logo_remove" />
            <Button type="submit" variant="secondary" icon="close" loading={busy}>
              {crewLabels.removeLogo}
            </Button>
          </Form>
        ) : null}
        <p className="o-t-caption s-muted">{L.bannerHint}</p>
        {crew.bannerHiddenOutside ? <p className="s-error">{L.bannerHidden}</p> : null}
        <Form method="post" encType="multipart/form-data" className="s-form" data-testid="crew-banner-form">
          <Hidden crewId={crew.id} intent="crew_banner" />
          <PhotoWithPlate label={L.banner} required testId="crew-banner-frame" />
          <Button type="submit" variant="secondary" icon="plate" loading={busy} data-testid="crew-banner-send">
            {L.bannerSend}
          </Button>
        </Form>
        {crew.bannerUrl ? (
          <Form method="post">
            <Hidden crewId={crew.id} intent="crew_banner_remove" />
            <Button type="submit" variant="secondary" icon="close" loading={busy}>
              {L.removeBanner}
            </Button>
          </Form>
        ) : null}

        <CrewSecHead title={L.tabOutings} />
        <Form method="post" className="s-form" data-testid="crew-outings-right">
          <Hidden crewId={crew.id} intent="crew_outings_right" />
          <span className="o-t-body-strong">{L.outingsRight}</span>
          <fieldset className="crw-seg" aria-label={L.outingsRight}>
            {(
              [
                ["yes", L.yes],
                ["no", L.no],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="submit"
                name="value"
                value={value}
                className="crw-seg__btn o-t-body-strong crw-seg__btn--ink"
                aria-pressed={canPropose === (value === "yes")}
                data-testid={`crew-outings-right-${value}`}
              >
                {label}
              </button>
            ))}
          </fieldset>
          <span className="o-t-caption s-muted">{L.outingsRightHint}</span>
        </Form>

        <CrewSecHead title={L.removeTitle} />
        {members.filter((m) => m.role !== "leader").length === 0 ? <p className="s-muted">{L.removeEmpty}</p> : null}
        <ul className="crw-list">
          {members
            .filter((m) => m.role !== "leader")
            .map((m) => (
              <MemberRow
                key={m.userId}
                pseudo={m.pseudo}
                avatarUrl={m.avatarUrl}
                caption={m.vehicleLabel ?? L.noVehicle}
                leader={false}
                back={`${back}/reglages`}
              >
                <Form method="post" onSubmit={confirm(crewLabels.removeConfirm(m.pseudo))}>
                  <Hidden crewId={crew.id} intent="crew_remove" userId={m.userId} />
                  <Button type="submit" variant="secondary" icon="close" loading={busy}>
                    {crewLabels.remove}
                  </Button>
                </Form>
              </MemberRow>
            ))}
        </ul>

        <CrewSecHead title={L.dangerTitle} />
        <Form method="post" onSubmit={confirm(crewLabels.archiveConfirm)}>
          <Hidden crewId={crew.id} intent="crew_archive" />
          <Button type="submit" variant="secondary" icon="trash" loading={busy} data-testid="crew-archive">
            {crewLabels.archive}
          </Button>
        </Form>
        <p className="o-t-caption s-muted">{crewLabels.leaderCannotLeave}</p>
      </div>
    </>
  );
}
