# Album Wheel 🎵

Spin to pick your daily album.

## Setup

```bash
npm install
npm run dev
```

## Deploy

Push to GitHub → connect on [vercel.com](https://vercel.com) → auto-deploys on every push.

## Supabase schema

Run this SQL in your Supabase SQL editor:

```sql
create table wheel_state (
  id integer primary key,
  albums jsonb not null default '[]',
  disabled_ids jsonb not null default '[]',
  updated_at timestamptz default now()
);

alter table wheel_state enable row level security;

create policy "Allow all" on wheel_state
  for all using (true) with check (true);
```
