CREATE TABLE "dev_clock" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"offset_ms" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "dev_clock_single_row" CHECK ("dev_clock"."id" = 1),
	CONSTRAINT "dev_clock_offset_not_negative" CHECK ("dev_clock"."offset_ms" >= 0)
);
