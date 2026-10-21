// Messagerie et Boîte (lot 18) : conversations, messages, lecture, images, demandes de contact.
import type {
  ContactAcceptResult,
  ContactRequestResult,
  ContactRequestView,
  ConversationPage,
  ConversationView,
  MessagePage,
  MessageView,
  OpenConversationResult,
  UploadResult,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const messagingApi = {
  conversations: (cursor?: string) => request<ConversationPage>(`/api/me/conversations${qs({ limit: 30, cursor })}`),
  conversation: (id: string) => request<ConversationView>(`/api/conversations/${id}`),
  messages: (id: string, before?: string) => request<MessagePage>(`/api/conversations/${id}/messages${qs({ before })}`),
  sendMessage: (id: string, body: { clientId: string; body?: string; imageKey?: string }) =>
    request<MessageView>(`/api/conversations/${id}/messages`, { method: "POST", body, timeout: 20_000 }),
  markRead: (id: string, messageId: string) =>
    request<{ ok: boolean }>(`/api/conversations/${id}/read`, { method: "POST", body: { messageId } }),
  deleteMessage: (id: string) => request<unknown>(`/api/messages/${id}`, { method: "DELETE" }),
  openDirect: (userId: string) =>
    request<OpenConversationResult>("/api/conversations/direct", { method: "POST", body: { userId } }),
  contactStructure: (structureId: string) =>
    request<OpenConversationResult>(`/api/structures/${structureId}/conversation`, { method: "POST" }),
  contactRequests: () => request<{ items: ContactRequestView[] }>("/api/me/contact-requests"),
  requestContact: (pseudo: string, message: string) =>
    request<ContactRequestResult>("/api/contact-requests", { method: "POST", body: { pseudo, message } }),
  acceptContact: (id: string) => request<ContactAcceptResult>(`/api/contact-requests/${id}/accept`, { method: "POST" }),
  declineContact: (id: string) => request<unknown>(`/api/contact-requests/${id}/decline`, { method: "POST" }),
  upload: (form: FormData) => request<UploadResult>("/api/me/uploads", { method: "POST", form, timeout: 60_000 }),
  deleteUpload: (id: string) => request<unknown>(`/api/me/uploads/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
