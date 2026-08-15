CREATE TABLE "bracket_nodes" (
	"league_id" bigint NOT NULL,
	"node_id" integer NOT NULL,
	"node_group_id" integer,
	"node_group_name" text,
	"parent_node_group_id" integer,
	"phase" integer,
	"name" text,
	"team_1_id" bigint,
	"team_2_id" bigint,
	"series_id" bigint,
	"node_type" smallint,
	"scheduled_time" integer,
	"actual_time" integer,
	"team_1_wins" smallint,
	"team_2_wins" smallint,
	"has_started" boolean,
	"is_completed" boolean,
	"winning_node_id" integer,
	"losing_node_id" integer,
	"incoming_node_id_1" integer,
	"incoming_node_id_2" integer,
	"stream_ids" jsonb,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "bracket_nodes_league_id_node_id_pk" PRIMARY KEY("league_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "league_standings" (
	"league_id" bigint NOT NULL,
	"node_group_id" integer NOT NULL,
	"team_id" bigint NOT NULL,
	"standing" integer,
	"wins" integer,
	"losses" integer,
	"score" text,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "league_standings_league_id_node_group_id_team_id_pk" PRIMARY KEY("league_id","node_group_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"league_id" bigint PRIMARY KEY NOT NULL,
	"name" text,
	"tier" integer,
	"region" integer,
	"start_timestamp" integer,
	"end_timestamp" integer,
	"total_prize_pool" bigint,
	"description" text,
	"streams" jsonb,
	"raw" jsonb,
	"last_synced_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "match_analysis" (
	"match_id" bigint PRIMARY KEY NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" smallint DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"match_id" bigint NOT NULL,
	"t" integer NOT NULL,
	"type" text NOT NULL,
	"team" smallint,
	"payload" jsonb,
	"source" text DEFAULT 'live' NOT NULL,
	"dedupe_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_snapshots" (
	"match_id" bigint NOT NULL,
	"t" integer NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"game_state" smallint,
	"payload" jsonb NOT NULL,
	CONSTRAINT "match_snapshots_match_id_t_pk" PRIMARY KEY("match_id","t")
);
--> statement-breakpoint
CREATE TABLE "match_timeline" (
	"match_id" bigint NOT NULL,
	"minute" integer NOT NULL,
	"radiant_gold_adv" integer,
	"radiant_xp_adv" integer,
	"radiant_net_worth" integer,
	"dire_net_worth" integer,
	"radiant_score" integer,
	"dire_score" integer,
	"radiant_towers" integer,
	"dire_towers" integer,
	"radiant_barracks" integer,
	"dire_barracks" integer,
	"roshan_kills" smallint,
	"win_prob_stratz" real,
	"win_prob_gold" real,
	"win_prob_estimate" real,
	"source" text DEFAULT 'live' NOT NULL,
	CONSTRAINT "match_timeline_match_id_minute_pk" PRIMARY KEY("match_id","minute")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"match_id" bigint PRIMARY KEY NOT NULL,
	"series_id" bigint,
	"league_id" bigint,
	"league_name" text,
	"game_in_series" smallint,
	"radiant_team_id" bigint,
	"dire_team_id" bigint,
	"radiant_team_name" text,
	"dire_team_name" text,
	"radiant_logo_url" text,
	"dire_logo_url" text,
	"start_time" integer,
	"duration" integer,
	"radiant_win" boolean,
	"radiant_score" integer,
	"dire_score" integer,
	"game_state" smallint,
	"ingest_status" text DEFAULT 'live' NOT NULL,
	"backfill_attempts" smallint DEFAULT 0 NOT NULL,
	"backfill_next_at" timestamp with time zone,
	"first_snapshot_t" integer,
	"last_snapshot_t" integer,
	"snapshot_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now(),
	"last_seen_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_timeline" (
	"match_id" bigint NOT NULL,
	"minute" integer NOT NULL,
	"player_slot" smallint NOT NULL,
	"account_id" bigint,
	"hero_id" integer,
	"team" smallint,
	"player_name" text,
	"net_worth" integer,
	"xp" integer,
	"level" smallint,
	"kills" smallint,
	"deaths" smallint,
	"assists" smallint,
	"last_hits" integer,
	"denies" integer,
	"gpm" integer,
	"xpm" integer,
	"items" jsonb,
	"position_x" real,
	"position_y" real,
	"ultimate_state" smallint,
	"ultimate_cooldown" integer,
	"respawn_timer" integer,
	"source" text DEFAULT 'live' NOT NULL,
	CONSTRAINT "player_timeline_match_id_minute_player_slot_pk" PRIMARY KEY("match_id","minute","player_slot")
);
--> statement-breakpoint
CREATE TABLE "post_match_raw" (
	"match_id" bigint PRIMARY KEY NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opendota" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"series_id" bigint PRIMARY KEY NOT NULL,
	"league_id" bigint,
	"node_id" integer,
	"series_type" smallint,
	"team_1_id" bigint,
	"team_2_id" bigint,
	"team_1_name" text,
	"team_2_name" text,
	"start_time" integer,
	"scheduled_time" integer,
	"team_1_wins" smallint,
	"team_2_wins" smallint,
	"match_ids" jsonb,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"team_id" bigint PRIMARY KEY NOT NULL,
	"name" text,
	"tag" text,
	"abbreviation" text,
	"logo_url" text,
	"is_pro" boolean,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "bracket_nodes_league_time_idx" ON "bracket_nodes" USING btree ("league_id","scheduled_time");--> statement-breakpoint
CREATE INDEX "bracket_nodes_series_idx" ON "bracket_nodes" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "league_standings_league_idx" ON "league_standings" USING btree ("league_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_events_dedupe_idx" ON "match_events" USING btree ("match_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "match_events_match_t_idx" ON "match_events" USING btree ("match_id","t");--> statement-breakpoint
CREATE INDEX "matches_league_idx" ON "matches" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "matches_series_idx" ON "matches" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("ingest_status");--> statement-breakpoint
CREATE INDEX "matches_start_idx" ON "matches" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "player_timeline_account_idx" ON "player_timeline" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "player_timeline_hero_idx" ON "player_timeline" USING btree ("hero_id");--> statement-breakpoint
CREATE INDEX "series_league_idx" ON "series" USING btree ("league_id");