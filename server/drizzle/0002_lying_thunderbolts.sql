DROP INDEX IF EXISTS "player_timeline_account_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "player_timeline_hero_idx";--> statement-breakpoint
CREATE INDEX "bracket_nodes_effective_time_idx" ON "bracket_nodes" USING btree ((coalesce(nullif("actual_time", 0), nullif("scheduled_time", 0))));--> statement-breakpoint
CREATE INDEX "matches_backfill_idx" ON "matches" USING btree ("backfill_next_at") WHERE "matches"."ingest_status" = 'awaiting_parse';--> statement-breakpoint
CREATE INDEX "matches_status_start_idx" ON "matches" USING btree ("ingest_status","start_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "series_effective_time_idx" ON "series" USING btree ((coalesce(nullif("start_time", 0), nullif("scheduled_time", 0))));