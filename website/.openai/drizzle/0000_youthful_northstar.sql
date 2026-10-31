CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`token_hash` text NOT NULL,
	`token` text NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL,
	`status` text NOT NULL,
	`confirmation` text,
	`sending_at` integer,
	`sent_at` integer,
	`email_id` text
);
--> statement-breakpoint
CREATE TABLE `lookup_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
