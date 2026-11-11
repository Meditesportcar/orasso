// La fenêtre « Comment le Fil choisit » sur le site (lot R8c2, maquette R8.3 `reglesH`) : pour chaque onglet son nom, sa phrase et
// ses puces, puis « Ta publication » et la note finale. Mêmes mots que l'appli (`@orasso/shared`). « Pourquoi je vois ça »
// (par carte) ne change pas.
import { Button } from "@orasso/design-system/web";
import { feedHowMine, feedHowNote, feedHowRules, feedScreenLabels as L } from "@orasso/shared";
import { useEffect, useRef } from "react";

function Rule({
  name,
  phrase,
  bullets,
  mine,
  testId,
}: {
  name: string;
  phrase: string;
  bullets: readonly string[];
  mine?: boolean;
  testId: string;
}) {
  return (
    <section className={mine ? "fil-rule fil-rule--mine" : "fil-rule"} data-testid={testId}>
      <span className="fil-rule__tag">{name}</span>
      <strong className="fil-rule__phrase">{phrase}</strong>
      <ul>
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </section>
  );
}

export function HowFeedDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} className="mod-dialog" aria-label={L.howTitle} onClose={onClose} data-testid="fil-how">
      <div className="s-stack">
        <h2 className="s-h2">{L.howTitle}</h2>
        {feedHowRules.map((r) => (
          <Rule key={r.filter} name={r.name} phrase={r.phrase} bullets={r.bullets} testId={`fil-how-${r.filter}`} />
        ))}
        <Rule
          name={feedHowMine.name}
          phrase={feedHowMine.phrase}
          bullets={feedHowMine.bullets}
          mine
          testId="fil-how-mine"
        />
        <p className="o-t-caption" data-testid="fil-how-note">
          {feedHowNote.before}
          <strong>{feedHowNote.strong}</strong>
          {feedHowNote.after}
        </p>
        <Button variant="secondary" icon="check" fullWidth onClick={onClose} data-testid="fil-how-ok">
          {L.howClose}
        </Button>
      </div>
    </dialog>
  );
}
