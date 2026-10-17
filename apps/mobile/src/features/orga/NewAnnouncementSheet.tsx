// Nouvelle annonce du fil de l'événement (lot 22) : texte, photo facultative (envoi `purpose=announcement`), et « Prévenir
// les inscrits » (notification). L'API limite le nombre d'annonces par jour et réserve la photo aux organisateurs.
import { Button, CheckboxField, Text, TextField, useTheme } from "@orasso/design-system/native";
import { ANNOUNCEMENT_BODY_MAX, communicationLabels, orgaLabels } from "@orasso/shared";
import { useState } from "react";
import { Platform } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { pickPhotos } from "@/lib/photos";
import { AppSheet } from "@/ui/AppSheet";
import { Notice } from "@/ui/Notice";

export function NewAnnouncementSheet({
  eventId,
  visible,
  onClose,
  onPublished,
}: {
  eventId: string;
  visible: boolean;
  onClose: () => void;
  onPublished: () => void;
}) {
  const { t } = useTheme();
  const [body, setBody] = useState("");
  const [notify, setNotify] = useState(false);
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setBody("");
    setNotify(false);
    setImageKey(null);
    setError(null);
  };

  async function addPhoto() {
    setError(null);
    const [photo] = await pickPhotos(1);
    if (!photo) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("purpose", "announcement");
      if (Platform.OS === "web") {
        const blob = await (await fetch(photo.uri)).blob();
        form.append("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
      } else {
        form.append("file", { uri: photo.uri, name: "photo.jpg", type: "image/jpeg" } as unknown as Blob);
      }
      const { key } = await api.upload(form);
      setImageKey(key);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await api.postAnnouncement(eventId, { body: body.trim(), notify, imageKey, pinned: false, audience: "public" });
      reset();
      onPublished();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={orgaLabels.announcementNew}>
      <Text variant="title" color={t.color.ink}>
        {orgaLabels.announcementNew}
      </Text>
      <TextField
        label={communicationLabels.announcementBody}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={ANNOUNCEMENT_BODY_MAX}
        help={`${body.length} / ${ANNOUNCEMENT_BODY_MAX}`}
        testID="orga-announcement-body"
      />
      <Button
        variant="plate"
        icon={imageKey ? "check" : "add"}
        loading={uploading}
        onPress={() => (imageKey ? setImageKey(null) : void addPhoto())}
        fullWidth
      >
        {imageKey
          ? `${orgaLabels.announcementPhotoDone} · ${communicationLabels.photoRemove}`
          : orgaLabels.announcementPhotoAdd}
      </Button>
      <CheckboxField label={orgaLabels.announcementNotify} checked={notify} onChange={setNotify} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant="secondary"
        icon="share"
        loading={busy}
        disabled={body.trim() === "" || uploading || busy}
        onPress={() => void publish()}
        fullWidth
        testID="orga-announcement-publish"
      >
        {orgaLabels.announcementPublish}
      </Button>
      <Button variant="plate" icon="close" onPress={onClose} disabled={busy} fullWidth>
        Fermer
      </Button>
    </AppSheet>
  );
}
