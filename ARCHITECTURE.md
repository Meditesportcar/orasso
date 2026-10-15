# Orasso — Architecture technique (lot 02, 15/10/2026)

Conception technique du parcours n° 1 (page événement → candidater → tri → retenu → accès → jour J → scan staff hors ligne → points), écrite pour que les lots 05, 06, 07, 09 et 10 codent sans réinventer, et pour ne pas bloquer la suite (site public, création d'événement, pros, billetterie, social, modération). Texte en français ; tables, colonnes, routes et code en anglais. Chaque table et chaque route se rattache à une ligne « Validé » de `docs/01` ou `docs/02` ; ce qui n'est pas du parcours n° 1 est marqué **[préparé]** (schéma ou point d'ancrage seulement, pas d'écran) ou **[plus tard]** (rien n'est codé, on indique seulement où ça se branchera).

Conventions générales : PostgreSQL 17, Drizzle, migrations versionnées uniquement. Clés primaires `uuid` (`gen_random_uuid()`), colonnes `created_at timestamptz not null default now()` et `updated_at timestamptz` partout (omises ci-dessous). Horodatages toujours `timestamptz` ; fuseau métier `Europe/Paris` (colonne `events.timezone`, une seule valeur en V1). Enums PostgreSQL déclarés dans Drizzle, valeurs anglaises ; les libellés français vivent dans `packages/shared` (`labels.fr.ts`) et nulle part ailleurs. Suppression logique (`deleted_at`) seulement là où c'est écrit ; sinon suppression réelle.

---

## 1. Modèle de données

### 1.1 Comptes et profils (docs/01 « Utilisateurs : le compte », « Points et grades », « Administration et rôles »)

Better Auth possède ses tables (`user`, `session`, `account`, `verification`, `two_factor`, posées au lot 01). On n'y ajoute rien : tout ce qui est métier va dans `profiles`.

**`profiles`** — 1 pour 1 avec `user`.
| colonne | type | règle |
|---|---|---|
| `user_id` | text PK, FK `user.id` on delete cascade | |
| `pseudo` | text not null, unique (index sur `lower(pseudo)`) | 3–24 caractères `[a-z0-9_.]`, insensible à la casse |
| `first_name`, `last_name` | text null | demandés par l'inscription express ; visibles de l'organisateur seulement |
| `phone` | text null | « coordonnées » : organisateur et super staff seulement |
| `avatar_key` | text null | clé de stockage objet |
| `bio` | text null | « description » du profil |
| `visibility` | enum `public \| private`, default `public` | |
| `departments` | text[] not null default '{}' | codes `01`–`95`, `2A`, `2B`, `971`–`976` ; liste statique dans shared ; index GIN |
| `radius_km` | smallint not null default 50 | rayon des suggestions et notifications |
| `platform_role` | enum `user \| moderator \| super_admin`, default `user` | |
| `newsletter_opt_in` | boolean not null default false | case « Newsletter Orasso » |
| `notification_prefs` | jsonb not null default `{"application":true,"event":true,"social":true,"grade":true}` | un interrupteur par famille (docs/01 « Notifications ») ; les relances staff ne se coupent pas |
| `points_season` | integer not null default 0 | cache de la somme de `point_entries` sur la saison courante |
| `grade` | enum `rodage \| route \| sport \| circuit \| legende` not null default `rodage` | dérivé des points (voir § 2.7), recalculé à chaque écriture de points |
| `account_qr_secret` | bytea not null | 32 octets aléatoires, générés à la création du profil, régénérables (§ 3.3) |
| `invite_token` | text unique not null | lien d'invitation d'ami (points « ami invité ») **[préparé]** |
| `invited_by_user_id` | text null FK `user.id` | **[préparé]** |
| `suspended_until` | timestamptz null | modération **[préparé]** |

**`profile_interests`** (`user_id` FK, `category_id` FK `categories.id`, PK composite) — centres d'intérêt.

**`categories`** — une seule liste pour les catégories de véhicules, d'événements et les centres d'intérêt (docs/01 : « Découverte des événements par affinités (catégories : youngtimer, etc.) » et « Catégories (exemples : youngtimer, JDM, ancienne, sportive…) »). `id uuid`, `slug text unique`, `label text`, `position smallint`, `min_vehicle_age smallint null` (règle d'éligibilité : youngtimer ≥ 20 ans, ancienne ≥ 30 ans), `active boolean`. Liste de départ (seed, administrable plus tard) : `youngtimer`, `ancienne`, `jdm`, `allemande`, `francaise`, `italienne`, `americaine`, `sportive`, `supercar`, `preparee`, `stance`, `drift`, `4x4`, `utilitaire`, `moto`.

**`devices`** — un appareil = un jeton push et un identifiant de scanner.
`id uuid`, `user_id` FK, `platform enum ios|android|web`, `expo_push_token text null unique`, `name text null` (modèle du téléphone), `app_version text`, `last_seen_at timestamptz`, `revoked_at timestamptz null`. Index `(user_id)`. Sert à la fois à Expo Push et à l'attribution des scans (§ 4).

### 1.2 Structures et appartenances (docs/01 « Organisateurs : la structure », « Administration et rôles »)

**`structures`** : `id`, `slug text unique` (URL `/o/slug`), `kind enum association|club|circuit|company|collectivity`, `name`, `logo_key`, `description`, `address_line`, `postal_code`, `city`, `department text`, `lat/lng double precision null`, `departments text[]` (secteur), `website`, `socials jsonb` (`{instagram, facebook, tiktok, youtube}`), `siret text null`, `rna text null`, `verification enum unverified|pending|verified|suspended default unverified`, `verified_at`, `badge_expires_at` (verified_at + 1 an), `invite_token text unique not null` (lien d'invitation de l'organisateur), `created_by` FK user, `deleted_at`. Seules les structures `verified` publient (règle API).
**[préparé]** `stripe_account_id text null`, `follower_message_quota smallint` (limite d'envoi aux abonnés).

**`structure_members`** : `id`, `structure_id` FK, `user_id` FK, `role enum owner|co_organizer|staff`, `staff_roles text[] default '{}'` (valeurs : `scan`, `shop`, `placement`, `control`, `filtering`, `super_staff`), `can_decide boolean default false` (filtration : droit de trancher), `status enum invited|requested|active|removed`, `invited_by` FK user null, `joined_at`. Unique `(structure_id, user_id)`. Exactement un `owner` actif par structure (contrainte vérifiée en service + index unique partiel `where role='owner' and status='active'`).

**`structure_follows`** : `structure_id`, `user_id`, `source enum application|invite_link|manual`, PK composite. Un utilisateur qui ne suit pas une structure n'y est pas visible.

**`structure_bans`** : `id`, `structure_id`, `user_id`, `reason text`, `created_by`. Unique `(structure_id, user_id)`. Alerte « banni de la structure » au tri, refus au scan.

**[préparé]** `structure_verification_documents` (justificatifs, pièce d'identité supprimée à la validation), `structure_notes` (note interne sur un participant), `structure_partners` (pros partenaires) : tables décrites ici pour l'ancrage, créées au lot 13/14.

### 1.3 Véhicules (docs/01 « Véhicules et garage »)

Référentiel, enrichi par l'équipe Orasso seulement :
- **`vehicle_makes`** : `id`, `name`, `slug unique`, `country text` (code ISO 2 : « pays de la marque »), `is_other boolean default false`.
- **`vehicle_models`** : `id`, `make_id` FK, `name`, `slug`, `vehicle_type enum car|moto|truck`, `is_other`. Unique `(make_id, slug)`.
- **`vehicle_generations`** : `id`, `model_id` FK, `name` (« E36 »), `year_from smallint`, `year_to smallint null`, `is_other`. Unique `(model_id, name)`.
Une ligne « Autre » (`is_other = true`) existe pour les marques, et pour chaque marque un modèle « Autre », pour chaque modèle une génération « Autre ». Aucune saisie libre de marque/modèle.

**`vehicles`** :
| colonne | type | règle |
|---|---|---|
| `id` | uuid | |
| `owner_id` | FK user | |
| `vehicle_type` | enum `car \| moto \| truck` | |
| `make_id`, `model_id`, `generation_id` | FK, génération nullable | cohérence make→model→generation vérifiée en service |
| `year` | smallint null | 1885–année courante + 1 |
| `color` | text null | |
| `engine` | text null | V1 : texte court choisi/saisi ; la base de motorisations générées est **[plus tard]** (`vehicle_engines` par génération, `vehicles.engine_id`) |
| `power_hp`, `weight_kg` | smallint null | vraisemblance : 1–2500 ch, 50–40000 kg |
| `plate` | text null | telle que saisie, jamais exposée hors organisateur |
| `plate_normalized` | text null | `regexp_replace(upper(plate),'[^A-Z0-9]','','g')` (majuscules d'abord : correction du coordinateur, 15/10) ; **index unique partiel** `where status='active' and plate_normalized is not null` |
| `unregistered` | boolean default false | option « non immatriculé » ; alors `plate` null ; l'organisateur voit l'alerte |
| `status` | enum `active \| sold \| keepsake \| wrecked` default `active` | seuls les `active` candidatent ; plaque obligatoire pour `active` sauf `unregistered` |
| `description`, `preparation` | text null | |
| `certified_at` | timestamptz null | certification **[préparé]** (perdue à la modification de la fiche et après 6 mois sans événement) |
| `archived_at` | timestamptz null | passage à sold/keepsake/wrecked |

**`vehicle_photos`** : `id`, `vehicle_id` FK cascade, `position smallint` (check 1–8), `storage_key`, `width`, `height`, `bytes`. Unique `(vehicle_id, position)`. Minimum 1 photo pour candidater (vérifié en service, pas en base).
**`vehicle_categories`** : `vehicle_id`, `category_id`, PK composite ; éligibilité par `categories.min_vehicle_age` vérifiée en service.
**`plate_transfer_requests`** **[préparé]** : `id`, `plate_normalized`, `from_vehicle_id`, `to_user_id`, `status enum pending|accepted|refused|arbitrated`, `decided_by`. Créée quand une plaque déjà active est saisie ; file admin « transferts de plaque » au lot 13.

### 1.4 Événements (docs/01 « créer un événement », « communiquer », « le jour J »)

**`events`** :
| colonne | type | règle |
|---|---|---|
| `id` | uuid | |
| `event_no` | integer generated always as identity, unique | identifiant court (4 octets) embarqué dans le QR |
| `plate_salt` | bytea(16) not null default gen_random_bytes(16) (pgcrypto) ou aléa généré par l'API | sel du hachage de plaque transmis à la synchro staff (§ 4.1) — ajout du coordinateur, 15/10 |
| `structure_id` | FK | |
| `slug` | text unique | URL `/e/slug` |
| `title`, `description` | text | |
| `poster_key` | text null | affiche |
| `format` | enum `gathering \| exhibition \| cars_and_coffee \| show \| open_house \| night` | libellés « Rassemblement », « Exposition », « Cars & coffee », « Salon », « Portes ouvertes », « Nocturne » |
| `starts_at`, `ends_at` | timestamptz not null | check `ends_at > starts_at` |
| `timezone` | text default 'Europe/Paris' | |
| `address_line`, `postal_code`, `city`, `department`, `lat`, `lng` | | adresse publique |
| `admitted_vehicle_types` | text[] not null | sous-ensemble de `car, moto, truck` |
| `capacity` | integer null | null = sans limite ; sinon > 0 |
| `max_vehicles_per_user` | smallint not null default 1 | |
| `admission` | enum `open \| filtered \| invite_only` | |
| `criteria` | jsonb null | `{categoryIds[], makeIds[], countries[], text}` ; affichage + aide au tri, pas de filtrage automatique |
| `public_access` | enum `free \| free_reservation \| paid_orasso \| paid_external \| closed` | billetterie **[préparé]** ; V1 parcours 1 : `free` ou `closed` |
| `external_ticket_url` | text null | |
| `status` | enum `draft \| published \| cancelled` | |
| `outlook` | enum `maintained \| uncertain` default `maintained` | bandeau « Incertain » ; « Annulé » = `status = cancelled` |
| `registrations_open_at` | timestamptz not null | ouverture publique ; les abonnés ouvrent à `registrations_open_at - preview_hours` |
| `preview_hours` | smallint not null default 24 | avant-première |
| `lock_offset_minutes` | integer not null default 120 | verrouillage H-2 réglable (0–1440) |
| `locked_at` | timestamptz null | posé par la tâche `event.lock` (trace) ; la règle vit dans `isLocked()` |
| `rules_text` | text null | règlement (modèle Orasso ou libre) |
| `instructions` | text null | consignes aux retenus (jour J) |
| `published_at`, `cancelled_at`, `settled_at` | timestamptz null | `settled_at` : points attribués (J+2) |
| `created_by` | FK user | |

Index : `(structure_id, starts_at)`, `(status, starts_at)`, `(department)`, index géographique simple `(lat, lng)` (pas de PostGIS en V1 : filtre par boîte englobante puis distance en service).
**[préparé]** `parent_event_id` (duplication), `recurrence_rule` : lot 13.

**`event_days`** **[préparé]** : `id`, `event_id`, `day_date date`, `starts_at`, `ends_at`. Multi-jours : une ligne par jour, `applications.event_day_id null` = tout l'événement. Table créée au lot 05, non exposée en V1 du parcours.

**`event_zones`** : `id`, `event_id` FK cascade, `code text` (1–4 caractères affichés en grand au scan : « A », « JDM »), `name text`, `capacity integer null`, `position smallint`. Unique `(event_id, code)`.

**`event_invitations`** **[préparé]** : `id`, `event_id`, `user_id null`, `vehicle_id null`, `email null`, `token unique`, `status enum pending|accepted|declined|expired`, `created_by`. Nécessaire pour `admission = invite_only` ; routes au lot 13.

**`event_announcements`** **[plus tard]** (annonces, messages groupés, modèles) : lot 13.

### 1.5 Candidatures et liste d'attente (docs/01 « trier les candidatures », « Découvrir et participer », « Candidatures »)

**`applications`** :
| colonne | type | règle |
|---|---|---|
| `id` | uuid | |
| `event_id` | FK | |
| `user_id` | FK user | |
| `kind` | enum `vehicle \| provider` default `vehicle` | `provider` **[préparé]** (prestataires : même mécanique, onglet à part) |
| `vehicle_id` | FK null | obligatoire si `kind = vehicle` ; snapshot non nécessaire (la fiche vit) |
| `event_day_id` | FK null | **[préparé]** |
| `status` | enum `pending \| accepted \| waitlisted \| offered \| refused \| withdrawn \| expired \| cancelled` | voir machine à états § 2.1 |
| `rules_accepted_at` | timestamptz not null | règlement accepté (« J'ai lu la charte… ») |
| `companions` | smallint not null default 0 | « Accompagnants » (écran 2/3 du prototype) ; 0–9 |
| `message` | text null | « Un mot pour l'organisateur (facultatif) », ≤ 120 caractères ; pas une question personnalisée de l'organisateur (interdit par docs/01) |
| `follow_structure` | boolean not null | case « Suivre l'organisateur » (cochée d'office) ; appliquée à `structure_follows` à l'envoi |
| `decided_at`, `decided_by` | timestamptz, FK user null | dernière décision organisateur |
| `refusal_reasons` | text[] default '{}' | codes de `REFUSAL_REASONS` (shared) |
| `refusal_note` | text null | |
| `refusal_sent` | boolean default true | « envoyés par défaut, l'organisateur peut choisir de ne pas les envoyer » |
| `waitlist_rank` | integer null | ordre dans la liste d'attente ; attribué `max+1` à l'entrée, réordonnable |
| `waitlisted_at` | timestamptz null | |
| `offered_at`, `offer_expires_at` | timestamptz null | offre de place libérée en cours |
| `withdrawn_at` | timestamptz null | |
| `withdrawn_after_lock` | boolean default false | désistement après verrouillage → malus à J+2 |
| `zone_id` | FK `event_zones` null | zone attribuée (tri ou placement) |
| `source` | enum `self \| express \| invitation \| crew` default `self` | `express` : inscription express ; `crew`, `invitation` **[préparé]** |
| `filtering_opinion` | jsonb null | avis du staff de filtration `{userId, opinion: keep\|doubt\|refuse, note, at}[]` |

Index : `(event_id, status)`, `(user_id, status)`, `(event_id, waitlist_rank)`. **Index unique partiel** `(event_id, vehicle_id) where status in ('pending','accepted','waitlisted','offered')` : une candidature active par véhicule et par événement. Contrainte `max_vehicles_per_user` vérifiée en service (compte des candidatures actives de l'utilisateur sur l'événement).

**`application_events`** — journal des transitions (audit et tests) : `id`, `application_id` FK cascade, `from_status`, `to_status`, `actor enum user|organizer|staff|system|admin`, `actor_user_id null`, `reason text null`, `at`. Toute transition passe par `ApplicationService.transition()` qui écrit ici.

**Motifs de refus** (constante shared `REFUSAL_REASONS`, administrable **[plus tard]**) — les cinq du prototype validé, plus deux qui correspondent aux alertes du tri : `off_theme` « Hors thème », `insufficient_photos` « Photos insuffisantes », `full` « Complet », `vehicle_already_retained` « Véhicule déjà retenu », `unregistered_vehicle` « Véhicule non immatriculé », `criteria_not_met` « Ne correspond pas aux critères », `other` « Autre » (note obligatoire). Feuille « Motif du refus », envoyés par défaut (« Décochable, mais un refus motivé passe mieux »).

**[plus tard]** `crews`, `crew_members` ; une candidature de crew créera une `application` par membre avec `source = crew` et un statut d'attente de confirmation du membre — ajout d'une valeur d'enum et d'une colonne `crew_id` à ce moment-là.

### 1.6 QR, accès, staff, scans et pointages (docs/01 « Accueil sur place et QR codes », « le jour J » ; docs/02 « Mode staff »)

**`signing_keys`** : `kid smallint PK` (0–255, embarqué sur 1 octet), `algorithm text default 'ed25519'`, `public_key bytea` (32 octets), `active_from timestamptz`, `retired_at timestamptz null`. La clé privée n'est jamais en base (§ 3.1).

**`access_passes`** — le QR d'inscription : `id uuid` (ses 16 octets sont la charge utile), `application_id` FK unique, `event_id` FK, `user_id` FK, `kid` FK `signing_keys`, `signature bytea` (64 octets), `issued_at`, `revoked_at timestamptz null`, `revoked_reason enum withdrawn|cancelled|banned|replaced null`. Émis à l'acceptation ; jamais régénéré après un scan ; révoqué (pas supprimé) au désistement ou à l'annulation.

**`event_staff`** — le staff de l'événement (rôles ajustables, présence) : `id`, `event_id` FK, `user_id` FK, `roles text[] null` (null = rôles de `structure_members.staff_roles`), `can_decide boolean null`, `presence enum unknown|present|absent default unknown`, `presence_updated_at`, `last_reminded_at`, `reminder_count smallint default 0`, `synced_at timestamptz null` (dernière synchro réussie, informatif), `added_by`. Unique `(event_id, user_id)`. Lignes créées à la publication pour tout staff actif de la structure, et à chaque nouveau membre staff tant que l'événement n'est pas fini.

**`scan_events`** — chaque lecture, telle que l'appareil l'a décidée (jamais modifiée) :
`id uuid` (généré par l'appareil : clé d'idempotence), `event_id` FK, `device_id` FK `devices`, `staff_user_id` FK, `pass_id` FK null, `raw_payload text null` (si QR non résolu), `local_decision enum ok|already|refused|override|unknown_pass`, `local_reason text null`, `zone_code text null`, `scanned_at timestamptz` (horloge de l'appareil), `received_at timestamptz` (serveur), `server_result enum accepted|duplicate_same_device|duplicate_other_device|rejected|unknown`, `duplicate_of_scan_id` FK null. Index `(event_id, received_at)`, `(event_id, pass_id)`.

**`checkins`** — l'entrée effective, une par candidature : `id`, `application_id` FK unique, `event_id` FK, `method enum scan|manual|plate|express`, `checked_in_at timestamptz` (la plus ancienne connue), `device_id` null, `staff_user_id` null, `zone_id` null, `source_scan_id` FK `scan_events` null, `note text null` (pointage manuel « entré sans scan »). C'est l'existence d'un `checkin` qui donne le statut « Sur place » et la participation à J+2.

**`express_invites`** : `id`, `event_id`, `email`, `token text unique`, `created_by` FK (staff), `expires_at` (création + 24 h), `used_at`, `user_id null`, `application_id null`. Route API au lot 06, écran du formulaire au lot 13.

**`incidents`** (main courante) : `id`, `event_id`, `reporter_user_id`, `occurred_at`, `location text`, `lat/lng null`, `description text`, `photo_key null`, `client_id uuid unique null` (idempotence hors ligne). **`staff_alerts`** : `id`, `event_id`, `user_id`, `lat/lng null`, `message text null`, `resolved_at null`, `client_id unique`. Tables et routes CRUD au lot 06, écrans au lot 10 s'il reste de la marge, sinon au lot 13.

### 1.7 Points, saisons, grades, contestations (docs/01 « Points et grades », « après l'événement »)

**`seasons`** : `id`, `name` (« Saison 2027 »), `starts_on date`, `ends_on date`. Une saison = une année civile. Unique `(starts_on)`.
**`point_entries`** : `id`, `user_id` FK, `season_id` FK, `kind enum participation|staff|referral|malus|malus_reversal|season_carryover|admin_adjustment`, `points integer not null` (négatif pour `malus`), `event_id` null, `application_id` null, `created_by` null (admin), `note` null. Index `(user_id, season_id)`. **Index unique partiel** `(application_id, kind) where application_id is not null` : jamais deux fois les points d'une même candidature. Un seul compteur : `profiles.points_season = sum(points)` sur la saison courante, recalculé en transaction.
**`malus_contests`** : `id`, `point_entry_id` FK unique, `user_id`, `event_id`, `message text`, `status enum pending|accepted|rejected|escalated`, `decided_by`, `decided_at`, `organizer_note`, `escalated_at`. Fenêtre de contestation : 7 jours après l'écriture du malus ; l'organisateur a 7 jours pour répondre, sinon `escalated` et l'administration tranche (texte du prototype : « L'organisateur a 7 jours pour répondre, puis l'administration tranche »).

Barème provisoire (shared `POINTS`, **à revoir avec Damien** ; repris des chiffres que Damien a vus dans le prototype validé) : `participation` +20, `staff` +20, `referral` +10, `malus` −10. Seuils de grade (shared `GRADE_THRESHOLDS`, prototype « Points et grade ») : Rodage 0, Route 100, Sport 300, Circuit 400, Légende 800. La certification ne rapporte pas de points (docs/01 l'emporte sur le « +40 · certification » du prototype).

### 1.8 Notifications et journal (docs/01 « Notifications », docs/02 « Journal »)

**`notifications`** : `id`, `user_id` FK, `type text` (enum shared : `application_accepted`, `application_waitlisted`, `application_refused`, `offer_received`, `offer_expired`, `event_updated`, `event_cancelled`, `event_outlook_changed`, `event_instructions`, `event_reminder_eve`, `event_reminder_week` (e-mail seulement), `preview_open`, `new_event_followed`, `event_nearby_interest`, `staff_presence_reminder`, `staff_sync_reminder`, `staff_alert`, `points_awarded`, `malus_applied`, `contest_decided`, `grade_changed`, `season_ended`), `family enum application|event|social|grade|staff`, `title`, `body`, `data jsonb` (lien profond : `{eventId, applicationId, screen}`), `event_id null`, `deliver_after timestamptz` (heures calmes), `delivered_at null` (livraison réservée une seule fois : ajout du lot 05), `push_sent_at null`, `email_sent_at null`, `read_at null`. Index `(user_id, created_at desc)`. Le Journal de l'appli lit cette table (le fil d'actualité social s'y ajoutera **[plus tard]** par de nouveaux `type`).
**`email_outbox`** : `id`, `to`, `subject`, `template`, `payload jsonb`, `status enum queued|sent|failed`, `transport enum journal|brevo`, `sent_at`, `error`. Toute sortie e-mail passe par là (rejouable, lisible en dev).

### 1.9 Journal d'administration (docs/01 « Administration et rôles »)

**`admin_audit_log`** : `id`, `actor_user_id` FK, `action text` (`structure.verify`, `structure.view_as`, `user.suspend`, `points.adjust`, `participants.export`…), `target_type text`, `target_id text`, `structure_id null`, `reason text null`, `ip inet null`, `user_agent text null`. Insert-only. Les consultations de coordonnées au-delà de J+7 et les exports s'y tracent aussi (point « en discussion », la table est prête).

### 1.10 Où se brancheront les fonctions ultérieures **[plus tard]**
- Prestataires : `provider_profiles` (user_id, type, photos, contact) + `applications.kind = provider` ; même tri, onglet à part ; QR de stand = `access_passes` avec `application.kind = provider`.
- Pros : `pro_profiles`, `pro_discounts` (par grade), `pro_posts`, `pro_subscriptions` ; le scan pro lit `POST /api/account-qr/verify` (§ 5) et ajoutera la remise.
- Billetterie : `ticket_types`, `tickets` (QR = même mécanique que `access_passes`, `kind = ticket`), `orders` (Stripe Connect) ; `events.public_access` est déjà là ; rôle staff `shop` les contrôlera.
- Crews : `crews`, `crew_members`, `applications.crew_id`.
- Messagerie : `conversations` (`kind direct|crew|structure_staff|event_staff|organizer_participant`), `messages`, `message_reads` ; discussion d'événement fermée à J+1 par la tâche `event.close_day_after`.
- Signalements et modération : `reports`, `sanctions`, `profiles.suspended_until` ; suspension automatique = tâche pg-boss sur compte de signalements.
- Avis : `reviews` (1–3 étoiles, commentaire, réponse de l'organisateur), ouverts 7 jours après `ends_at`, réservés aux `checkins`.

---

## 2. Règles métier

Toutes les règles sont des fonctions pures dans `packages/shared/src/rules/*` (entrée : objets + `now`), appelées par les services de l'API, qui seuls écrivent en base. Les tâches pg-boss n'ont pas de logique : elles appellent un service avec `now`. Chaque service reçoit un `Clock` (`now(): Date`) injectable ; les tests Vitest passent une horloge simulée.

### 2.1 Cycle de vie d'une candidature (`ApplicationService`)

États : `pending` « En attente » · `accepted` « Retenue » · `waitlisted` « Liste d'attente » (badge avec le rang) · `offered` « Liste d'attente » + carte « Place libérée, à accepter avant … » · `refused` « Refusée » · `withdrawn` « Désistée » · `expired` « Offre expirée » · `cancelled` « Événement annulé ». « Sur place » = `accepted` + `checkin` existant (pas un statut).

Transitions autorisées (toute autre → erreur `409 invalid_transition`) :

| de | vers | acteur | condition |
|---|---|---|---|
| — | `pending` | user | événement `published`, inscriptions ouvertes pour cet utilisateur (§ 2.6), non verrouillé, véhicule `active` du candidat, type admis, ≥ 1 photo, pas de candidature active pour ce véhicule, `max_vehicles_per_user` respecté, non banni de la structure, `admission ≠ invite_only` ou invitation acceptée |
| — | `accepted` | staff (express) | inscription express : création directe, pass émis |
| `pending` | `accepted` | organizer | si `capacity` défini : `accepted_count + offered_count < capacity` (une offre en cours réserve sa place), sinon `409 event_full` (l'organisateur passe par la liste d'attente) |
| `pending` | `accepted` / `waitlisted` | system | admission `open` (« sans sélection », docs/01) : retenue d'office s'il reste une place, sinon liste d'attente (lot 05) |
| `pending` | `waitlisted` | organizer | `waitlist_rank = max + 1`, `waitlisted_at = now` |
| `pending` | `refused` | organizer | motifs (≥ 1) ; `other` exige une note |
| `waitlisted` | `accepted` | organizer | même règle de capacité ; `waitlist_rank = null` |
| `waitlisted` | `refused` | organizer | |
| `waitlisted` | `offered` | system (`WaitlistService.offerNext`) | voir § 2.2 |
| `offered` | `accepted` | user | avant `offer_expires_at` ; place toujours libre (sinon `409`) ; pass émis |
| `offered` | `withdrawn` | user | « refuser la place » |
| `offered` | `expired` | system (`waitlist.offer-expire`) | `now ≥ offer_expires_at` ; puis `offerNext` |
| `offered` | `accepted` | organizer | l'organisateur peut forcer |
| `accepted` | `withdrawn` | user | toujours possible jusqu'à `ends_at` ; `withdrawn_after_lock = isLocked(event, now)` ; pass révoqué ; si non verrouillé → `offerNext` |
| `accepted` | `refused` | organizer | revenir sur une décision (motifs) ; pass révoqué ; `offerNext` si non verrouillé |
| `pending`, `waitlisted`, `offered` | `withdrawn` | user | sans conséquence |
| `pending`, `accepted`, `waitlisted`, `offered` | `cancelled` | system (`EventService.cancel`) | pass révoqués, aucun malus |
| `refused` | `accepted` / `waitlisted` | organizer | correction d'erreur, tant que non verrouillé |

Effets de bord (dans la même transaction) : écriture dans `application_events`, notification au candidat (`application_accepted` / `_waitlisted` / `_refused` avec motifs si `refusal_sent`, `offer_received`, `offer_expired`), diffusion WebSocket des compteurs (§ 5.4), émission ou révocation du pass. Décisions annoncées immédiatement (docs/01 : « au fil des décisions »).

Tests minimaux (`applications.test.ts`) : chaque transition autorisée ; chaque transition interdite lève `invalid_transition` ; candidature refusée si véhicule non actif / sans photo / type non admis / doublon de véhicule / dépassement de `max_vehicles_per_user` / banni / verrouillé / inscriptions pas ouvertes ; `accepted` bloqué à pleine capacité ; `follow_structure` crée la ligne de suivi ; la plaque n'apparaît jamais dans la sérialisation publique.

### 2.2 Liste d'attente automatique (`WaitlistService`)

Déclencheur `offerNext(eventId, now)` : appelé quand une place se libère (désistement ou refus d'un `accepted`, expiration ou refus d'une offre) **et** que `capacity` est défini et `now < lockAt`. Sans limite de places, la liste d'attente n'est qu'un parking manuel de l'organisateur : rien d'automatique.

Algorithme :
1. `free = capacity − count(accepted) − count(offered)`. Si `free ≤ 0` → rien.
2. Candidate = première `waitlisted` par `waitlist_rank asc, waitlisted_at asc`. Aucune → rien.
3. `deadline = computeOfferDeadline(event, now)` (ci-dessous). Si `deadline === null` → rien (journal `waitlist.skipped_too_late`).
4. Transition `waitlisted → offered`, `offered_at = now`, `offer_expires_at = deadline` ; notification `offer_received` ; tâche pg-boss `waitlist.offer-expire` `{applicationId, offeredAt}` avec `startAfter = deadline` ; répéter depuis 1 tant que `free > 0`.

`computeOfferDeadline(event, now)` (règle précise retenue, en heure de Paris) :
- `lockAt = starts_at − lock_offset_minutes`.
- `start = now` sauf si `now` est dans les heures calmes (22:00–08:00) et que `now` n'est pas le jour J : alors `start = 08:00` suivant (la notification part à `start`).
- `delay` : 24 h si `start` est avant 00:00 de la veille (J−2 ou plus tôt) ; 3 h si `start` est la veille (J−1) ; 2 h si `start` est le jour J.
- `deadline = min(start + delay, lockAt)`. Si `deadline − start < 30 min` → `null` (plus personne ne peut répondre et venir). *(Lot 05, après relecture : comparé à `start` et non à `now`, sinon une offre faite la veille au soir d'un événement matinal expirerait avant que sa notification parte à 08:00.)*

Tâche `waitlist.offer-expire` : si `status = offered` et `offered_at` égal à la charge utile → `expired`, notification `offer_expired`, puis `offerNext`. Sinon ne rien faire (offre déjà acceptée ou reprise : idempotent). Partie en avance : replanifiée à l'échéance. Balayage de secours `waitlist.sweep` chaque minute pour les offres échues (lot 05). Verrous toujours dans l'ordre événement puis candidature.

Réordonnancement par l'organisateur : `PUT /events/:id/waitlist/order` avec la liste complète des ids `waitlisted` → réécriture des `waitlist_rank` 1..n en transaction. Les `offered` ne sont pas réordonnables.

Tests (`waitlist.test.ts`, horloge simulée) : ordre d'arrivée respecté ; réordonnancement ; désistement J−5 → offre 24 h ; désistement la veille 10:00 → échéance 13:00 ; jour J 09:00 pour un début 18:00 (lock 16:00) → 11:00 ; offre à 23:00 J−3 → début 08:00 (J−2), échéance J−1 08:00 (la règle ci-dessus ; l'exemple d'origine disait « J−2 08:00 », corrigé au lot 05) ; plafonnement par `lockAt` ; `null` si < 30 min ; expiration → suivant ; acceptation à temps ; acceptation après l'échéance refusée ; deux places libérées → deux offres ; sans `capacity` → aucune offre ; pas d'offre après verrouillage ; tâche d'expiration rejouée sans effet.

### 2.3 Désistement et verrouillage (`ApplicationService.withdraw`, `rules/lock.ts`)

`isLocked(event, now) = now ≥ event.starts_at − lock_offset_minutes` (fonction pure, source de vérité ; `events.locked_at` n'est qu'une trace). Désistement : toujours accepté jusqu'à `ends_at` ; avant verrouillage → sans malus, place réoffert ; après → `withdrawn_after_lock = true`, malus à J+2 (règle littérale des docs : « sans malus jusqu'au verrouillage »), pas de réoffre. Le candidat voit le délai : « Désistement sans pénalité jusqu'au <date heure> ».

Tâche `event.lock` (planifiée à la publication à `lockAt`, replanifiée si `starts_at` ou `lock_offset_minutes` change ; le gestionnaire vérifie que `lockAt` recalculé ≤ now, sinon replanifie) : `locked_at = now` ; offres `offered` en cours → `expired` (sans réoffre) ; notification `staff_sync_reminder` au staff `present` ou `unknown` ; diffusion WS `event.locked`. Après verrouillage, l'organisateur peut encore retenir à la main (liste d'attente → retenue), et l'inscription express reste possible : la liste d'accès n'est donc jamais figée, elle est **versionnée** (§ 4.1).

Tests (`lock.test.ts`) : `isLocked` aux bornes ; désistement J−1 → pas de malus et réoffre ; désistement H−1 → `withdrawn_after_lock`, pas de réoffre ; `lock_offset_minutes = 0` ; changement de date replanifie.

### 2.4 Avant-première (`rules/registrationWindow.ts`)

`registrationOpensAt(event, user)` = `registrations_open_at − preview_hours` si l'utilisateur suit la structure (`structure_follows`) au moment de la candidature, sinon `registrations_open_at`. `canApply(event, user, now) = now ≥ registrationOpensAt && !isLocked && status = published`. Notification `preview_open` aux abonnés à `registrations_open_at − preview_hours` (tâche `event.preview-open`), `new_event_followed` à la publication. **[plus tard]** avant-première supplémentaire des hauts grades (colonne `high_grade_preview_hours`).
Tests : abonné à H−25 refusé, H−23 accepté ; non abonné à H−23 refusé, à H+0 accepté ; `preview_hours = 0`.

### 2.5 Jour J : scans, doublons, pointage (`CheckinService`) — détail § 4

Règle serveur `applyScan(scan)` : le `checkin` d'une candidature est créé par le premier scan **par horodatage `scanned_at`** reçu (si `|scanned_at − received_at| > 24 h`, `scanned_at := received_at`). Tout scan `ok` ultérieur sur la même candidature → `duplicate_same_device` ou `duplicate_other_device`, `duplicate_of_scan_id` posé ; si son `scanned_at` est antérieur au `checked_in_at` courant, le `checkin` est réécrit (date la plus ancienne, `source_scan_id` mis à jour) et l'ancien scan devient le doublon. Un scan d'un pass révoqué/inconnu → `rejected`. Même `id` reçu deux fois → réponse identique, aucune écriture (idempotence). Pointage manuel ou par plaque sur une candidature déjà entrée → renvoie le `checkin` existant (`200`, pas `201`).
Tests (`checkins.test.ts`) : premier scan crée ; deuxième appareil = doublon ; horodatage antérieur réécrit ; batch rejoué = identique ; pass révoqué rejeté ; plaque inconnue renvoyée en `unmatched` ; dérive d'horloge corrigée.

### 2.6 Points, malus, contestation (`PointsService`)

Tâche `event.settle` planifiée à la publication à `ends_at + 48 h` (replanifiée si `ends_at` change ; ignorée si `status = cancelled`) : en une transaction, pour chaque `application` de l'événement :
- `accepted` avec `checkin` → `participation` +20 (« Présent à un événement ») ;
- `accepted` sans `checkin`, ou `withdrawn` avec `withdrawn_after_lock` → `malus` −10 (« Absent sans désistement »), notification `malus_applied` avec « Contestable jusqu'au <J+9> » ;
- toute autre → rien (« Désistement avant la veille · 0 »).
Puis pour chaque `event_staff` `presence = present` → `staff` +20. `events.settled_at = now`. Index unique `(application_id, kind)` garantit l'idempotence. Entre `ends_at` et `settled_at`, le participant voit « Pointage en attente ».

Contestation : `POST /applications/:id/malus-contest` autorisé si `now ≤ malus.created_at + 7 jours` et aucune contestation existante. Décision organisateur (`owner`/`co_organizer`) : `accepted` → `malus_reversal` +10 (+ pointage manuel optionnel créé avec `method = manual`, note) ; `rejected` → rien. Sans décision 7 jours après le dépôt → tâche `contest.escalate` : `escalated`, file admin ; le super admin tranche avec les mêmes effets. Notification `contest_decided`.

Grade : `gradeFor(points) = plus haut seuil ≤ points` ; recalculé après toute écriture ; si changement → notification `grade_changed`. Fin de saison (tâche `season.rollover`, cron 1er janvier 00:10 Paris) : créer la saison, et pour chaque profil `points_season = GRADE_THRESHOLDS[max(grade − 1, rodage)]` via une entrée `season_carryover` (« on descend d'un grade et on continue »), notification `season_ended`. **[préparé]** `referral` à la confirmation de l'e-mail d'un filleul.
Tests (`points.test.ts`) : règlement J+2 complet ; idempotence ; malus sur `withdrawn_after_lock` ; pas de malus sur désistement avant verrouillage ni sur événement annulé ; contestation dans / hors délai ; acceptation inverse le malus ; seuils de grade ; report de saison.

### 2.7 Staff : présence et relances (`StaffService`)

`PUT /events/:id/staff/me/presence {present: bool}`. Tâche `staff.remind` (cron quotidien 10:00 Paris) : pour chaque `event_staff` `presence = unknown` d'un événement `published` dont `starts_at > now` et dont le jour J n'est pas aujourd'hui → notification + e-mail `staff_presence_reminder`, `reminder_count++`. L'organisateur voit qui n'a jamais répondu. Le mode staff est accessible pour un `event_staff` dès J−1 00:00 jusqu'à `ends_at + 1 jour` (fermeture à J+1).

### 2.8 Événement : statut, bandeau, annulation (`EventService`)

`PATCH /events/:id/outlook {outlook}` → notification `event_outlook_changed` à tous les inscrits actifs (`pending`, `accepted`, `waitlisted`, `offered`). `POST /events/:id/cancel` → `status = cancelled`, toutes les candidatures actives → `cancelled`, pass révoqués, tâches `event.*` annulées, notification `event_cancelled`. Modification de `starts_at` ou de l'adresse après publication → `event_updated` à tous les inscrits + replanification des tâches. Rappels : `event.reminder-week` (`starts_at − 7 j`, e-mail toujours) ; `event.reminder-eve` (`starts_at − 1 j` à 18:00 Paris, push, avec météo **[plus tard]** ; sans météo en V1).

### 2.9 Récapitulatif des tâches pg-boss

| nom | planification | gestionnaire |
|---|---|---|
| `waitlist.offer-expire` | `startAfter = offer_expires_at`, singleton par `applicationId+offeredAt` | `WaitlistService.expireOffer` |
| `event.lock` | `startAfter = lockAt`, `singletonKey = eventId` | `EventService.lock` |
| `event.preview-open` | `registrations_open_at − preview_hours` | `NotificationService` |
| `event.reminder-week`, `event.reminder-eve` | voir § 2.8 | `NotificationService` |
| `event.settle` | `ends_at + 48 h`, `singletonKey = eventId` | `PointsService.settleEvent` |
| `staff.remind` | cron `0 10 * * *` (Paris) | `StaffService.remindUnanswered` |
| `notifications.deliver` | toutes les minutes | envoie push/e-mail des notifications dont `deliver_after ≤ now` et non envoyées |
| `season.rollover` | cron `10 0 1 1 *` | `PointsService.rolloverSeason` |
| `contest.escalate` | `startAfter = contest.created_at + 7 j`, singleton par contestation | `PointsService.escalateContest` |

Toutes les tâches liées à un événement sont (re)planifiées par `EventSchedulingService.reschedule(eventId)` après tout changement de dates ou d'offset ; les gestionnaires recalculent la condition à partir de la base avant d'agir (jamais confiance à la charge utile seule).

---

## 3. QR codes

Implémentation partagée dans `packages/shared/src/qr/` (encodage/décodage, canonisation, vérification via un adaptateur `verify(message, signature, publicKey)`) ; API : `node:crypto` (Ed25519 natif) ; appli : `@noble/ed25519` + `@noble/hashes` (JS pur, hors ligne).

### 3.1 QR d'inscription (signé, vérifiable hors ligne)

Clés : Ed25519. Clé privée dans la variable d'environnement `QR_SIGNING_KEYS` = JSON `[{"kid":1,"privateKey":"<base64 32 octets seed>"}]` et `QR_SIGNING_ACTIVE_KID=1` ; script `pnpm keys:generate` pour le dev ; en prod dans `/etc/orasso/api.env`. Au démarrage, l'API dérive les clés publiques et les synchronise dans `signing_keys` (insère les absentes, ne retire jamais). Rotation : ajouter une clé, changer `ACTIVE_KID`, laisser l'ancienne en vérification (`retired_at` posé plus tard, après la dernière échéance des pass signés avec elle) ; l'appli accepte toute clé de `signing_keys` non retirée reçue à la synchro, et garde en cache les clés déjà vues.

Message signé (22 octets, grand-boutiste) : `version u8 = 1` · `kid u8` · `event_no u32` · `pass_id 16 octets (uuid)`. Signature Ed25519 : 64 octets. **Charge utile du QR** (texte) : `OR1` + base32 RFC 4648 **majuscules sans padding** de (message ‖ signature) = 86 octets → 138 + 3 = 141 caractères, tous dans le jeu alphanumérique du QR (A–Z, 0–9). QR version 6, correction M, **mode alphanumérique** (capacité 154 caractères) : 41 × 41 modules. *(Correction du coordinateur, 15/10 : la version base64url initiale — 115 caractères en mode octets — dépassait la capacité 6-M de 106 octets et aurait imposé une version 7 plus dense ; le base32 garde la version 6 et évite les ambiguïtés d'encodage des lecteurs de codes-barres. Vérifier par test que la bibliothèque de génération choisit bien le mode alphanumérique et la version 6.)* Affichage à au moins 60 % de la largeur de l'écran sur fond papier d'affiche, luminosité forcée au maximum sur l'écran jour J — lisible à travers un pare-brise à 30–50 cm. Le préfixe `OR1` permet de rejeter en 1 ms tout QR étranger.

Décision hors ligne (`decideScan(payload, localDb, now)`, pure, dans shared) :
1. Préfixe absent / décodage impossible → `refused` « QR inconnu ».
2. `kid` inconnu localement → `refused` « Clé inconnue : synchronise ».
3. Signature invalide → `refused` « QR falsifié ».
4. `event_no ≠ événement du mode staff` → `refused` « Autre événement ».
5. `pass_id` absent de la liste locale → `unknown_pass` : écran « QR valide mais absent de ta liste : synchronise » avec bouton « Accepter quand même » (→ `override`, enregistré avec le staff et l'heure ; cas de l'inscription express faite par un collègue).
6. Entrée `revoked` → `refused` « Désisté » / « Annulé » / « Non admis ».
7. Entrée déjà entrée (localement ou `checked_in_at` connu) → `already` avec l'heure du premier passage.
8. Sinon → `ok` + zone (`zone_code`, `zone_name`), nom du véhicule, pseudo ; écriture locale du pointage et mise en file.

Émission : à l'acceptation (`accepted`), `AccessPassService.issue(application)` ; `GET /api/applications/:id/pass` renvoie `{payload, eventNo, issuedAt, revokedAt}` ; le site l'affiche dans `/app/acces` pour qui n'a pas l'appli. Pas de régénération après scan ; un pass révoqué puis candidature ré-acceptée (correction) → nouveau pass, ancien `revoked_reason = replaced`.

### 3.2 Liste d'accès signée (synchro staff) — format § 4.1

Signature Ed25519 (même clé active) du SHA-256 de la sérialisation JSON canonique (clés triées) des `entries` + `generatedAt` + `eventNo`. L'appli vérifie avant d'écraser son cache ; échec → la synchro est rejetée et signalée.

### 3.3 QR de compte dynamique (façon TOTP)

Secret : `profiles.account_qr_secret` (32 octets), transmis à l'appli une fois au login (`GET /api/me/account-qr-secret`, stocké dans `expo-secure-store`), régénérable par l'utilisateur (« Sécurité et appareils »), ce qui invalide les anciens.
Code : `code = HOTP(secret, counter = floor(unixSeconds / 60))` tronqué à 8 chiffres (RFC 4226, SHA-1, pas de 60 s). **Charge utile** : `OA1` + base64url(`user_id` abrégé 8 octets = 8 premiers octets de SHA-256(user_id)) + `.` + `code` sur 8 chiffres, soit ~23 caractères → QR version 2. Le QR se redessine toutes les 60 s, hors ligne. `profiles.account_qr_short_id bytea(8) unique` (dérivé, stocké pour la recherche).
Vérification : `POST /api/account-qr/verify {payload}` (authentifié ; pro au lot 14) : retrouve le profil par `short_id`, accepte `counter ∈ {c−1, c, c+1}` (±60 s de dérive), rejette un `code` déjà utilisé dans la même fenêtre pour ce compte (table mémoire courte / `account_qr_uses` à 3 min), renvoie `{pseudo, grade, discount: null}` (remise ajoutée au lot 14). Une capture d'écran prêtée expire en 1–2 min. **[plus tard]** scanner le même QR depuis la casquette passionné → demande d'ami.

Tests (`qr.test.ts`) : encodage/décodage ; signature valide ; charge utile altérée (1 bit) ; mauvaise clé ; `kid` inconnu ; autre événement ; TOTP : fenêtres valides c−1/c/c+1, c−2 refusé, rejeu refusé, secret régénéré invalide l'ancien.

---

## 4. Mode staff hors ligne (appli, lot 10 ; API lot 06)

### 4.1 Synchronisation

`GET /api/events/:id/staff/sync?since=<cursor>` (rôle : `event_staff` de l'événement, ou organisateur) → 
```
{ event: { id, eventNo, title, startsAt, endsAt, lockAt, isLocked, zones: [{id, code, name, capacity}] },
  keys: [{ kid, publicKey, retiredAt }],
  myRoles: ["scan","placement"], 
  entries: [{ passId, applicationId, status: "valid"|"revoked", revokedReason, pseudo, vehicleLabel,  // « BMW Série 3 E36 »
              vehicleType, categories: ["jdm"], plateHint, plateHash, zoneCode, zoneName, checkedInAt, checkinMethod,
              contact: { firstName, lastName, phone, email } | undefined,  // super_staff seulement
              updatedAt }],
  removedPassIds: [], cursor: "<updated_at max ISO>", generatedAt, signature }
```
Delta : `since` renvoie seulement les entrées modifiées après le curseur (candidatures ré-acceptées, révoquées, pointées, zone changée) ; sans `since`, liste complète. `plateHash = HMAC-SHA256(event_plate_salt, plate_normalized)` hex tronqué à 16 caractères, où `event_plate_salt` est un aléa de 16 octets propre à chaque événement (colonne `events.plate_salt`, transmis dans `event` à la synchro pour que l'appli hache la saisie du staff). *(Correction du coordinateur, 15/10 : l'espace des plaques françaises est petit (~4,6 × 10⁸) ; un hachage, même salé, se retrouve par force brute en quelques secondes sur un ordinateur. Le sel par événement empêche seulement de recouper les listes entre événements. La vraie protection est la purge à J+1 et l'accès à l'appareil : noté en A14.)* Et `plateHint` = les 3 premiers caractères de `plate_normalized` en clair : la recherche exacte et le pointage rapide « Tape les 3 premiers caractères de la plaque, valide, suivant » (prototype) fonctionnent hors ligne sans que la plaque complète quitte le serveur ; une saisie de 3 caractères renvoie les quelques entrées de même préfixe, le staff choisit visuellement. La plaque entière en clair n'est envoyée qu'à l'organisateur (le prototype l'affiche dans la liste staff : voir A10). Disponible dès la publication (l'écran affiche « Liste non verrouillée » tant que `!isLocked`) ; rappel `staff_sync_reminder` au verrouillage et à l'ouverture du mode staff si `synced_at` est antérieur au verrouillage. Taille : 500 entrées ≈ 150 Ko ; rien de bloquant.

Temps réel : canal WS `event:{id}:access` pousse `{type:"access.changed", passIds:[…]}` → l'appli lance un delta si elle a du réseau. Sans réseau, la liste locale sert telle quelle.

### 4.2 Stockage local (expo-sqlite)

Base `orasso-staff.db`, une table par préoccupation :
- `staff_events (event_id PK, event_no, payload_json, cursor, synced_at, lock_at, ends_at)` ;
- `access_entries (pass_id PK, event_id, application_id, status, pseudo, vehicle_label, vehicle_type, plate_hint, plate_hash, zone_code, zone_name, checked_in_at, checkin_method, contact_json, updated_at)` index `(event_id, plate_hash)`, `(event_id, plate_hint)`, `(event_id, pseudo)` ;
- `signing_keys (kid PK, public_key, retired_at)` ;
- `pending_actions (id PK uuid, event_id, kind: scan|manual_checkin|plate_checkin|presence|incident|alert, payload_json, created_at, attempts, last_error, sent_at)` ;
- `local_checkins (application_id PK, event_id, checked_in_at, method, scan_id)` — vue locale « déjà entré » avant confirmation serveur.
Purge : à `ends_at + 1 jour` (fermeture à J+1), tout ce qui concerne l'événement est supprimé, y compris `contact_json` ; une `pending_action` non envoyée bloque la purge et affiche « N scans à envoyer » sur Accès > Où je suis staff.

### 4.3 Boucle de scan

`expo-camera` en lecture continue ; filtrage local : même charge utile ignorée pendant 3 s ; `decideScan` (§ 3.1) ; affichage `ScanResult` 1 s (OK moutarde + zone, Déjà entré + heure, Refusé + raison) puis retour caméra ; sons distincts ; aucune interaction nécessaire. Chaque lecture produit une `pending_action kind=scan` `{id, passId, rawPayload?, decision, reason, zoneCode, scannedAt, deviceId}` et, si `ok`/`override`, une ligne `local_checkins`. Boutons permanents : « Plaque ou pseudo » (recherche locale : plaque normalisée → hash ; pseudo : préfixe insensible à la casse ; résultat → « Pointer » = `manual_checkin`), « Express » (saisie d'un e-mail → `POST /api/events/:id/express-invites`, réseau requis ; sinon mis en file `kind=express` et envoyé plus tard).

### 4.4 Envoi au retour du réseau

Déclencheurs : `NetInfo` passe en ligne, ouverture du mode staff, toutes les 30 s en ligne tant que la file n'est pas vide. Lots de 200 `pending_actions` → `POST /api/events/:id/scans` (`{deviceId, items:[…]}`) ; réponse par `id` : `accepted | duplicate_same_device | duplicate_other_device | rejected | unknown` + `checkedInAt`, `duplicateOf` → `sent_at` posé, `local_checkins` alignés sur le serveur. Erreur réseau → `attempts++`, nouvel essai exponentiel (5 s → 5 min). Erreur 4xx définitive → `last_error`, l'élément reste visible dans le rapport, jamais perdu silencieusement.

### 4.5 Doublons entre appareils et rapport

Résolution serveur § 2.5 (premier `scanned_at` gagne). `GET /api/events/:id/scan-report` → `{ totals: {accepted, checkins, byMethod, duplicates, rejected, overrides, unknown}, byDevice: [{deviceId, deviceName, staffPseudo, scans, duplicates}], duplicates: [{applicationId, pseudo, vehicleLabel, first: {device, at}, others: [{device, at}]}], overrides: […], rejected: […] }`. Lisible dans l'appli (écran d'entrée du mode staff, « Rapport ») et dans l'espace organisateur. Le cas « plusieurs staffs sans aucun réseau scannent le même QR » est accepté : le véhicule entre une fois, le rapport montre les doublons.

### 4.6 Liste, pointage manuel, pointage rapide par plaque

Liste (tout rôle) : entrées `valid` triées par pseudo, recherche « Pseudo, véhicule ou plaque », filtres « Tous / Arrivés / Attendus » (+ « Sans scan » = `checkin_method ≠ scan`), compteurs par zone (rôle `placement` : attendus / arrivés par zone, « N places restantes »). « Pointer » / « Pointé » → `manual_checkin {applicationId, note?}`. Pointage rapide par plaque (« Pointage rapide · après coup », entrées massives) : champ plein écran, saisie des 3 premiers caractères ou de la plaque entière + Entrée → correspondance locale par `plate_hint` puis `plate_hash` ; un seul résultat → pointé directement ; plusieurs → choix sur une ligne ; aucun → liste « Non reconnues » exportée au rapport ; → `plate_checkin {applicationId, plateTyped}`. Compteur d'en-tête du scan « 62 / 116 » = entrés / retenus. Coordonnées affichées seulement si `myRoles` contient `super_staff`. Le site (lot 07) offre la liste et le pointage manuel en ligne (`POST /api/events/:id/checkins`), pas le scan.

### 4.7 Présence, alerte, main courante

« Je suis là / pas là » → `PUT /events/:id/staff/me/presence` (file hors ligne possible). Alerte → `POST /events/:id/alerts` (position) → notification `staff_alert` immédiate à tout `event_staff` `present` et aux organisateurs (ignore les heures calmes) + WS. Main courante → `POST /events/:id/incidents` (photo envoyée après coup si hors ligne).

---

## 5. API

### 5.1 Conventions

Base `/api`, JSON, cookies de session Better Auth (même origine, pas de CORS ; l'appli envoie le cookie de session via `fetch` avec `credentials` et un en-tête `X-Device-Id`). Validation : chaque route a `input` et `output` zod dans `packages/shared/src/schemas/<domain>.ts` ; l'API valide les deux (`@hono/zod-validator`), les clients importent les types. Erreurs : `{"error":{"code":"invalid_transition","message":"…","details":{}}}` avec `400 validation_error`, `401 unauthenticated`, `403 forbidden`, `404 not_found`, `409 conflict | invalid_transition | event_full | plate_taken | offer_expired`, `423 locked`, `429 rate_limited`, `500 internal`. Pagination par curseur : `?limit=20&cursor=<opaque>` → `{items, nextCursor}` ; tri stable `(created_at desc, id desc)`. Dates ISO 8601 UTC. Pseudos de champ : camelCase dans l'API, snake_case en base (Drizzle mappe).

### 5.2 Permissions (middlewares `apps/api/src/lib/auth/`)

- `requireAuth` → `c.var.user`, `c.var.profile`, `c.var.deviceId`.
- `requirePlatformRole('moderator' | 'super_admin')`.
- `requireStructureRole(param, roles)` : charge `structure_members` actif ; `organizer` = `owner | co_organizer`. Un `super_admin` passe partout et chaque passage écrit `admin_audit_log` (`structure.view_as`).
- `requireEventStaff(param, staffRoles?)` : `event_staff` de l'événement (rôles effectifs = `event_staff.roles ?? structure_members.staff_roles`) ou organisateur de la structure ; vérifie la fenêtre J−1 → J+1 pour les écritures de scan.
- `requireOwner(resource)` pour véhicule, candidature, appareil.
- Sérialiseurs par audience (`serializers/vehicle.ts`…) : `public` (jamais plaque, ni nom, ni téléphone), `owner`, `organizer` (tout), `staff` (plaque hachée, contact si `super_staff`). Compte privé → `public` réduit (pseudo, avatar, grade, marque + modèle). Profils et garages visibles seulement connecté.

### 5.3 Routes du parcours n° 1

Légende rôle : `pub` public · `auth` connecté · `own` propriétaire de la ressource · `org` organisateur de la structure · `staff` event_staff · `adm` super_admin.

**Compte et profil** (lot 05)
| méthode | chemin | rôle | entrée → sortie |
|---|---|---|---|
| `*` | `/auth/*` | — | Better Auth (e-mail + mot de passe, 2FA TOTP + passkeys ; Google/Apple déclarés, inactifs) |
| GET | `/me` | auth | → `Me` (user, profile, memberships, counts) |
| PATCH | `/me/profile` | auth | `ProfileUpdate` (pseudo, bio, visibility, departments, radiusKm, interests, notificationPrefs, newsletterOptIn, firstName, lastName, phone) |
| POST | `/me/avatar` | auth | multipart → `{avatarUrl}` |
| GET/POST/DELETE | `/me/devices`, `/me/devices/:id` | auth | `DeviceRegister {platform, expoPushToken?, name, appVersion}` |
| GET | `/me/account-qr-secret` · POST `/me/account-qr-secret/rotate` | auth | → `{secret, shortId}` (lot 06) |
| GET | `/users/:pseudo` | auth | profil d'un autre selon visibilité |
| GET | `/me/notifications` · POST `/me/notifications/read` | auth | Journal paginé ; `{ids[] \| all}` |

**Garage** (lot 05)
| GET | `/vehicle-reference/makes`, `/makes/:id/models`, `/models/:id/generations`, `/categories` | auth | référentiel (cache HTTP 1 h) |
| GET/POST | `/me/vehicles` | auth | `VehicleCreate` → `Vehicle(owner)` ; `409 plate_taken` si plaque active ailleurs (+ crée `plate_transfer_requests`) |
| GET/PATCH/DELETE | `/me/vehicles/:id` | own | `VehicleUpdate` (dont `status`) ; DELETE réel si jamais candidaté, sinon `409` → archiver |
| POST/DELETE/PUT | `/me/vehicles/:id/photos`, `/photos/:photoId`, `/photos/order` | own | multipart (jpeg/png/heic ≤ 15 Mo, recompressé `sharp` 2048 px, webp) ; 1–8 |
| GET | `/vehicles/:id` | auth | fiche d'un autre selon visibilité |

**Structures** (lot 05 : minimum pour le seed et l'organisateur ; création complète lot 13)
| GET | `/structures/by-slug/:slug` | pub | fiche publique (+ `isFollowing` si connecté) |
| POST/DELETE | `/structures/:id/follow` | auth | |
| POST | `/structures` | auth | `StructureCreate` → devient owner ; `verification = unverified` |
| GET/PATCH | `/structures/:id` | org | |
| GET/POST/PATCH/DELETE | `/structures/:id/members`, `/members/:userId` | org | rôles, `staffRoles`, `canDecide` ; invitation par pseudo ou e-mail d'un compte existant (statut `invited`) |
| POST | `/me/memberships/:structureId/accept` · `/decline` | auth | réponse à une invitation (lot 05) |
| GET | `/structures/:id/followers` | org | abonnés (coordonnées comprises) |
| GET/POST/DELETE | `/structures/:id/bans`, `/bans/:userId` | org | `{pseudo, reason}` |
| POST | `/admin/structures/:id/verify` | adm | `{verified: bool, note}` → audit |

**Événements** (lot 05 : lecture publique + création minimale ; assistant complet lot 13)
| GET | `/events` | pub | filtres `format, categoryId, department, from, to, lat, lng, radiusKm, structureId, q` ; `invite_only` exclus sauf invité |
| GET | `/events/by-slug/:slug` | pub | `EventPublic` (compteurs : places restantes si `capacity`, retenus ; `myApplications` si connecté ; `registrationOpensAtForMe`) |
| POST | `/structures/:id/events` | org | `EventCreate` (tous les champs § 1.4) → `draft` ; structure `verified` requise pour publier |
| GET/PATCH | `/events/:id` | org | `EventUpdate` → replanification des tâches ; notifications si date/adresse changent après publication |
| POST | `/events/:id/publish` · `/cancel` · PATCH `/events/:id/outlook` | org | § 2.8 |
| GET/POST/PATCH/DELETE | `/events/:id/zones`, `/zones/:zoneId` | org | |
| GET | `/structures/:id/events` | org | liste par statut |

**Candidatures — passionné** (lot 05)
| GET | `/me/applications` | auth | `?scope=upcoming\|past` → cartes Accès (statut, rang, offre et échéance, `withdrawDeadline`, « pointage en attente », points) |
| POST | `/events/:id/applications` | auth | `ApplicationCreate {vehicleIds[], rulesAccepted: true, followStructure, newsletterOptIn}` → une `application` par véhicule, toutes `pending` |
| GET | `/applications/:id` | own/org | |
| POST | `/applications/:id/withdraw` | own | → § 2.3 |
| POST | `/applications/:id/offer/accept` · `/offer/decline` | own | § 2.2 |
| GET | `/applications/:id/pass` | own | § 3.1 (lot 06) |
| POST | `/applications/:id/malus-contest` | own | `{message}` (lot 06) |

**Tri — organisateur** (lot 05)
| GET | `/events/:id/applications` | org | filtres `status, categoryId, makeId, country, yearFrom, yearTo, grade, q` ; tri ; `ApplicationForTriage` (véhicule complet avec plaque, candidat : pseudo, grade, `eventsCount`, `absencesCount`, historique avec la structure, avis filtration, alertes `duplicatePlate \| banned \| unregistered`) |
| GET | `/events/:id/applications/next` | org | la prochaine `pending` (file une par une) |
| GET | `/events/:id/counters` | org | `{remaining, accepted, pending, waitlisted, refused}` |
| POST | `/events/:id/applications/:appId/decide` | org | `{decision: accept\|waitlist\|refuse, reasons?, note?, sendReasons?, zoneId?}` ; le « Décision immédiate · annuler 5 s » du prototype est côté client (envoi différé de 5 s, annulable), la décision reçue par l'API est définitive et notifiée aussitôt |
| POST | `/events/:id/applications/decide-many` | org | `{ids[], decision, …}` → résultats individuels (sans échec global) |
| PUT | `/events/:id/waitlist/order` | org | `{applicationIds[]}` |
| PATCH | `/events/:id/applications/:appId/zone` | org/staff(placement) | `{zoneId}` |
| POST | `/events/:id/applications/:appId/filtering-opinion` | staff(filtering) | `{opinion, note}` ; `decide` autorisé si `canDecide` |
| GET/POST | `/events/:id/malus-contests`, `/malus-contests/:id/decide` | org | `{decision: accept\|reject, note}` (lot 06) |

**Accès, staff, jour J** (lot 06)
| GET | `/keys` | pub | clés publiques `signing_keys` (cache 1 h) |
| GET | `/me/staff-events` | auth | « Où je suis staff » : événements J−1 → J+1 et à venir, présence, rôles, `pendingSync` |
| GET | `/events/:id/staff` · PATCH `/staff/:userId` | org | présences, relances (`reminderCount`), rôles par événement |
| PUT | `/events/:id/staff/me/presence` | staff | `{present: bool}` |
| GET | `/events/:id/staff/sync` | staff | § 4.1 |
| POST | `/events/:id/scans` | staff | `{deviceId, items: PendingAction[]}` → `{results: [{id, result, checkedInAt?, duplicateOf?}]}` idempotent, ≤ 200 |
| GET | `/events/:id/checkins` | staff/org | liste (filtre `method`, `zoneId`, `q`) |
| POST | `/events/:id/checkins` | staff/org | `{applicationId, method: manual\|plate, note?}` → 201 ou 200 si existant |
| POST | `/events/:id/checkins/by-plates` | staff/org | `{plates: string[]}` → `{matched: [...], unmatched: [...]}` |
| GET | `/events/:id/search` | staff | `?q=` plaque ou pseudo (en ligne ; hors ligne, la recherche est locale) |
| GET | `/events/:id/scan-report` | staff/org | § 4.5 |
| GET | `/events/:id/live` | org | `{arrived, expected, byCategory[], byZone[], staffPresent, staffExpected}` |
| POST | `/events/:id/express-invites` | staff/org | `{email}` → e-mail avec `/express/<token>` |
| GET | `/express/:token` · POST `/express/:token` | pub | `{pseudo, password, firstName, lastName, plate \| unregistered, makeId, modelId, generationId?, photo}` → compte + véhicule + `application accepted` + pass → `{passPayload}` ; connecte la session |
| POST | `/events/:id/alerts` · GET | staff | |
| POST/GET | `/events/:id/incidents` | staff/org | multipart (photo facultative) |
| POST | `/account-qr/verify` | auth | § 3.3 |
| GET | `/me/points` | auth | solde, grade, prochain seuil, entrées de la saison, contestations |

**Administration (minimum lot 05/06)** : `GET /admin/audit`, `POST /admin/structures/:id/verify`, `POST /admin/users/:id/points-adjust`. Le reste au lot 13.

### 5.4 WebSocket `/api/ws`

Connexion authentifiée par le cookie de session ; message client `{"type":"subscribe","channel":"event:<id>:triage"}` ; le serveur vérifie le droit à chaque abonnement (mêmes middlewares). Canaux et événements :
- `event:{id}:triage` (org) : `counters` `{remaining, accepted, pending, waitlisted, refused}` à chaque transition ; `application.changed {applicationId, status}`.
- `event:{id}:live` (org) : `live` `{arrived, expected, byCategory, byZone, staffPresent}` à chaque `checkin` et présence ; `alert` ; `incident`.
- `event:{id}:access` (staff) : `access.changed {passIds[]}`, `event.locked`.
- `user:{id}` (auth, implicite) : `notification {id, type, title, body, data}` ; `application.changed`.
Diffusion depuis les services via `realtime.publish(channel, type, payload)` ; un seul processus API en V1 (pas de bus inter-processus ; si plusieurs instances un jour → `LISTEN/NOTIFY` PostgreSQL, interface déjà isolée dans `lib/realtime`). Battement de cœur 30 s ; reconnexion côté client avec ré-abonnement.

---

## 6. Organisation du code

```
apps/api/src/
  server.ts            # @hono/node-server + WebSocket upgrade + pg-boss start + Sentry
  app.ts               # Hono app : middlewares globaux, montage des modules
  config/env.ts        # zod : DATABASE_URL, PORT, APP_ORIGIN, BETTER_AUTH_SECRET, QR_SIGNING_KEYS, QR_SIGNING_ACTIVE_KID,
                       #       MAIL_TRANSPORT=journal|brevo, BREVO_API_KEY?, MAIL_FROM, STORAGE_DRIVER=disk|s3, STORAGE_*,
                       #       EXPO_ACCESS_TOKEN?, SENTRY_DSN?, DEV_SKIP_2FA (dev seulement, refusé si NODE_ENV=production)
  db/{client.ts, schema/index.ts, schema/<domain>.ts}  # un fichier de schéma par domaine, ré-exportés
  lib/                 # transversal, sans règle métier
    errors.ts (AppError + mapping HTTP) · pagination.ts · clock.ts (Clock, systemClock) · realtime/ (ws, canaux)
    jobs/ (pg-boss : registre des tâches, planification, singletons) · mail/ (MailService, transports journal/, brevo/)
    storage/ (StorageService, drivers disk/, s3/ ; URLs signées ou servies par /api/files/:key en disque)
    push/ (Expo Push, lots de 100, gestion des DeviceNotRegistered → devices.revoked_at) · sentry.ts · auth/ (Better Auth, middlewares)
  modules/<domain>/    # routes.ts (Hono + zod) · service.ts (règles, transactions) · repo.ts (requêtes Drizzle) · jobs.ts · serializers.ts · *.test.ts
    profiles · devices · structures · vehicles · events · applications (tri, liste d'attente, désistement) · access (passes, clés)
    staff (event_staff, présence, synchro) · checkins (scans, pointage, rapport, express) · points (saisons, grades, contestations)
    notifications (journal, préférences, livraison) · admin (audit, vérification)
  scripts/ (seed.ts, keys-generate.ts, scenario-parcours1-a.ts, scenario-parcours1-b.ts)
packages/shared/src/
  enums.ts (toutes les enums + listes : départements, rôles staff, motifs de refus) · labels.fr.ts (libellés exacts des docs)
  schemas/<domain>.ts (zod entrée/sortie ; types inférés exportés) · rules/ (applicationTransitions, waitlistDeadline, lock, registrationWindow, points, grades : fonctions pures)
  qr/ (encode/decode pass et account-qr, canonical JSON, verify adapter) · api/ (client typé fetch minimal, chemins des routes, codes d'erreur)
```
Règles : aucune requête SQL hors `repo.ts` ; aucune règle métier hors `service.ts` / `shared/rules` ; les routes ne font que valider, appeler, sérialiser. Transactions Drizzle au niveau service. Tests Vitest : règles pures sans base ; services contre la base locale (`embedded-postgres`, schéma migré, transaction annulée par test) ; horloge injectée partout.

Secrets : `.env` local ignoré par Git ; `/etc/orasso/api.env` (root 600) en prod ; `env.ts` échoue au démarrage si une variable obligatoire manque ou si `DEV_SKIP_2FA` est posé en production. Rotation des clés QR § 3.1.
E-mails : `MailService.send(template, to, payload)` → `email_outbox` → transport `journal` (fichier `.data/mail/<date>-<id>.html` + console) ou `brevo` ; modèles en français dans `modules/notifications/templates/`.
Stockage : `StorageService.put(key, buffer, contentType)`, `url(key)` ; `disk` écrit dans `.data/storage/` et sert via `/api/files/*` ; `s3` OVH avec URLs publiques en lecture (photos de véhicules et affiches sont publiques par nature ; justificatifs **[plus tard]** en URL signée).
Notifications : `NotificationService.notify(userId, type, payload)` → ligne `notifications` (`deliver_after` = now, ou 08:00 si heures calmes et pas jour J, ou immédiat pour `staff_alert`) → tâche `notifications.deliver` → push si appareil et préférence, e-mail si pas d'appareil actif ou type e-mail obligatoire (`event_reminder_week`, `staff_presence_reminder`, sécurité du compte) → WS `user:{id}`.
Sentry : SDK Node pointé sur GlitchTip (DSN optionnel), `tracesSampleRate 0.1`, identifiants d'utilisateur = `user.id` seulement, jamais e-mail ni plaque dans les événements (scrubber sur `plate`, `phone`, `email`).

---

## 7. Découpage d'implémentation

### Lot 05 — API A (dans cet ordre, chaque étape testée avant la suivante)
1. Copier ce fichier à la racine du dépôt (`ARCHITECTURE.md`) ; recopier § 8 dans `docs/JOURNAL-DES-CHOIX.md`.
2. `packages/shared` : `enums.ts`, `labels.fr.ts`, `rules/` (transitions, deadline, lock, registrationWindow, grades), schémas zod des domaines du lot.
3. Migrations (faites : numérotées `0001` à `0007`, le socle n'ayant que `0000_auth`) : `0001_profiles` (profiles, profile_interests, categories, devices) · `0002_structures` (structures, structure_members, structure_follows, structure_bans) · `0003_vehicles` (référentiel, vehicles, vehicle_photos, vehicle_categories, plate_transfer_requests) · `0004_events` (events, event_days, event_zones, event_invitations) · `0005_applications` (applications, application_events) · `0006_notifications` (notifications, email_outbox) · `0007_admin` (admin_audit_log). Le lot 06 commence donc à `0008_access`. Un fichier Drizzle par étape, noms de contraintes explicites.
4. `lib/` : errors, pagination, clock, mail (journal), storage (disk), push (squelette), jobs (registre), realtime, auth middlewares, 2FA (plugin Better Auth `twoFactor`, obligatoire dès qu'un utilisateur est `owner`/`co_organizer`/`moderator`/`super_admin` : routes `org`/`adm` renvoient `403 two_factor_required` tant qu'il n'est pas activé ; `DEV_SKIP_2FA`).
5. Modules : profiles → vehicles (référentiel seedé) → structures → events → applications (création, tri, liste d'attente, désistement, verrouillage, avant-première) → notifications (journal + e-mail) → admin (vérification, audit).
6. Tâches pg-boss : `waitlist.offer-expire`, `event.lock`, `event.preview-open`, `event.reminder-week`, `event.reminder-eve`, `notifications.deliver`.
7. Seed `pnpm db:seed` (idempotent, `--reset`), repris des données du prototype validé : catégories ; référentiel véhicules (≈ 40 marques, 200 modèles, générations principales, « Autre » partout) ; super admin `damien@orasso.local` (pseudo `Damien_66`, 66, Sport 340 pts) ; structure **MéditeSportCar** (association, Canet-en-Roussillon, département 66, `verified`, owner Damien, un co-organisateur, staffs `Julie_66` (scan + super_staff), `Marc_66` (control), `Nina_34` (placement), `Theo_66` (scan)) ; événement **« Nocturne de Canet »** (`night`, slug `nocturne-de-canet-2026`, dans 2 jours 19:00–23:00, « Parking du port, Canet-en-Roussillon », `capacity 150`, `admission filtered`, `max_vehicles_per_user 2` (le prototype dit « Limite : 2 par personne »), `preview_hours 24`, `lock_offset 120`, consignes « Musique coupée à 22 h, respectez le voisinage. / Départs au pas, aucun burn, exclusion immédiate. / Travaux sur la D81 : prévoyez 10 min de plus. », zones `JDM` (30), `YNG` « Youngtimer » (22), `SPT` « Sportive » (15), `LIB` « Libre » (40)) ; passionnés `Kenji_66` (Toyota Supra MK4 1997, 330 ch, AB-123-CD), `Lea_11` (Mazda RX-7 FD 1994), `Nina_34` (Honda S2000 AP1 2001), `Marc_66` (Peugeot 205 GTI 1.9 1990), `Julie_66` (BMW E30), `Theo_66` (Golf GTI mk2), Damien (Nissan 200SX S14 1996 250 ch + BMW Série 3 E36 1995 193 ch + Peugeot 106 Rallye `sold`), plus 12 comptes générés (départements 66/11/34/31, dont un véhicule « Autre », une moto, un `unregistered`), 1–3 photos factices chacun ; candidatures : 27 `pending`, 116 `accepted` (zones réparties) — ou proportionnellement réduit (`--small` : 5/20/6/3) —, 12 `waitlisted` ordonnées, 1 `offered` (échéance dans 20 h), 9 `refused` (motifs), 1 `withdrawn`. Autres événements : **« Expo Rivesaltes »** (`exhibition`, dans 10 jours, 40 places), **« C&C Perpignan »** (`cars_and_coffee`, dans 17 jours, sans limite, `admission open`), **« Hivernale 2027 »** `draft`.
8. Scénario `scenario-parcours1-a.ts` (critère de fin du lot) : fait sous forme de test d'intégration, `apps/api/test/scenario-parcours1-a.test.ts`.

**État après le lot 05 (écarts au plan, détail dans `docs/JOURNAL-DES-CHOIX.md`)** : code dans `apps/api/src/` — `env.ts`, `auth.ts`, `app.ts`, `jobs.ts`, `ws.ts` à la racine de `src/` (pas de `config/`) ; `lib/` = `access.ts` (droits, 2FA), `session.ts`, `deps.ts` (horloge et file de tâches remplaçables), `tx.ts` (`withTx` + effets après validation), `errors.ts`, `validate.ts`, `pagination.ts`, `mail.ts`, `storage.ts`, `push.ts`, `realtime.ts`, `format.ts`, `slug.ts` ; `modules/<domaine>/` = `routes.ts`, `service.ts`, `repo.ts` quand des requêtes sont réutilisées, `queries.ts` (lecture des candidatures), `jobs.ts` (événements). Tests de l'API sur une base dédiée `<base>_test` créée et migrée par `apps/api/test/global-setup.ts`, outils dans `apps/api/test/helpers.ts`. Le seed planifie les tâches pg-boss comme une vraie publication (`startJobs({ work: false })`). Lot 06 : brancher l'émission et la révocation des pass dans `applications/service.ts` (`transition` vers/depuis `accepted`), le rappel `staff_sync_reminder` dans `lockEvent`, et les absences du tri (`absencesCount`) sur les pointages.

### Lot 06 — API B
1. `shared/qr` (+ tests), `rules/points`.
2. Migrations : `0009_access` (signing_keys, access_passes) · `0010_staff` (event_staff) · `0011_checkins` (scan_events, checkins, express_invites) · `0012_points` (seasons, point_entries, malus_contests) · `0013_field` (incidents, staff_alerts) · `0014_account_qr` (colonnes `account_qr_short_id`, table `account_qr_uses`).
3. Modules : access (clés, émission à l'acceptation — hook dans `ApplicationService`, révocation) → staff (event_staff à la publication, présence, relances, sync signée avec delta) → checkins (scans idempotents, doublons, pointage manuel/plaques, rapport, live WS, express) → points (settle J+2, contestation, grades, saison) → account-qr.
4. Tâches : `event.settle`, `staff.remind`, `season.rollover` ; `staff_sync_reminder` branché dans `event.lock`.
5. Seed complété : événement **« Salon Argelès »** (`show`) aujourd'hui (début dans 1 h, donc verrouillé, `locked_at` posé), 112 `accepted` avec pass émis (ou 30 en `--small`), 4 zones, 6 `event_staff` dont 4 `present`, 38 `checkins` (36 scan, 2 manual), un doublon inter-appareils dans `scan_events`, un événement passé **« Nocturne 2025 »** réglé (`settled_at`), avec participations, 2 malus dont 1 contesté. Saison courante créée.
6. Scénario `scenario-parcours1-b.ts` (critère de fin du lot) ; script `verify-pass-offline.ts` qui vérifie un pass avec la seule clé publique, hors API.

**État après le lot 06 (écarts au plan, détail dans `docs/JOURNAL-DES-CHOIX.md`, section lot 06)** :
- Migrations `0008_access` à `0013_account_qr` (numérotation décalée d'un cran, comme au lot 05). `access_passes` : unicité `(application_id)` **partielle** (`where revoked_at is null`) pour garder l'ancien pass `replaced` à côté du nouveau ; motif de révocation `refused` ajouté (`withdrawn | refused | cancelled | banned | replaced`). `scan_events` : `device_id` et `staff_user_id` nullables (`set null` à la suppression d'un compte), colonne `application_id` ajoutée (rapport). `seasons.opened_at` (report de saison appliqué une fois). `point_entries` : index uniques aussi pour `staff` (`event_id, user_id`) et `season_carryover` (`user_id, season_id`). `profiles.account_qr_short_id` rempli en SQL pour les profils existants.
- Code : `packages/shared/src/qr/` (`bytes`, `pass` avec `decideScan`, `account`, `canonical`), `rules/points.ts`, `schemas/access.ts` (types et schémas des routes du lot) ; API : `lib/signing.ts`, modules `access`, `staff`, `checkins` (+ `express.ts`), `field` (alertes, main courante), `points`, `account-qr` ; scripts `keys-generate.ts`, `verify-pass-offline.ts`.
- Clés : `QR_SIGNING_KEYS` (JSON, graines de 32 octets en base64) et `QR_SIGNING_ACTIVE_KID`, obligatoires en production ; hors production, clé de démonstration publique `kid 0` si absentes. L'API recopie les clés publiques dans `signing_keys` au démarrage et refuse de démarrer si un `kid` connu a changé de clé. `GET /api/keys` → `{keys: [{kid, algorithm, publicKey (base64url), activeFrom, retiredAt}]}`.
- Pass : émis et révoqués dans `ApplicationService.transition()` (toute entrée dans / sortie de `accepted`, y compris annulation et inscription express). `GET /applications/:id/pass` émet à la lecture une retenue sans pass (données antérieures) ; `payload` est `null` pour un pass révoqué.
- Synchro staff (§ 4.1) : une entrée par pass (valides et révoqués) ; champs ajoutés `full`, `event.plateSalt` (base64url), `signatureKid`, `plate` (organisateur seulement) ; `removedPassIds` toujours vide (rien n'est supprimé) ; `since` inclusif (une entrée peut revenir). Signature : Ed25519 du SHA-256 de `accessListSigningText(corps)` = JSON canonique de **tout** le corps sauf `signature` et `signatureKid` (plus large que « entrées + generatedAt + eventNo »). Disponible dès la publication ; `event_staff.synced_at` posé à chaque synchro d'un staff.
- Scans (`POST /events/:id/scans`) : `deviceId` doit être un appareil non révoqué du staff qui envoie ; éléments `kind: scan` (lecture) ou `manual | plate` (pointage fait hors ligne). Résultats : `rejected` (refus de l'appareil, pass révoqué, candidature plus retenue, ou `unknown_pass` sans « accepter quand même »), `unknown` (pass introuvable ou d'un autre événement), `accepted`, `duplicate_*`. Écritures de pointage acceptées **de la veille 00:00 jusqu'au règlement de J+2** (le mode staff de l'appli se ferme à J+1, l'API laisse rattraper le pointage). Un verrou consultatif par événement sérialise les écritures.
- Temps réel : `access.changed` porte `{applicationIds}` (et non `passIds`) ; `live` publié à chaque entrée, présence et alerte ; `staff.presence` et `alert` sur le canal `access`.
- Inscription express : lien 24 h (`/express/<token>`, rendu aussi au staff), possible de la veille à J+1 ; le formulaire crée compte, véhicule **sans photo**, candidature retenue hors capacité, pass **et entrée `express`** ; refusé si l'e-mail a déjà un compte ou si la plaque est active ailleurs.
- Points : `event.settle` planifié avec les autres tâches d'un événement (toujours, même passé) ; balayage horaire `points.sweep` (règlements et escalades échus) ; saison = celle de la date du règlement ; `contest.escalate` à +7 j ; décision de l'organisateur (`/malus-contests/:id/decide`) ou de l'administration (`/admin/malus-contests`, journalisée) ; `POST /admin/users/:id/points-adjust`. `MyApplication` gagne `checkedInAt`, `pointsPending`, `points`, `malus` ; `absencesCount` du tri = malus non annulés.
- Staff : `staffAccess(v, structureId, roles, eventId)` applique les rôles et `can_decide` de l'événement ; lignes `event_staff` créées à la publication et à chaque lecture (nouveaux membres). Relance `staff.remind` une fois par jour et par personne, jamais le jour J.
- Terrain : `POST/GET /events/:id/alerts` (+ `/alerts/:id/resolve`), `POST/GET /events/:id/incidents` en JSON, idempotents par `clientId` ; la photo d'un incident viendra avec son écran (colonne prête).
- Seed : complète une base existante ; l'événement passé s'appelle « Nocturne de rentrée » (il y a 5 jours, pour qu'un malus soit encore contestable) au lieu de « Nocturne 2025 ».
- **Corrections après relecture** (remplacent ce qui précède sur ces points) : migrations `0014` (événements terminés avant le lot 06 marqués réglés, sans points), `0015` (déclencheur qui remplit `account_qr_short_id`), `0016` (`signing_keys.revoked_at`). Balayage `points.sweep` : règlements manqués depuis moins de 14 jours, escalades, report de saison. Synchro : curseur 10 s en retrait de l'heure système ; pour un staff, synchro, liste et recherche de la veille 00:00 au règlement de J+2 seulement (403 sinon ; l'organisation toujours) ; entrée révoquée réduite à `passId`, `applicationId`, `status`, `revokedReason`, `pseudo`. Clé compromise : `keys:revoke <kid>` (exclue de `/keys`, de la synchro et de la vérification serveur ; QR valides réémis avec la clé active, motif `replaced`) ; en production, refus du `kid 0` / de la clé de démonstration. Verrou consultatif `checkins:<eventId>` pris aussi par le règlement (avant la ligne de l'événement) et par l'express ; après règlement, lot refusé élément par élément (`reason: "settled"`). Heure de lecture gardée dans [veille 00:00, J+2[ et ≤ réception + 5 min. Rejeu par `clientId` limité à l'auteur et à l'événement. Express : 30 invitations par staff et par heure.

**État après le lot 10 (appli, mode staff hors ligne ; détail dans `docs/JOURNAL-DES-CHOIX.md`, section lot 10)** :
- Code : `apps/mobile/src/lib/staff/` — `crypto.ts` (Ed25519 `@noble/ed25519` en vérification stricte `zip215: false`, SHA-256, hachage de plaque identique à l'API), `trust.ts` (clés de confiance), `model.ts` (fusion des synchros, décision, anti-rebond, recherche, compteurs, file, rapport ; pur, testé), `store.ts` (SQLite derrière une petite interface `SqlDb`, testée avec `node:sqlite`), `db.ts`, `runtime.ts` (synchro, file, envoi, purge), `useStaff.ts` ; écrans `apps/mobile/src/app/staff/[id]/` (`index` entrée, `scan`, `liste`, `placement`) et `apps/mobile/src/features/staff/` (feuilles express, plaque ou pseudo, alerte, main courante ; envoi en arrière-plan `StaffBackground` monté à la racine).
- Clés de confiance (relecture du lot 06, M9) : la signature de la liste n'est jamais vérifiée avec les `keys` de la même réponse. Les clés viennent de `GET /api/keys` (appel séparé, session du staff) et remplacent l'ensemble précédent (une clé révoquée disparaît) ; une clé connue dont le `kid` changerait de valeur fait refuser la mise à jour ; si le build épingle des clés (`EXPO_PUBLIC_QR_TRUSTED_KEYS`), seules celles-là sont acceptées. La clé de démonstration (`kid 0` ou sa valeur sous un autre kid) n'est acceptée que si l'API configurée est locale (`http://` sur localhost, 127.0.0.1, 10.0.2.2 ou réseau privé) : jamais pour https://dev.orasso.fr.
- Stockage (§ 4.2, écarts) : `staff_events (event_id, user_id, meta_json, synced_at, ends_at)`, `access_entries (event_id, pass_id, application_id, entry_json)` sans colonnes d'index (la liste est chargée en mémoire, la recherche ne touche pas le disque), `signing_keys`, `pending_actions (… event_title, next_attempt_at, result_json)`, `local_checkins` clé `(event_id, pass_id)` (un « accepté quand même » n'a pas de candidature connue). Les données d'un autre compte ne sont jamais montrées. Une liste dont `generatedAt` est antérieur à celle gardée est refusée.
- Synchro : complète si le téléphone n'a rien ou sur « Synchroniser la liste », différentielle sinon (`since = cursor`) ; `removedPassIds` ignoré (toujours vide) : écrasement par `passId`, une synchro complète remplace tout (M10). Différentielle automatique toutes les minutes en ligne (pas de WebSocket dans l'appli en V1). Une synchro reçue après J+1 n'est pas gardée.
- File (§ 4.4) : `kind` `scan | manual | plate` par lots de 200 sur `POST /events/:id/scans` (`deviceId` du corps et en-tête `x-device-id` : appareil enregistré une fois par compte et gardé dans le trousseau, réenregistré si l'API ne le connaît plus) ; `presence`, `express`, `incident`, `alert` sur leurs routes (incident et alerte idempotents par `clientId` = id de l'action). Déclencheurs : ouverture, retour du réseau (délai remis à zéro), toutes les 30 s ; essais 5 s → 5 min ; 401 : la file attend la reconnexion ; lot refusé en bloc (400) : renvoyé élément par élément, l'élément illisible sort avec son erreur ; `rejected` + `settled` : retiré. Réponse : pointage local aligné sur l'heure retenue par le serveur, retiré si le serveur refuse la lecture qui l'avait créé.
- Purge : à `ends_at + 1 jour` (ouverture de l'appli, toutes les 30 s, ouverture du mode staff) et à la déconnexion : liste, coordonnées, pointages locaux, historique envoyé, clés ; les actions non envoyées restent (« N envois du staff à faire » dans Accès).
- Recette web : expo-sqlite en WebAssembly (`metro.config.js` : `wasm` en ressource) dans une page isolée (relais `apps/mobile/scripts/web-isolated.mjs` qui pose COOP/COEP) ; injection d'une lecture en développement seulement (`__orassoScan`, champ « Recette »).
- API : aucun changement. Design system : `ScanResult` plein écran corrigé pour react-native-web (bloc de texte en `flex: 0` écrasé).
Lots 07, 09, 10 consomment `packages/shared/api` (chemins, schémas, types) ; aucun libellé n'est écrit dans un écran sans passer par `labels.fr.ts`.

---

## 8. Points non tranchés par les docs — choix retenus

À recopier dans `docs/JOURNAL-DES-CHOIX.md` (lot 05).

| # | point | choix | raison |
|---|---|---|---|
| C1 | Statut d'une offre de place non acceptée à temps | statut terminal `expired` (pas de retour en fin de liste) | prévisible, cohérent avec « ceux qui candidatent tard sont désavantagés » ; l'organisateur peut toujours re-retenir à la main |
| C2 | Délai raccourci « 2 à 3 h » | 3 h la veille, 2 h le jour J, plafonné au verrouillage, pas d'offre si < 30 min restantes, horloge décalée à 08:00 en heures calmes hors jour J | règle unique et testable ; évite des offres que personne ne peut voir |
| C3 | Désistement après verrouillage | autorisé jusqu'à la fin, marqué `withdrawn_after_lock`, malus à J+2, pas de réoffre | lecture littérale de « sans malus jusqu'au verrouillage » ; l'organisateur garde l'information ; la contestation permet de lever le malus |
| C4 | Liste d'attente sur un événement sans limite de places | aucune offre automatique ; liste manuelle | sans `capacity`, il n'y a pas de « place libérée » |
| C5 | Nombre de véhicules par personne par défaut | 1, réglable par événement | équité des places ; l'organisateur l'augmente s'il veut |
| C6 | Statut Maintenu / Incertain / Annulé | `outlook` (`maintained`/`uncertain`) distinct de `status` (`cancelled`) | « Annulé » est irréversible et vide les candidatures ; « Incertain » ne change rien |
| C7 | Recherche par plaque par le staff alors que « la plaque n'est visible que par l'organisateur » | la liste synchronisée porte un hachage de la plaque normalisée et ses 3 premiers caractères, jamais la plaque entière | la recherche et le pointage par préfixe du prototype marchent hors ligne ; la plaque complète ne quitte pas le serveur (voir A10) |
| C8 | QR valide mais absent de la liste locale (inscription express d'un collègue) | résultat `unknown_pass` avec bouton « Accepter quand même » tracé | ne bloque pas l'entrée, reste visible au rapport |
| C9 | Résolution des doublons entre appareils | premier `scanned_at` gagne ; réécriture si un scan plus ancien arrive ensuite | un véhicule entre une fois ; l'heure d'entrée réelle est conservée |
| C10 | Saison | année civile | simple ; la plupart des événements sont de mars à octobre |
| C11 | Barème et seuils | +20 participation, +20 staff, +10 parrainage, −10 malus ; 0/100/300/400/800 | chiffres du prototype validé (feuille « Points et grade ») ; les planches hésitent entre 400 et 500 pour Circuit : 400 retenu (prototype) ; constante partagée |
| C27 | Champs « Accompagnants » et « Message » du formulaire (prototype) | colonnes `companions`, `message` (≤ 120) | ce ne sont pas des questions personnalisées de l'organisateur ; utiles au tri |
| C28 | Contestation sans réponse de l'organisateur | escalade à l'administration après 7 jours | texte du prototype ; évite un malus qui reste en suspens |
| C12 | Fenêtre de contestation (« quelques jours ») | 7 jours après l'écriture du malus (J+2 → J+9) | assez long pour les vacances, assez court pour clore |
| C13 | Points staff « vérifiables » | présence déclarée `present` au moment de J+2, modifiable par l'organisateur jusque-là | pas d'autre preuve disponible en V1 |
| C14 | Fenêtre du mode staff | J−1 00:00 → `ends_at` + 1 jour ; mode jour J participant idem | « à partir de la veille », « fermé à J+1 » |
| C15 | Heures calmes | 22:00–08:00 Paris, levées le jour J et pour les alertes staff | « pas de notification la nuit, sauf le jour J » |
| C16 | Motifs de refus | constante partagée de 9 codes | la liste administrable viendra avec l'admin (lot 13) |
| C17 | Catégories | une seule table pour véhicules, événements et centres d'intérêt, avec âge minimal | une liste à maintenir, et les affinités se calculent par simple intersection |
| C18 | Motorisation | texte court en V1 ; référentiel de motorisations plus tard | la « base construite par Orasso » n'existe pas encore |
| C19 | Zones | attribuées à la main par l'organisateur (tri) ou le staff placement ; pas de règle automatique | docs : « le staff placement voit qui va où » |
| C20 | Format du QR d'inscription | `OR1` + base64url (22 octets signés + 64 de signature), version 6 | compact, préfixe de rejet rapide, pas d'URL pour rester petit |
| C21 | QR de compte | HOTP 60 s, 8 chiffres, identifiant court dérivé, fenêtre ±1, anti-rejeu 3 min | « comme une appli de double authentification » ; vérification côté serveur par le pro |
| C22 | Horodatage des scans | horloge de l'appareil, corrigée si > 24 h d'écart avec la réception | les files hors ligne peuvent attendre des heures |
| C23 | Dates de « pointage en attente » | entre `ends_at` et `settled_at` | J+2 vient des docs, l'affichage découle de `settled_at` |
| C24 | Géographie | lat/lng + boîte englobante, sans PostGIS | suffisant pour « autour de moi » par département/rayon |
| C25 | Lignes `event_staff` | créées à la publication pour tout le staff actif, puis à chaque nouveau staff | nécessaire pour les relances « je suis là » |
| C26 | Suppression d'un véhicule | réelle s'il n'a jamais candidaté, sinon archivage obligatoire | historique des événements conservé |

### À revoir avec Damien
- **A1 (sécurité / RGPD)** — La liste synchronisée met en cache sur les téléphones du staff les pseudos, véhicules, hachages de plaque et, pour le super staff, les coordonnées. Purge à J+1 et stockage SQLite non chiffré par défaut : accepter, ou chiffrer la base (SQLCipher) et retirer les coordonnées du cache (consultation en ligne seulement).
- **A2 (terrain)** — La règle littérale « désistement après verrouillage = malus » pénalise la panne ou l'accident du jour même ; la contestation couvre le cas, mais c'est une démarche. Alternative : laisser l'organisateur exempter sans contestation (bouton « Excuser » sur la liste des absents à J+1).
- **A3 (terrain)** — « Plusieurs staffs sans aucun réseau » : le doublon est accepté comme rare ; mais sans réseau du tout, l'inscription express ne fonctionne pas (e-mail à envoyer) et la liste ne reçoit pas les ré-acceptations tardives. La « connexion à l'entrée (Starlink) » devient une consigne d'organisation à écrire dans le kit terrain.
- **A4 (terrain)** — QR version 6 lu à travers un pare-brise : dépend du reflet et de la luminosité ; à tester sur de vrais téléphones avant le premier événement. Repli prévu : plaque ou pseudo, express, pointage par plaque après coup.
- **A5 (sécurité)** — 2FA obligatoire pour tout `owner`/`co_organizer` : un président qui perd son téléphone ne trie plus. Prévoir les codes de secours de Better Auth à l'activation et une procédure de réinitialisation par le super admin tracée au journal.
- **A6 (produit)** — Barème et seuils de points provisoires (C11) et offre expirée terminale (C1) : décisions à confirmer ou corriger ; constantes isolées pour changer sans migration.
- **A7 (juridique, déjà « en discussion »)** — Case « Suivre l'organisateur » cochée d'office, coordonnées visibles de l'organisateur, conservation au-delà de J+7 : le schéma trace tout (`admin_audit_log`, `structure_follows.source`) mais le texte d'information à l'utilisateur reste à écrire avec un juriste.
- **A8 (produit)** — Événement sans limite de places mais « sur filtration » : la liste d'attente n'a pas de sens automatique (C4). Vérifier que c'est bien l'usage voulu, ou imposer une capacité dès que `admission = filtered`.
- **A9 (sécurité)** — Le QR de compte renvoie pseudo + grade à tout utilisateur connecté qui le scanne (informations déjà publiques). Si on veut le réserver aux pros, restreindre la route au lot 14.
- **A10 (contradiction docs / prototype)** — Le prototype validé affiche la plaque en clair dans la liste du staff (« Zone JDM · AB-123-CD ») et sur l'écran 2/3 de candidature (« Plaque · orga seul »), alors que docs/01 réserve la plaque à l'organisateur. Choix : préfixe de 3 caractères + hachage pour le staff (C7). Si Damien préfère la plaque entière pour le staff `scan`/`control`, c'est un champ de plus dans la synchro, rien d'autre ne change.
- **A11 (contradiction docs / prototype)** — Le prototype écrit « Tu peux te désister jusqu'à la veille » et « le jour même, −10 points » ; docs/01 dit « jusqu'au verrouillage (2 h avant le début par défaut) ». Docs/01 l'emporte (C3) ; les libellés des écrans doivent afficher la date-heure de verrouillage calculée, pas « la veille ».
- **A12 (produit)** — Le prototype promet « Réponse sous 48 h · notification » après l'envoi d'une candidature. Aucune règle des docs ne l'impose : à retirer des écrans, ou à transformer en relance de l'organisateur à 48 h (tâche `triage.remind`, non prévue ici).
- **A13 (produit)** — « Invitation nominative : ta place est réservée 72 h » (prototype) : délai à confirmer au lot 13 (`event_invitations.expires_at`).
- **A14 (sécurité, ajout du coordinateur 15/10)** — Le hachage de plaque envoyé au staff (§ 4.1) ne protège pas réellement la plaque : l'espace des plaques est petit et la plaque se retrouve par force brute à partir du hachage, avec le sel présent sur l'appareil. En pratique, tout téléphone du staff synchronisé contient de quoi retrouver les plaques de l'événement jusqu'à la purge de J+1. C'est inévitable si l'on veut la recherche et le pointage par plaque **hors ligne** (docs/01). Parades retenues : sel propre à l'événement, purge à J+1, pas de plaque en clair dans l'interface du staff. À présenter honnêtement à Damien avec A1 (même sujet pour les coordonnées du super staff).
