// Ton avis après l'événement (prototype « Ton avis ») : 1 à 3 étoiles et un commentaire obligatoire, affichés avec ton
// pseudo sur la page de l'événement ; l'organisateur a un droit de réponse. Une semaine pour le laisser.
import { Button, Chip, ChipRow, Text, TextField, useTheme } from "@orasso/design-system/native";
import { REVIEW_MAX_RATING } from "@orasso/shared";
import { useState } from "react";

import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";

export type ReviewTarget = { applicationId: string; title: string; deadline: string };

export function ReviewSheet({
  target,
  onClose,
  onDone,
}: {
  target: ReviewTarget | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTheme();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AppSheet visible={Boolean(target)} onClose={onClose} accessibilityLabel="Laisser un avis">
      {target ? (
        <>
          <Text variant="title" color={t.color.ink}>
            Ton avis · {target.title}
          </Text>
          <Text variant="body" color={t.color.inkMuted}>
            Affiché avec ton pseudo sur la page de l'événement ; l'organisateur a un droit de réponse. Jusqu'au{" "}
            {formatDayHour(target.deadline)}.
          </Text>
          <ChipRow>
            {Array.from({ length: REVIEW_MAX_RATING }, (_, i) => i + 1).map((n) => (
              <Chip
                key={n}
                selected={n <= rating}
                onPress={() => setRating(n)}
                accessibilityLabel={`${n} étoile${n > 1 ? "s" : ""} sur ${REVIEW_MAX_RATING}`}
              >
                ★
              </Chip>
            ))}
          </ChipRow>
          <TextField
            label="Un mot sur l'organisation, l'accueil, l'ambiance"
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={1000}
            style={{ minHeight: 96 }}
          />
          {error ? (
            <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            variant="primary"
            icon="chat"
            loading={busy}
            disabled={rating === 0 || comment.trim().length === 0}
            fullWidth
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.review(target.applicationId, { rating, comment: comment.trim() });
                setRating(0);
                setComment("");
                onDone();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Envoyer mon avis
          </Button>
        </>
      ) : null}
    </AppSheet>
  );
}
