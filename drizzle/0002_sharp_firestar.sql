ALTER TABLE "run_messages" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "run_messages" ADD COLUMN "phase" text DEFAULT 'waiting' NOT NULL;--> statement-breakpoint
ALTER TABLE "run_messages" ADD COLUMN "probabilities" jsonb;
--> statement-breakpoint
WITH ordered AS (SELECT id, (row_number() OVER (PARTITION BY run_id ORDER BY id) - 1)::int AS position FROM run_messages)
UPDATE run_messages SET position = ordered.position FROM ordered WHERE run_messages.id = ordered.id;
--> statement-breakpoint
UPDATE run_messages SET phase = CASE WHEN state = 'done' THEN 'done' WHEN state = 'failed' THEN 'failed' WHEN state = 'skipped' THEN 'skipped' ELSE 'waiting' END;
