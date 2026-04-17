create table login_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  attempted_at timestamptz not null default now(),
  success boolean not null
);
create index login_attempts_ip_hash_attempted_at_idx
  on login_attempts (ip_hash, attempted_at desc);
