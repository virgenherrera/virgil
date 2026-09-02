CREATE TABLE `lifecycle_transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text NOT NULL,
	`previous_state` text NOT NULL,
	`new_state` text NOT NULL,
	`timestamp` integer NOT NULL,
	`metric_snapshot` text,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lifecycle_transitions_artifact_idx` ON `lifecycle_transitions` (`artifact_id`);--> statement-breakpoint
CREATE INDEX `lifecycle_transitions_timestamp_idx` ON `lifecycle_transitions` (`timestamp`);