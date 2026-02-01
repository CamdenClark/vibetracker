CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`user_id` text NOT NULL,
	`team_id` text,
	`machine_id` text,
	`session_id` text NOT NULL,
	`event_type` text NOT NULL,
	`source` text NOT NULL,
	`session_cwd` text,
	`session_git_repo` text,
	`session_git_branch` text,
	`session_duration_ms` integer,
	`turn_index` integer,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`total_tokens` integer,
	`model` text,
	`tool_name` text,
	`tool_name_raw` text,
	`tool_input` text,
	`tool_output` text,
	`tool_duration_ms` integer,
	`tool_success` integer,
	`mcp_server` text,
	`mcp_tool_name` text,
	`file_path` text,
	`file_action` text,
	`file_lines_added` integer,
	`file_lines_removed` integer,
	`error_message` text,
	`error_code` text,
	`prompt_text` text,
	`agent_id` text,
	`agent_type` text,
	`meta` text,
	`synced_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_events_dedup` ON `events` (`session_id`, `timestamp`, `event_type`, COALESCE(`tool_name_raw`, ''), COALESCE(`tool_input`, ''));--> statement-breakpoint
CREATE INDEX `idx_events_timestamp` ON `events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_events_session` ON `events` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_events_synced` ON `events` (`synced_at`);--> statement-breakpoint
CREATE INDEX `idx_events_agent` ON `events` (`agent_id`);