// Contrôle des billets des visiteurs à l'entrée (lot 14). Le contenu du rôle « boutique » n'est pas confirmé par
// Damien : le contrôle est ouvert au staff d'accueil (rôle « scan ») et à l'organisation. Un lecteur de QR en clavier
// (Bluetooth / USB) ou l'appareil photo du navigateur (quand il sait lire les QR) remplit le champ.
import { Button, Counters, Plate, ScanResult, TextField } from "@orasso/design-system/web";
import type { TicketCheckResult, TicketHolders } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { data, useFetcher, useRevalidator } from "react-router";

import { api, apiOrThrow } from "../lib/api.server";
import { formatTime } from "../lib/format";
import type { Route } from "./+types/orga-billets";

export function meta() {
  return [{ title: "Contrôle des billets · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  return { tickets: await apiOrThrow<TicketHolders>(request, `/events/${params.eventId}/tickets`) };
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const payload = String(form.get("payload") ?? "").trim();
  if (!payload) return data({ error: "Aucun QR lu." }, { status: 400 });
  const res = await api<TicketCheckResult>(request, `/events/${params.eventId}/tickets/check`, {
    method: "POST",
    json: { payload },
  });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  return data({ check: res.data });
}

const REFUSALS: Record<string, string> = {
  malformed: "Ce n'est pas un QR de billet Orasso",
  forged: "QR falsifié",
  other_event: "Billet d'un autre événement",
  cancelled: "Billet rendu",
  unknown: "Billet inconnu",
};

/** Lecture par l'appareil photo, si le navigateur sait lire les QR (BarcodeDetector) : sinon le champ suffit. */
function CameraReader({ onRead }: { onRead: (value: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;
  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let last = "";
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        // biome-ignore lint/suspicious/noExplicitAny: BarcodeDetector n'est pas encore dans les types DOM
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        timer = setInterval(async () => {
          if (!video.current) return;
          const codes = await detector.detect(video.current).catch(() => []);
          const value = codes[0]?.rawValue as string | undefined;
          if (value && value !== last) {
            last = value;
            onRead(value);
          }
        }, 400);
      } catch {
        setOn(false);
      }
    })();
    return () => {
      if (timer) clearInterval(timer);
      for (const t of stream?.getTracks() ?? []) t.stop();
    };
  }, [on, onRead]);
  if (!supported) return null;
  return (
    <div className="s-stack s-stack--tight">
      <Button variant="secondary" icon="qr" onClick={() => setOn((v) => !v)}>
        {on ? "Arrêter la caméra" : "Lire avec la caméra"}
      </Button>
      {on && <video ref={video} className="s-camera" playsInline muted aria-label="Caméra" />}
    </div>
  );
}

export default function OrgaBillets({ loaderData }: Route.ComponentProps) {
  const { tickets } = loaderData;
  const fetcher = useFetcher<{ check?: TicketCheckResult; error?: string }>();
  const revalidator = useRevalidator();
  const check = fetcher.data?.check;
  const busy = fetcher.state !== "idle";

  // Une fois la lecture traitée : la liste et les compteurs se mettent à jour, le champ se vide et reprend le focus.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      revalidator.revalidate();
      const field = document.getElementById("ticket-payload") as HTMLInputElement | null;
      if (field) {
        field.value = "";
        field.focus();
      }
    }
  }, [fetcher.state, fetcher.data, revalidator.revalidate]);

  const submit = (payload: string) => fetcher.submit({ payload }, { method: "post" });

  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Contrôle des billets</div>
          <h1 className="s-title">{tickets.event.title}</h1>
        </div>
      </div>

      <Counters
        variant="surface"
        size="site"
        items={[
          { value: tickets.used, label: "visiteurs entrés" },
          { value: tickets.sold, label: "billets" },
        ]}
        data-testid="ticket-counters"
      />

      <section className="orga__panel s-stack" aria-labelledby="scan-title">
        <h2 id="scan-title" className="s-h2">
          Lire un billet
        </h2>
        <fetcher.Form
          method="post"
          className="s-plate-in"
          data-testid="ticket-check-form"
          onSubmit={(e) => {
            e.preventDefault();
            const value = String(new FormData(e.currentTarget).get("payload") ?? "").trim();
            if (value) submit(value);
          }}
        >
          <TextField
            label="QR du billet"
            name="payload"
            id="ticket-payload"
            autoComplete="off"
            autoFocus
            placeholder="Scanne ou colle le contenu du QR"
            help="Un lecteur de QR en clavier remplit ce champ et valide tout seul."
          />
          <Button type="submit" icon="check" loading={busy}>
            Valider
          </Button>
        </fetcher.Form>
        <CameraReader onRead={submit} />
        {fetcher.data?.error && (
          <p className="s-error" role="alert">
            {fetcher.data.error}
          </p>
        )}
        {check && (
          <div data-testid="ticket-result" data-result={check.result}>
            {check.result === "ok" && (
              <ScanResult state="ok" pseudo={check.pseudo} vehicle={check.ticketName} time={formatTime(check.usedAt)} />
            )}
            {check.result === "already" && (
              <ScanResult
                state="duplicate"
                pseudo={check.pseudo}
                vehicle={check.ticketName}
                time={formatTime(check.usedAt)}
              />
            )}
            {check.result === "refused" && <ScanResult state="refused" reason={REFUSALS[check.reason]} />}
          </div>
        )}
      </section>

      <section className="orga__panel s-stack" aria-labelledby="list-title">
        <h2 id="list-title" className="s-h2">
          Billets ({tickets.sold})
        </h2>
        {tickets.items.length === 0 ? (
          <p className="s-muted">Aucun billet réservé pour l'instant.</p>
        ) : (
          <div className="s-table-wrap">
            <table className="s-table" data-testid="ticket-list">
              <thead>
                <tr>
                  <th scope="col">Visiteur</th>
                  <th scope="col">État</th>
                </tr>
              </thead>
              <tbody>
                {tickets.items.map((t) => (
                  <tr key={t.id}>
                    <td>{t.pseudo}</td>
                    <td>{t.status === "used" && t.usedAt ? `Entré à ${formatTime(t.usedAt)}` : "Attendu"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Plate as="section" kind="note">
        <p className="s-muted">
          Le contrôle est en ligne : chaque lecture est vérifiée par le serveur. Un billet ne passe qu'une seule fois.
        </p>
      </Plate>
    </>
  );
}
