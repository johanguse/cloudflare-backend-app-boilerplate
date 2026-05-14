CREATE TABLE `analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`analysis_type` text NOT NULL,
	`status` text DEFAULT 'done' NOT NULL,
	`photo_key` text NOT NULL,
	`result_json` text,
	`vision_model` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_analyses_user` ON `analyses` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_analyses_user_created` ON `analyses` (`user_id`,`created_at`);