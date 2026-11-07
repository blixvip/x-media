import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const xReferences = sqliteTable('x_references', {
  ownerId:text('owner_id').notNull(),id:text('id').notNull(),postId:text('post_id').notNull(),sourceJson:text('source_json').notNull(),
  notes:text('notes').notNull().default(''),tagsJson:text('tags_json').notNull().default('[]'),favourite:integer('favourite').notNull().default(0),collectionId:text('collection_id'),revision:integer('revision').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),deletedAt:text('deleted_at'),
}, table=>[primaryKey({columns:[table.ownerId,table.id]}),uniqueIndex('x_references_owner_post').on(table.ownerId,table.postId),index('x_references_owner_updated').on(table.ownerId,table.deletedAt,table.updatedAt)]);
export const xReferenceCollections=sqliteTable('x_reference_collections',{
  ownerId:text('owner_id').notNull(),id:text('id').notNull(),name:text('name').notNull(),
},table=>[primaryKey({columns:[table.ownerId,table.id]}),uniqueIndex('x_reference_collections_owner_name').on(table.ownerId,table.name)]);
export const xReferenceAssets=sqliteTable('x_reference_assets',{
  id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),referenceId:text('reference_id').notNull(),kind:text('kind').notNull(),position:integer('position').notNull(),sourceUrl:text('source_url'),previewUrl:text('preview_url'),state:text('state').notNull().default('queued'),attempts:integer('attempts').notNull().default(0),nextAttempt:integer('next_attempt').notNull().default(0),lease:text('lease'),leaseUntil:integer('lease_until').notNull().default(0),objectKey:text('object_key'),mime:text('mime'),bytes:integer('bytes'),error:text('error'),
},table=>[uniqueIndex('x_reference_assets_owner_position').on(table.ownerId,table.referenceId,table.position),index('x_reference_assets_queue').on(table.state,table.nextAttempt,table.leaseUntil)]);
export const xReferenceUploads=sqliteTable('x_reference_uploads',{objectKey:text('object_key').primaryKey(),assetId:text('asset_id').notNull(),createdAt:integer('created_at').notNull()});
export const xAppAuthLimits=sqliteTable('x_app_auth_limits',{id:text('id').primaryKey(),attempts:integer('attempts').notNull(),expires:integer('expires').notNull()});

export const xRadarEvents = sqliteTable('x_radar_events', {
  id:text('id').primaryKey(),payload:text('payload').notNull(),firstSeen:integer('first_seen').notNull(),lastSeen:integer('last_seen').notNull(),importance:integer('importance').notNull(),
}, table=>[index('idx_radar_events_last_seen').on(table.lastSeen)]);
export const xRadarOutbox = sqliteTable('x_radar_outbox', {
  id:text('id').primaryKey(),payload:text('payload').notNull(),state:text('state').notNull().default('pending'),attempts:integer('attempts').notNull().default(0),nextAttempt:integer('next_attempt').notNull(),leaseUntil:integer('lease_until').notNull().default(0),claim:text('claim'),createdAt:integer('created_at').notNull(),
}, table=>[index('idx_radar_outbox_due').on(table.state,table.nextAttempt)]);
export const xRadarSamples = sqliteTable('x_radar_samples', {id:text('id').primaryKey(),observedAt:integer('observed_at').notNull(),value:integer('value').notNull()});
export const xRadarMonitorState = sqliteTable('x_radar_monitor_state', {id:text('id').primaryKey(),value:text('value').notNull()});

export const operatorLoginWindows = sqliteTable(
  "operator_login_windows",
  {
    clientKey: text("client_key").primaryKey(),
    attempts: integer("attempts").notNull(),
    resetsAt: integer("resets_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_operator_login_windows_resets_at").on(table.resetsAt)],
);

export const publicEvidenceItems = sqliteTable(
  "public_evidence_items",
  {
    itemKey: text("item_key").primaryKey(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    topic: text("topic").notNull(),
    niche: text("niche").notNull(),
    source: text("source").notNull(),
    sourceUrl: text("source_url").notNull(),
    relatedUrls: text("related_urls").notNull().default("[]"),
    creatorUsername: text("creator_username"),
    publishedAt: integer("published_at").notNull(),
    firstObservedAt: integer("first_observed_at").notNull(),
    lastObservedAt: integer("last_observed_at").notNull(),
  },
  (table) => [index("idx_public_evidence_items_last_observed").on(table.lastObservedAt)],
);

export const publicEvidenceObservations = sqliteTable(
  "public_evidence_observations",
  {
    itemKey: text("item_key")
      .notNull()
      .references(() => publicEvidenceItems.itemKey, { onDelete: "cascade" }),
    observedBucket: integer("observed_bucket").notNull(),
    observedAt: integer("observed_at").notNull(),
    observedMetrics: text("observed_metrics").notNull().default("{}"),
  },
  (table) => [
    primaryKey({ columns: [table.itemKey, table.observedBucket] }),
    index("idx_public_evidence_observations_time").on(table.observedAt),
    index("idx_public_evidence_observations_item_time").on(table.itemKey, table.observedAt),
  ],
);

export const publicEvidenceLinks = sqliteTable(
  "public_evidence_links",
  {
    canonicalUrl: text("canonical_url").notNull(),
    itemKey: text("item_key")
      .notNull()
      .references(() => publicEvidenceItems.itemKey, { onDelete: "cascade" }),
    matchedUrl: text("matched_url").notNull(),
    matchKind: text("match_kind", { enum: ["source_url", "related_url"] }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.canonicalUrl, table.itemKey] }),
    index("idx_public_evidence_links_item").on(table.itemKey),
  ],
);

export const xRadarDiscordDispatches = sqliteTable(
  "x_radar_discord_dispatches",
  {
    fingerprint: text("fingerprint").primaryKey(),
    eventId: text("event_id").notNull(),
    confirmation: text("confirmation").notNull(),
    sentAt: integer("sent_at").notNull(),
  },
  (table) => [index("idx_x_radar_discord_dispatches_sent_at").on(table.sentAt)],
);

export const xGrowthSettings = sqliteTable("x_growth_settings", {
  ownerId: text("owner_id").primaryKey(),
  profileJson: text("profile_json").notNull(),
  policyJson: text("policy_json").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const xGrowthQueue = sqliteTable(
  "x_growth_queue",
  {
    ownerId: text("owner_id").notNull(),
    id: text("id").notNull(),
    signalId: text("signal_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceText: text("source_text").notNull(),
    authorHandle: text("author_handle"),
    decisionJson: text("decision_json").notNull(),
    artifactJson: text("artifact_json"),
    state: text("state").notNull(),
    dueAt: integer("due_at"),
    expiresAt: integer("expires_at").notNull(),
    publishedUrl: text("published_url"),
    error: text("error"),
    claimToken: text("claim_token"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id] }),
    index("idx_x_growth_queue_owner_state_due").on(table.ownerId, table.state, table.dueAt),
    index("idx_x_growth_queue_owner_published").on(table.ownerId, table.updatedAt),
  ],
);

export const xOauthCredentials = sqliteTable("x_oauth_credentials", {
  ownerId: text("owner_id").primaryKey(),
  payloadJson: text("payload_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const xMasterDrafts = sqliteTable("x_master_drafts", {
  revision: integer("revision").notNull().default(1),
  ownerId: text("owner_id").notNull(), id: text("id").notNull(), sourceText: text("source_text").notNull().default(""), sourceUrl: text("source_url"), authorName: text("author_name"), authorHandle: text("author_handle"), body: text("body").notNull().default(""), format: text("format").notNull().default("post"), state: text("state").notNull().default("draft"), mediaId: text("media_id"), scheduledAt: integer("scheduled_at"), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.ownerId, table.id] }), index("idx_x_master_drafts_owner_state_updated").on(table.ownerId, table.state, table.updatedAt)]);

export const xMasterExtensionPairings = sqliteTable("x_master_extension_pairings", {
  ownerId: text("owner_id").notNull(), codeHash: text("code_hash").primaryKey(), expiresAt: integer("expires_at").notNull(), createdAt: integer("created_at").notNull(),
});

export const xMasterExtensionDevices = sqliteTable("x_master_extension_devices", {
  ownerId: text("owner_id").notNull(), id: text("id").notNull(), label: text("label").notNull(), tokenHash: text("token_hash").notNull().unique(), scopesJson: text("scopes_json").notNull(), createdAt: integer("created_at").notNull(), lastUsedAt: integer("last_used_at").notNull(), revokedAt: integer("revoked_at"),
}, (table) => [primaryKey({ columns: [table.ownerId, table.id] }), index("idx_x_master_devices_token_active").on(table.tokenHash, table.revokedAt)]);

export const xMasterMediaJobs = sqliteTable("x_master_media_jobs", {
  ownerId: text("owner_id").notNull(), id: text("id").notNull(), kind: text("kind").notNull(), sourceUrl: text("source_url").notNull(), title: text("title"), state: text("state").notNull(), resultJson: text("result_json"), error: text("error"), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.ownerId, table.id] }), index("idx_x_master_media_owner_state_updated").on(table.ownerId, table.state, table.updatedAt)]);

export const xMasterAuditLog = sqliteTable("x_master_audit_log", {
  ownerId: text("owner_id").notNull(), id: text("id").primaryKey(), action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id"), metadataJson: text("metadata_json").notNull().default("{}"), createdAt: integer("created_at").notNull(),
}, (table) => [index("idx_x_master_audit_owner_created").on(table.ownerId, table.createdAt)]);
