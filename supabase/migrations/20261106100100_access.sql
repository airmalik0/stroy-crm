-- Права доступа. Работают два слоя: grant решает, какие колонки можно менять в принципе,
-- RLS решает, какие строки видит и меняет конкретный пользователь.

-- security definer нужен, чтобы проверка роли читала profiles без RLS: иначе политика
-- на profiles вызывала бы сама себя. Функция отвечает только на вопрос о текущем пользователе.
create function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'manager'
  );
$$;

revoke all on function private.is_manager() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_manager() to authenticated;

revoke all on public.profiles, public.objects, public.tasks,
  public.task_status_history, public.task_transitions from public, anon, authenticated;

grant select on public.profiles, public.objects, public.tasks,
  public.task_status_history, public.task_transitions to authenticated;

-- Только эти колонки можно писать напрямую. status, author_id, created_at и deleted_at
-- в списке нет: запрос, который их трогает, база отклоняет ещё до проверки строк.
grant insert (name, address), update (name, address) on public.objects to authenticated;
grant insert (title, description, object_id, assignee_id),
      update (title, description, object_id, assignee_id) on public.tasks to authenticated;

-- На delete grant нет ни на что: удаление только через функции delete_task и delete_object.
-- На profiles, task_status_history и task_transitions записи через API нет совсем.

alter table public.profiles enable row level security;
alter table public.objects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_status_history enable row level security;
alter table public.task_transitions enable row level security;

-- Задачи: постановщик видит все, исполнитель только назначенные ему.
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and ((select private.is_manager()) or assignee_id = (select auth.uid()))
  );

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check ((select private.is_manager()));

create policy tasks_update on public.tasks
  for update to authenticated
  using ((select private.is_manager()) and deleted_at is null)
  with check ((select private.is_manager()));

-- Объекты: исполнитель видит только те, где у него есть задача.
-- Подзапрос к tasks сам проходит через RLS задач, поэтому удалённые задачи не считаются.
create policy objects_select on public.objects
  for select to authenticated
  using (
    deleted_at is null
    and (
      (select private.is_manager())
      or exists (
        select 1 from public.tasks t
        where t.object_id = objects.id and t.assignee_id = (select auth.uid())
      )
    )
  );

create policy objects_insert on public.objects
  for insert to authenticated
  with check ((select private.is_manager()));

create policy objects_update on public.objects
  for update to authenticated
  using ((select private.is_manager()) and deleted_at is null)
  with check ((select private.is_manager()));

-- История видна тому, кому видна сама задача.
create policy task_status_history_select on public.task_status_history
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

-- Люди: исполнитель видит себя, авторов своих задач и тех, кто есть в их истории.
-- Получить список всех сотрудников он не может.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_manager())
    or exists (select 1 from public.tasks t where t.author_id = profiles.id)
    or exists (select 1 from public.task_status_history h where h.changed_by = profiles.id)
  );

create policy task_transitions_select on public.task_transitions
  for select to authenticated
  using (true);
