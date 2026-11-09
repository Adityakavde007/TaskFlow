create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text unique,
    full_name text,
    created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, email, full_name)
    values (
        new.id,
        new.email,
        coalesce(
            new.raw_user_meta_data ->> 'full_name',
            new.raw_user_meta_data ->> 'name'
        )
    )
    on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name);

    return new;
end;
$$;

insert into public.profiles (id, email, full_name)
select
    id,
    email,
    coalesce(
        raw_user_meta_data ->> 'full_name',
        raw_user_meta_data ->> 'name'
    )
from auth.users
on conflict (id) do update
set email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name);

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert or update on auth.users
    for each row execute function public.handle_new_user();

create table if not exists public.tasks (
    id uuid primary key default gen_random_uuid(),
    title text not null check (length(trim(title)) > 0),
    description text not null default '',
    created_by uuid not null references public.profiles (id) on delete cascade,
    assigned_to uuid not null references public.profiles (id) on delete cascade,
    status text not null default 'Pending'
        check (status in ('Pending', 'In Progress', 'Completed')),
    created_at timestamptz not null default now()
);

create index if not exists tasks_created_by_idx
    on public.tasks (created_by);
create index if not exists tasks_assigned_to_idx
    on public.tasks (assigned_to);

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;

grant select on public.profiles to authenticated;
grant select, insert, delete on public.tasks to authenticated;
revoke update on public.tasks from anon, authenticated;
revoke update (status) on public.tasks from authenticated;
grant update (status) on public.tasks to authenticated;

drop policy if exists "Authenticated users can view profiles"
    on public.profiles;
create policy "Authenticated users can view profiles"
    on public.profiles for select to authenticated
    using (true);

drop policy if exists "Users can view their tasks" on public.tasks;
create policy "Users can view their tasks"
    on public.tasks for select to authenticated
    using (auth.uid() = created_by or auth.uid() = assigned_to);

drop policy if exists "Users can create their own tasks" on public.tasks;
create policy "Users can create their own tasks"
    on public.tasks for insert to authenticated
    with check (auth.uid() = created_by);

drop policy if exists "Creators and assignees can update tasks"
    on public.tasks;
create policy "Creators and assignees can update tasks"
    on public.tasks for update to authenticated
    using (auth.uid() = created_by or auth.uid() = assigned_to)
    with check (auth.uid() = created_by or auth.uid() = assigned_to);

drop policy if exists "Creators can delete their tasks" on public.tasks;
create policy "Creators can delete their tasks"
    on public.tasks for delete to authenticated
    using (auth.uid() = created_by);
