-- Схема: пользователи с ролями, объекты, задачи, история статусов и правила переходов.

-- Текстовые поля должны содержать хотя бы одну букву или цифру: пробелы, переводы строки
-- и невидимые символы значением не считаются.

-- Всё новое в public закрыто по умолчанию: доступ выдаётся только явным grant.
-- Без этого Supabase сам открывает anon и authenticated каждую новую таблицу и функцию.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Служебные функции. Схема не опубликована в API, вызвать их запросом снаружи нельзя.
create schema private;

create type public.user_role as enum ('manager', 'executor');
create type public.task_status as enum ('new', 'in_progress', 'review', 'accepted', 'rework');
create type public.transition_actor as enum ('manager', 'assignee');

-- Роль хранится здесь, а не в user_metadata: метаданные пользователь может менять сам через API.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (full_name ~ '[[:alnum:]]' and length(full_name) <= 200),
  role public.user_role not null default 'executor',
  created_at timestamptz not null default now()
);

create table public.objects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name ~ '[[:alnum:]]' and length(name) <= 200),
  address text not null check (address ~ '[[:alnum:]]' and length(address) <= 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (title ~ '[[:alnum:]]' and length(title) <= 200),
  description text not null default '' check (length(description) <= 5000),
  object_id uuid not null references public.objects (id) on delete restrict,
  assignee_id uuid not null references public.profiles (id) on delete restrict,
  status public.task_status not null default 'new',
  author_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index tasks_object_id_idx on public.tasks (object_id) where deleted_at is null;
create index tasks_assignee_id_idx on public.tasks (assignee_id) where deleted_at is null;
create index tasks_author_id_idx on public.tasks (author_id);

-- from_status = null означает создание задачи. Комментарий может отсутствовать, но не быть пустым.
create table public.task_status_history (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete restrict,
  from_status public.task_status,
  to_status public.task_status not null,
  changed_by uuid not null references public.profiles (id) on delete restrict,
  comment text check (comment ~ '[[:alnum:]]' and length(comment) <= 2000),
  changed_at timestamptz not null default now()
);

create index task_status_history_task_id_idx on public.task_status_history (task_id, changed_at, id);
create index task_status_history_changed_by_idx on public.task_status_history (changed_by);

-- Таблица переходов из ТЗ. Единственный источник правды и для проверки в базе, и для кнопок в интерфейсе.
create table public.task_transitions (
  from_status public.task_status not null,
  to_status public.task_status not null,
  actor public.transition_actor not null,
  comment_required boolean not null default false,
  action_label text not null,
  primary key (from_status, to_status)
);

insert into public.task_transitions (from_status, to_status, actor, comment_required, action_label) values
  ('new',         'in_progress', 'assignee', false, 'Взять в работу'),
  ('in_progress', 'review',      'assignee', false, 'Отправить на проверку'),
  ('review',      'accepted',    'manager',  false, 'Принять'),
  ('review',      'rework',      'manager',  true,  'Вернуть на доработку'),
  ('rework',      'in_progress', 'assignee', false, 'Взять в работу');
