-- Run this in Supabase SQL Editor (Database → SQL Editor → New query)

create table if not exists album_wheel_state (
  id text primary key default 'default',
  albums jsonb not null default '[]',
  disabled_ids jsonb not null default '[]',
  updated_at timestamptz default now()
);

-- Insert the default row
insert into album_wheel_state (id) values ('default') on conflict do nothing;

-- Enable Row Level Security
alter table album_wheel_state enable row level security;

-- Allow anyone with the anon key to read and write
create policy "Allow all anon" on album_wheel_state
  for all using (true) with check (true);

-- Enable realtime on this table
alter publication supabase_realtime add table album_wheel_state;
