CREATE TABLE `user_push_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`platform` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_user_push_devices_user` ON `user_push_devices` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_push_devices_user_token` ON `user_push_devices` (`user_id`,`token`);--> statement-breakpoint
ALTER TABLE `user` ADD `deleted_at` integer;