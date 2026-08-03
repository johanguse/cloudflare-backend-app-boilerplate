ALTER TABLE `user` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `user` ADD `company` text;--> statement-breakpoint
ALTER TABLE `user` ADD `job_title` text;--> statement-breakpoint
ALTER TABLE `user` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `user` ADD `website` text;--> statement-breakpoint
ALTER TABLE `user` ADD `country` text;--> statement-breakpoint
ALTER TABLE `user` ADD `timezone` text;--> statement-breakpoint
ALTER TABLE `user` ADD `onboarding_completed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `onboarding_step` integer DEFAULT 0 NOT NULL;