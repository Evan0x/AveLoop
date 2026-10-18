-- AveLoop + Clerk + Supabase
-- 1. Clerk Dashboard → Native Integrations → Supabase → Activate
-- 2. Copy the Clerk domain and add it in Supabase → Authentication → Sign In / Providers → Clerk
-- 3. Run this SQL in Supabase → SQL Editor

create table if not exists public.care_plans (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt()->>'sub'),
  notes text,
  data jsonb not null default '{}'::jsonb,
  approved_actions jsonb,
  status text not null default 'extracted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.care_plans enable row level security;

create policy "Users can view their own care plans"
on public.care_plans
for select
to authenticated
using ((select auth.jwt()->>'sub') = user_id);

create policy "Users must insert their own care plans"
on public.care_plans
for insert
to authenticated
with check ((select auth.jwt()->>'sub') = user_id);

create policy "Users can update their own care plans"
on public.care_plans
for update
to authenticated
using ((select auth.jwt()->>'sub') = user_id)
with check ((select auth.jwt()->>'sub') = user_id);

create policy "Users can delete their own care plans"
on public.care_plans
for delete
to authenticated
using ((select auth.jwt()->>'sub') = user_id);
