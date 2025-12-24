CREATE TABLE `agents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` text NOT NULL,
	`session_id` text NOT NULL,
	`provider` text NOT NULL,
	`parent_message_uuid` text,
	`subagent_type` text,
	`prompt` text,
	`status` text,
	`model` text,
	`total_duration_ms` integer,
	`total_tokens` integer,
	`total_tool_calls` integer,
	`started_at` text,
	`completed_at` text,
	`provider_metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`session_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_agent_id_unique` ON `agents` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_agents_agent_id` ON `agents` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_agents_session` ON `agents` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_agents_type` ON `agents` (`subagent_type`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`provider` text NOT NULL,
	`message_uuid` text NOT NULL,
	`parent_uuid` text,
	`role` text NOT NULL,
	`content` text,
	`model` text,
	`stop_reason` text,
	`is_sidechain` integer DEFAULT 0,
	`agent_id` text,
	`timestamp` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`input_tokens` integer,
	`output_tokens` integer,
	`cache_read_tokens` integer,
	`cache_creation_tokens` integer,
	`reasoning_tokens` integer,
	`provider_metadata` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`session_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_message_uuid_unique` ON `messages` (`message_uuid`);--> statement-breakpoint
CREATE INDEX `idx_messages_session_id` ON `messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_uuid` ON `messages` (`message_uuid`);--> statement-breakpoint
CREATE INDEX `idx_messages_parent` ON `messages` (`parent_uuid`);--> statement-breakpoint
CREATE INDEX `idx_messages_agent` ON `messages` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_timestamp` ON `messages` (`timestamp`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`provider` text NOT NULL,
	`project_path` text,
	`git_branch` text,
	`started_at` text,
	`last_activity_at` text,
	`model_provider` text,
	`provider_metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_session_id_unique` ON `sessions` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_session_id` ON `sessions` (`session_id`);--> statement-breakpoint
CREATE TABLE `tool_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` integer NOT NULL,
	`session_id` text NOT NULL,
	`provider` text NOT NULL,
	`agent_id` text,
	`tool_use_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`tool_input` text,
	`tool_result` text,
	`is_error` integer DEFAULT 0,
	`duration_ms` integer,
	`timestamp` text,
	`provider_metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`session_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tool_calls_tool_use_id_unique` ON `tool_calls` (`tool_use_id`);--> statement-breakpoint
CREATE INDEX `idx_tool_calls_tool_name` ON `tool_calls` (`tool_name`);--> statement-breakpoint
CREATE INDEX `idx_tool_calls_session` ON `tool_calls` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_tool_calls_agent` ON `tool_calls` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_tool_calls_timestamp` ON `tool_calls` (`timestamp`);