CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_type` text NOT NULL,
	`provider_instance_id` text NOT NULL,
	`canonical_uri` text NOT NULL,
	`display_name` text NOT NULL,
	`auth_scope` text,
	`content_hash` text,
	`etag` text,
	`content_length` integer,
	`last_modified` text,
	`ttl_seconds` integer,
	`is_stale` integer DEFAULT false NOT NULL,
	`last_checked_at` text,
	`last_successful_refresh_at` text,
	`last_failure_at` text,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`refresh_interval_seconds` integer NOT NULL,
	`next_refresh_due_at` text,
	`discovered_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_identity_unique` ON `sources` (`provider_type`,`provider_instance_id`,`canonical_uri`);--> statement-breakpoint
CREATE INDEX `sources_content_hash_idx` ON `sources` (`content_hash`);--> statement-breakpoint
CREATE INDEX `sources_next_refresh_due_idx` ON `sources` (`next_refresh_due_at`);--> statement-breakpoint
CREATE INDEX `sources_provider_type_idx` ON `sources` (`provider_type`);--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`content_length` integer NOT NULL,
	`content_type` text NOT NULL,
	`title` text NOT NULL,
	`source_uri` text NOT NULL,
	`normalized_content` text NOT NULL,
	`lifecycle_state` text DEFAULT 'hot' NOT NULL,
	`provider_id` text NOT NULL,
	`provider_capability` text NOT NULL,
	`discovered_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_content_hash_unique` ON `artifacts` (`content_hash`);--> statement-breakpoint
CREATE INDEX `artifacts_source_id_idx` ON `artifacts` (`source_id`);--> statement-breakpoint
CREATE INDEX `artifacts_provider_id_idx` ON `artifacts` (`provider_id`);--> statement-breakpoint
CREATE INDEX `artifacts_lifecycle_state_idx` ON `artifacts` (`lifecycle_state`);--> statement-breakpoint
CREATE TABLE `provenance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text NOT NULL,
	`source_id` text NOT NULL,
	`source_uri` text NOT NULL,
	`fetched_at` text NOT NULL,
	`fetched_by` text NOT NULL,
	`content_hash_at_fetch` text NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `provenance_records_artifact_idx` ON `provenance_records` (`artifact_id`);--> statement-breakpoint
CREATE INDEX `provenance_records_source_idx` ON `provenance_records` (`source_id`);--> statement-breakpoint
CREATE INDEX `provenance_records_fetched_at_idx` ON `provenance_records` (`fetched_at`);--> statement-breakpoint
CREATE TABLE `chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`content` text NOT NULL,
	`position` integer NOT NULL,
	`start_offset` integer NOT NULL,
	`end_offset` integer NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chunks_artifact_position_unique` ON `chunks` (`artifact_id`,`position`);--> statement-breakpoint
CREATE INDEX `chunks_artifact_id_idx` ON `chunks` (`artifact_id`);--> statement-breakpoint
CREATE INDEX `chunks_content_hash_idx` ON `chunks` (`content_hash`);--> statement-breakpoint
CREATE TABLE `embedding_meta` (
	`id` text PRIMARY KEY NOT NULL,
	`chunk_id` text NOT NULL,
	`model_id` text NOT NULL,
	`dimensions` integer NOT NULL,
	`generated_at` text,
	`status` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`chunk_id`) REFERENCES `chunks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `embedding_meta_chunk_id_unique` ON `embedding_meta` (`chunk_id`);--> statement-breakpoint
CREATE INDEX `embedding_meta_status_idx` ON `embedding_meta` (`status`);--> statement-breakpoint
CREATE TABLE `relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`source_artifact_id` text NOT NULL,
	`target_artifact_id` text NOT NULL,
	`relationship_type` text NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `relationships_unique_edge` ON `relationships` (`source_artifact_id`,`target_artifact_id`,`relationship_type`);--> statement-breakpoint
CREATE INDEX `relationships_source_idx` ON `relationships` (`source_artifact_id`);--> statement-breakpoint
CREATE INDEX `relationships_target_idx` ON `relationships` (`target_artifact_id`);--> statement-breakpoint
CREATE INDEX `relationships_type_idx` ON `relationships` (`relationship_type`);--> statement-breakpoint
CREATE TABLE `task_associations` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text NOT NULL,
	`task_id` text NOT NULL,
	`task_provider_type` text NOT NULL,
	`association_type` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_associations_unique` ON `task_associations` (`artifact_id`,`task_id`,`association_type`);--> statement-breakpoint
CREATE INDEX `task_associations_artifact_idx` ON `task_associations` (`artifact_id`);--> statement-breakpoint
CREATE INDEX `task_associations_task_idx` ON `task_associations` (`task_id`);