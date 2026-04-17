-- Decouple notifications from listings so the cron agent can call
-- send_line_notification without the upsert_listing dance.
--
-- Before: notifications.listing_id REQUIRED, FK → listings(id).
-- After:  listing_id nullable, FK dropped, dedup key switches to
--         (source, source_listing_id, event_type, event_hash).

alter table notifications
  drop constraint if exists notifications_listing_id_fkey;

alter table notifications
  alter column listing_id drop not null;

alter table notifications
  add column if not exists source text,
  add column if not exists source_listing_id text;

-- Old unique index on (listing_id, event_type, event_hash) stays, but it
-- only catches duplicates for the legacy listing-linked flow. The new
-- canonical dedup key:
create unique index if not exists notifications_source_event_unique
  on notifications (source, source_listing_id, event_type, event_hash)
  where source is not null and source_listing_id is not null;

-- Fast lookup by source_listing_id for get_known_listings.
create index if not exists notifications_source_listing_id_idx
  on notifications (source, source_listing_id);
