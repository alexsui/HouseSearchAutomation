create index listings_last_seen_at_idx on listings (last_seen_at desc);
create index listings_district_idx on listings (district);
create index listing_reviews_listing_id_reviewed_at_idx
  on listing_reviews (listing_id, reviewed_at desc);
create index listing_changes_listing_id_created_at_idx
  on listing_changes (listing_id, created_at desc);
create index notifications_listing_id_sent_at_idx
  on notifications (listing_id, sent_at desc);
create index notifications_status_idx on notifications (status);
