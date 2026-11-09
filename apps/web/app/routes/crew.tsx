import { Button, departmentChoices, Icon } from "@orasso/design-system/web";
import { type CrewView, crewInstagramUrl, crewLabels, crewPageLabels as L, widestWordEm } from "@orasso/shared";
import type { CSSProperties } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { CrewLogo } from "../components/Crews";
import {
  CrewRequestDialog,
  CrewSecHead,
  FriendsBox,
  Hidden,
  InfoBox,
  MemberRow,
  vitrineCaption,
} from "../components/crew-page/CrewPage";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import { ReportDialog } from "../components/ReportDialog";
import { apiOrThrow, requireMe } from "../lib/api.server";
import { type CrewActionData, crewAction, isCrewIntent } from "../lib/crews.server";
import type { Route } from "./+types/crew";

// Page d'un crew vue de l'extérieur : la vitrine (lot R7b2, D38). Lot 19 : fiche, membres, demandes, invitations. Lot M7 :
// mode B (en-tête de fiche). Lot R5c2 (décisions de Damien du 26/10), comme l'appli : un non-membre voit l'image du crew,
// sa description, l'Instagram, les amis membres et les membres, et « Demander à rejoindre » (la fenêtre avec un mot pour le
// chef). Lot R7b2 : un membre actif n'est plus ici, son crew vit dans l'onglet Crew (`/app/crew`, Fil · Sorties ·
// Membres · Spots, Discussion) : la page l'y renvoie (`?onglet=` suivi). Rien d'autre que la vitrine : ni fil, ni
// sorties, ni garage, ni discussion. Les réglages du chef ont leur page (`/c/:slug/reglages`), la sortie la sienne.
export const handle = ficheHandle;

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.crew.name ?? "Crew"} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const crew = await apiOrThrow<CrewView>(request, `/crews/by-slug/${encodeURIComponent(params.slug)}`);
  const member = crew.viewerState === "member" || crew.viewerState === "leader";
  if (member && !crew.archived) {
    const onglet = new URL(request.url).searchParams.get("onglet");
    throw redirect(
      `/app/crew?crew=${encodeURIComponent(crew.slug)}${onglet ? `&onglet=${encodeURIComponent(onglet)}` : ""}`,
    );
  }
  return { crew, userId: me.user.id };
}

type ActionData = CrewActionData;

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (isCrewIntent(intent)) return crewAction(request, form);
  return data<ActionData>({ crewError: "Action inconnue." }, { status: 400 });
}

export default function Crew({ loaderData, actionData }: Route.ComponentProps) {
  const { crew, userId } = loaderData;
  const result = actionData as ActionData | undefined;
  const busy = useNavigation().state !== "idle";
  const leader = crew.viewerState === "leader";
  const member = crew.viewerState === "member" || leader;
  const live = !crew.archived;
  const back = `/c/${crew.slug}`;
  const since = new Date(crew.createdAt).getFullYear();

  return (
    <>
      <FicheBar heading={false} title={crewLabels.crew} back="/app/crew" />
      <div className="crw-page" data-testid="crew" data-state={crew.viewerState}>
        <div className="crw-hero">
          {crew.bannerUrl ? <img src={crew.bannerUrl} alt={`Bannière de ${crew.name}`} /> : null}
        </div>
        <div className="crw-id">
          <span className="crw-id__ring">
            <CrewLogo url={crew.logoUrl} name={crew.name} size={84} />
          </span>
          <div className="crw-id__text s-fit">
            <h1
              className="s-title s-title--fit o-never-truncate"
              style={{ "--em": widestWordEm(crew.name) } as CSSProperties}
            >
              {crew.name}
            </h1>
            <span className="o-t-caption s-muted">
              {L.idLine(
                departmentChoices.find((d) => d.code === crew.department)?.name ?? crew.department,
                crew.membersCount,
                since,
              )}
            </span>
          </div>
        </div>
        {crew.description ? (
          <p className="crw-bio s-prewrap" data-testid="crew-description">
            {crew.description}
          </p>
        ) : null}
        {leader || crew.instagram ? (
          <div className="crw-chips">
            {leader ? <span className="crw-tag crw-tag--acc">{L.youLead}</span> : null}
            {crew.instagram ? (
              <a
                className="crw-sc"
                href={crewInstagramUrl(crew.instagram)}
                rel="noopener noreferrer"
                target="_blank"
                aria-label={L.instagramA11y(crew.instagram)}
                data-testid="crew-instagram"
              >
                <Icon name="instagram" size={16} />
                {crew.instagram}
              </a>
            ) : null}
          </div>
        ) : null}

        {crew.archived && <p className="s-notice">{L.archived}</p>}
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

        {/* Crew dissous : la discussion reste lisible pour ses anciens membres. */}
        {member && crew.conversationId ? (
          <div className="crw-acts">
            <span className="crw-acts__main">
              <Button
                variant="secondary"
                icon="chat"
                href={`/app/messages/${crew.conversationId}`}
                aria-label={L.discussionA11y(0)}
                data-testid="crew-discussion"
              >
                {L.discussion}
              </Button>
            </span>
          </div>
        ) : null}

        <section className="crw-vitrine" data-testid="crew-vitrine">
          <FriendsBox friends={crew.members.filter((m) => m.friend)} />
          <CrewSecHead title={L.membersTitle} hint={String(crew.membersCount)} />
          <ul className="crw-list">
            {crew.members.map((m) => (
              <MemberRow
                key={m.pseudo}
                pseudo={m.pseudo}
                avatarUrl={m.avatarUrl}
                caption={vitrineCaption(m)}
                leader={m.role === "leader"}
                back={back}
              />
            ))}
          </ul>
          <InfoBox
            icon="lock"
            title={L.membersOnly}
            caption={L.leaderAccepts(crew.leader?.pseudo ?? null)}
            testId="crew-members-only"
          />
          {live && crew.viewerState === "none" ? (
            <CrewRequestDialog
              crew={crew}
              leaderPseudo={crew.leader?.pseudo ?? null}
              wide
              primary
              testId="crew-request"
            />
          ) : null}
          {crew.viewerState === "requested" ? (
            <>
              <InfoBox
                icon="check"
                accent
                title={L.requestSentTo(crew.leader?.pseudo ?? null)}
                caption={L.requestSentHint}
                testId="crew-request-sent"
              />
              <Form method="post">
                <Hidden crewId={crew.id} userId={userId} intent="crew_request_cancel" />
                <Button
                  type="submit"
                  variant="secondary"
                  icon="close"
                  loading={busy}
                  fullWidth
                  data-testid="crew-request-cancel"
                >
                  {L.cancelRequest}
                </Button>
              </Form>
            </>
          ) : null}
          {crew.viewerState === "invited" && live ? (
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
          ) : null}
        </section>

        {!leader && live ? <ReportDialog look="link" targetType="crew" targetId={crew.id} /> : null}
      </div>
    </>
  );
}
