create table listings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_listing_id text not null,
  source_url text not null,
  title text not null,
  rent_price integer not null,
  district text not null,
  address_summary text not null,
  layout text not null,
  area_ping numeric,
  floor text,
  raw_snapshot jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  current_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_listing_id)
);

create table listing_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  run_id text not null,
  score_level text not null,
  photo_review text not null,
  appliance_review text not null,
  appliances_seen text[] not null default '{}',
  appliances_missing_or_unknown text[] not null default '{}',
  recommendation_reason text not null,
  concerns text[] not null default '{}',
  reviewed_at timestamptz not null default now()
);

create table listing_changes (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  run_id text not null,
  change_type text not null,
  before_snapshot jsonb,
  after_snapshot jsonb,
  change_summary text not null,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  event_type text not null,
  event_hash text not null,
  channel text not null default 'line',
  message_body text not null,
  status text not null,
  provider_response jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, event_type, event_hash)
);

create table triage_actions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade unique,
  status text not null default 'New',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- triage status check
alter table triage_actions
  add constraint triage_actions_status_check
  check (status in ('New','Interested','Contacted','Viewing','Rejected','Archived'));
