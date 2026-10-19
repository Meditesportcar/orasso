import {
  Button,
  EmptyState,
  Ground,
  OLoader,
  OpeningBattle,
  SendBurst,
  SendProgress,
  StampDrop,
  TabBar,
  tabSets,
} from "@orasso/design-system/web";
import { type ReactNode, useEffect, useRef, useState } from "react";

// Section « Le O vivant » de la page de recette /ds (lot 39) : les huit variantes du prototype `s-olive` (battle en
// tandem, chargement, tirer pour actualiser, candidature envoyée, envoi de photos, état vide, tampon, bouton central),
// chacune avec son bouton, un « Rejouer » qui relance tout, et le fond animé « battle ». Textes du prototype.

function Card({
  id,
  title,
  text,
  stage,
  children,
  wide,
}: {
  id: string;
  title: string;
  text: string;
  stage: ReactNode;
  children?: ReactNode;
  wide?: boolean;
}) {
  return (
    <article className={`ds-olive-card${wide ? " ds-olive-card--wide" : ""}`} data-testid={`olive-${id}`}>
      <div className="ds-olive-stage">{stage}</div>
      <div className="ds-olive-body">
        <b className="o-t-body-strong">{title}</b>
        <span className="o-t-caption">{text}</span>
        {children ? <div className="ds-olive-actions">{children}</div> : null}
      </div>
    </article>
  );
}

/** Tirer pour actualiser (le site n'a pas de geste : le bouton fait descendre le O et la liste). */
function PullDemo({ playKey }: { playKey: number }) {
  const [pulled, setPulled] = useState(false);
  const [done, setDone] = useState(false);
  const pull = () => {
    setDone(false);
    setPulled(true);
    setTimeout(() => setDone(true), 1500);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: « Rejouer » relance l'actualisation
  useEffect(() => {
    if (playKey > 0) pull();
  }, [playKey]);
  return (
    <Card
      id="pull"
      title="Tirer pour actualiser"
      text="Le O descend, la voiture drifte le temps de recharger."
      stage={
        <div className={`ds-olive-pull${pulled ? " is-pulled" : ""}`}>
          <div className="ds-olive-pull__o">
            {pulled && <OLoader size={48} done={done} label={null} onParked={() => setPulled(false)} />}
          </div>
          <div className="ds-olive-pull__list">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      }
    >
      <Button variant="secondary" icon="undo" onClick={pull}>
        Tirer
      </Button>
    </Card>
  );
}

function UploadDemo({ playKey }: { playKey: number }) {
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const start = () => {
    if (timer.current) clearInterval(timer.current);
    setProgress(0);
    timer.current = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(1, p + 0.08);
        if (next >= 1 && timer.current) clearInterval(timer.current);
        return next;
      });
    }, 120);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: « Rejouer » relance l'envoi
  useEffect(() => {
    start();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playKey]);
  return (
    <Card
      id="upload"
      wide
      title="Envoi de photos"
      text="La voiture avance sur la route au rythme de l'envoi et se gare à 100 %."
      stage={
        <div className="ds-olive-road">
          <SendProgress progress={progress} />
        </div>
      }
    >
      <Button variant="secondary" icon="export" onClick={start}>
        Envoyer 3 photos
      </Button>
    </Card>
  );
}

export function OliveContent() {
  const [play, setPlay] = useState(0);
  const [hero, setHero] = useState(0);
  const [loading, setLoading] = useState(true);
  const [send, setSend] = useState(0);
  const [empty, setEmpty] = useState(0);
  const [stamp, setStamp] = useState(0);
  const [tab, setTab] = useState<string>(tabSets.exhibitor[2]?.id ?? "");
  return (
    <div className="ds-stack ds-olive">
      <div>
        <Button variant="secondary" icon="undo" onClick={() => setPlay((n) => n + 1)}>
          Rejouer
        </Button>
      </div>

      <section className="ds-olive-hero" data-testid="olive-hero">
        <div className="ds-olive-hero__stage">
          <OpeningBattle logoWidth={240} playKey={`${play}-${hero}`} />
        </div>
        <span className="o-t-label ds-olive-hero__label">Lancement de l'appli</span>
        <h3 className="o-t-poster-l ds-olive-hero__title">Battle en tandem</h3>
        <p className="o-t-caption ds-olive-hero__text">
          Deux voitures en drift autour du O, l'une chasse l'autre. La première finit garée dedans.
        </p>
        <Button variant="poster" icon="undo" onClick={() => setHero((n) => n + 1)}>
          Rejouer
        </Button>
      </section>

      <div className="ds-olive-grid">
        <Card
          id="load"
          wide
          title="Chargement"
          text="Une voiture en drift continu autour du O, avec la fumée. Quand c'est prêt, elle se gare dedans."
          stage={<OLoader key={play} size={90} done={!loading} />}
        >
          <Button variant="secondary" icon="undo" onClick={() => setLoading(true)}>
            Charger
          </Button>
          <Button variant="secondary" icon="check" onClick={() => setLoading(false)}>
            Terminer
          </Button>
        </Card>
        <PullDemo playKey={play} />
        <Card
          id="send"
          title="Candidature envoyée"
          text="Un tour de drift, elle se gare, le O s'allume."
          stage={<SendBurst size={90} playKey={`${play}-${send}`} />}
        >
          <Button variant="secondary" icon="next" onClick={() => setSend((n) => n + 1)}>
            Envoyer
          </Button>
        </Card>
        <UploadDemo playKey={play} />
        <Card
          id="empty"
          title="État vide"
          text="Place libre en pointillés. La voiture attend dehors."
          stage={<EmptyState width={150} title="Aucune sortie" playKey={`${play}-${empty}`} />}
        >
          <Button variant="secondary" icon="undo" onClick={() => setEmpty((n) => n + 1)}>
            Rejouer
          </Button>
        </Card>
        <Card
          id="stamp"
          title="Tampon du passeport"
          text="Le O frappe la page au scan, l'encre bave un peu."
          stage={<StampDrop seed={66} playKey={`${play}-${stamp}`} />}
        >
          <Button variant="secondary" icon="stamp" onClick={() => setStamp((n) => n + 1)}>
            Tamponner
          </Button>
        </Card>
        <Card
          id="tab"
          wide
          title="Bouton central de la barre"
          text="Sur l'Accueil, la voiture est garée dans le O. Ailleurs, elle sort. Essaie les onglets."
          stage={
            <div className="ds-olive-tab">
              <TabBar set="exhibitor" active={tab} onSelect={setTab} aria-label="Barre exposant" />
            </div>
          }
        />
      </div>

      <h3 className="o-t-label ds-v2-h3">Fond animé « battle »</h3>
      <div className="ds-phone ds-olive-ground" data-testid="olive-ground">
        <Ground variant="battle" className="ds-fill" />
      </div>
      <p className="o-t-caption">
        Avec la réduction des animations activée : la voiture est déjà garée et tout apparaît en fondu de 120 ms.
      </p>
    </div>
  );
}
