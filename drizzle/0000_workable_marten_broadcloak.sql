CREATE TABLE `artifact_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text NOT NULL,
	`version` text NOT NULL,
	`content` text NOT NULL,
	`change_note` text DEFAULT 'Saved revision' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`kind` text NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`targets` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`version` text DEFAULT '1.0.0' NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'created' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_slug_unique` ON `artifacts` (`slug`);