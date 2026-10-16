import { Button, Chip, Plate, SelectField, TextField } from "@orasso/design-system/web";
import {
  type Category,
  departments,
  gradeLabels,
  grades,
  hasPeopleSearchCriteria,
  type PeopleSearchPage,
  socialLabels,
} from "@orasso/shared";
import { Form, useNavigation } from "react-router";

import { FriendAction, PersonRow } from "../components/People";
import { api, apiOrThrow } from "../lib/api.server";
import { friendAction } from "../lib/friends.server";
import type { Route } from "./+types/app-explorer";

// Explorer (lot 17 : segment « Personnes et crews » ; la carte, les affinités et la recherche de premier niveau
// viennent au lot 29, les crews au lot 19).
export function meta() {
  return [{ title: "Explorer · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const segment = url.searchParams.get("segment") === "personnes" ? "personnes" : "evenements";
  const filters = {
    q: url.searchParams.get("q")?.trim() ?? "",
    department: url.searchParams.get("departement") ?? "",
    categoryId: url.searchParams.get("interet") ?? "",
    grade: url.searchParams.get("grade") ?? "",
  };
  if (segment !== "personnes") return { segment, filters, people: null, categories: [] as Category[], failed: null };
  const categories = await apiOrThrow<Category[]>(request, "/vehicle-reference/categories");
  const criteria = {
    q: filters.q,
    department: filters.department,
    categoryId: filters.categoryId,
    grade: filters.grade,
  };
  if (!hasPeopleSearchCriteria(criteria)) return { segment, filters, people: null, categories, failed: null };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(criteria)) if (value) params.set(key, value);
  const cursor = url.searchParams.get("suite");
  if (cursor) params.set("cursor", cursor);
  const res = await api<PeopleSearchPage>(request, `/users/search?${params}`);
  return { segment, filters, people: res.ok ? res.data : null, categories, failed: res.ok ? null : res.error.message };
}

export async function action({ request }: Route.ActionArgs) {
  return friendAction(request, await request.formData());
}

export default function Explorer({ loaderData, actionData }: Route.ComponentProps) {
  const { segment, filters, people, categories, failed } = loaderData;
  const busy = useNavigation().state !== "idle";
  const segments = [
    { id: "evenements", label: socialLabels.segmentEvents, href: "/app/explorer" },
    { id: "personnes", label: socialLabels.segmentPeople, href: "/app/explorer?segment=personnes" },
  ];
  return (
    <div className="s-stack" data-testid="explorer">
      <h1 className="s-title">Explorer</h1>
      <nav className="s-row" aria-label="Segments d'Explorer">
        {segments.map((s) => (
          <a
            key={s.id}
            href={s.href}
            aria-current={segment === s.id ? "page" : undefined}
            data-testid={`segment-${s.id}`}
          >
            <Chip selected={segment === s.id}>{s.label}</Chip>
          </a>
        ))}
      </nav>

      {segment === "evenements" ? (
        <div className="s-stack">
          <p className="s-lead">Les rassemblements, expositions et cars & coffee à venir.</p>
          <Button variant="primary" icon="calendar" href="/evenements">
            Voir les événements
          </Button>
        </div>
      ) : (
        <div className="s-stack" data-testid="people-search">
          <Plate as="section" aria-label={socialLabels.searchPeople}>
            <Form method="get" className="s-filters">
              <input type="hidden" name="segment" value="personnes" />
              <TextField
                label={socialLabels.searchPeople}
                name="q"
                defaultValue={filters.q}
                placeholder={socialLabels.searchPeoplePlaceholder}
              />
              <SelectField
                label={socialLabels.filterDepartment}
                name="departement"
                defaultValue={filters.department}
                options={[{ value: "", label: "Tous" }, ...departments.map((d) => ({ value: d, label: d }))]}
              />
              <SelectField
                label={socialLabels.filterInterest}
                name="interet"
                defaultValue={filters.categoryId}
                options={[{ value: "", label: "Tous" }, ...categories.map((c) => ({ value: c.id, label: c.label }))]}
              />
              <SelectField
                label={socialLabels.filterGrade}
                name="grade"
                defaultValue={filters.grade}
                options={[
                  { value: "", label: socialLabels.filterAnyGrade },
                  ...grades.map((g) => ({ value: g, label: gradeLabels[g] })),
                ]}
              />
              <Button type="submit" variant="primary" icon="search">
                Rechercher
              </Button>
            </Form>
          </Plate>

          {actionData?.friendError && (
            <p className="s-error" role="alert">
              {actionData.friendError}
            </p>
          )}
          {failed && (
            <p className="s-error" role="alert">
              {failed}
            </p>
          )}
          {!people && !failed && <p className="s-notice">{socialLabels.searchPeopleIdle}</p>}
          {people && people.items.length === 0 && <p className="s-notice">{socialLabels.searchPeopleEmpty}</p>}
          {people && people.items.length > 0 && (
            <ul className="s-people" data-testid="people-results">
              {people.items.map((person) => (
                <PersonRow
                  key={person.userId}
                  person={person}
                  action={
                    <FriendAction
                      state={person.friendship}
                      pseudo={person.pseudo}
                      userId={person.userId}
                      requestId={person.friendshipId}
                      source="search"
                      busy={busy}
                    />
                  }
                />
              ))}
            </ul>
          )}
          {people?.nextCursor && (
            <Button
              variant="secondary"
              icon="next"
              href={`/app/explorer?${new URLSearchParams({
                segment: "personnes",
                ...(filters.q ? { q: filters.q } : {}),
                ...(filters.department ? { departement: filters.department } : {}),
                ...(filters.categoryId ? { interet: filters.categoryId } : {}),
                ...(filters.grade ? { grade: filters.grade } : {}),
                suite: people.nextCursor,
              })}`}
            >
              Suite
            </Button>
          )}
          <p className="o-t-caption s-muted">{socialLabels.crewsSoon}</p>
        </div>
      )}
    </div>
  );
}
