-- Логика на стороне базы: переходы статусов, история, удаление, проверки при записи.

-- Смена статуса. Единственная дверь: колонка status закрыта для прямой записи всем ролям API.
-- security definer нужен, чтобы функция могла менять status и писать историю от имени системы;
-- кто звонит, она определяет сама через auth.uid(), клиент этого передать не может.
create function public.change_task_status(
  p_task_id uuid,
  p_to_status public.task_status,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_manager boolean := private.is_manager();
  -- btrim убирает только пробелы, а комментарий из переводов строки тоже пустой.
  v_comment text := nullif(regexp_replace(p_comment, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  v_task public.tasks;
  v_rule public.task_transitions;
begin
  -- for update: при двух одновременных запросах второй дождётся первого и увидит уже новый статус.
  select * into v_task
  from public.tasks
  where id = p_task_id and deleted_at is null
  for update;

  -- Чужая задача для исполнителя неотличима от несуществующей.
  if not found or v_uid is null or not (v_is_manager or v_task.assignee_id = v_uid) then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;

  select * into v_rule
  from public.task_transitions
  where from_status = v_task.status and to_status = p_to_status;

  if not found then
    raise exception 'Переход запрещён: % -> %', v_task.status, p_to_status using errcode = 'P0001';
  end if;

  if not (
    case v_rule.actor
      when 'manager' then v_is_manager
      when 'assignee' then v_task.assignee_id = v_uid
    end
  ) then
    raise exception 'Это действие вам недоступно' using errcode = '42501';
  end if;

  if v_rule.comment_required and v_comment is null then
    raise exception 'Для этого действия нужен комментарий' using errcode = 'P0001';
  end if;

  update public.tasks set status = p_to_status where id = p_task_id;

  insert into public.task_status_history (task_id, from_status, to_status, changed_by, comment)
  values (p_task_id, v_task.status, p_to_status, v_uid, v_comment);
end;
$$;

-- Какие действия доступны текущему пользователю. Отсюда интерфейс берёт кнопки,
-- поэтому правила не дублируются на фронтенде. security invoker: чужая задача вернёт пустой список.
create function public.available_transitions(p_task_id uuid)
returns table (to_status public.task_status, comment_required boolean, action_label text)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.to_status, r.comment_required, r.action_label
  from public.tasks t
  join public.task_transitions r on r.from_status = t.status
  where t.id = p_task_id
    and case r.actor
      when 'manager' then private.is_manager()
      when 'assignee' then t.assignee_id = auth.uid()
    end;
$$;

-- Удаление мягкое: запись скрывается для всех, а история статусов остаётся в базе.
-- Настоящий delete снёс бы и историю, а её по ТЗ удалять нельзя.
create function public.delete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_manager() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  update public.tasks set deleted_at = now()
  where id = p_task_id and deleted_at is null;

  if not found then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;
end;
$$;

create function public.delete_object(p_object_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_manager() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  update public.objects set deleted_at = now()
  where id = p_object_id and deleted_at is null;

  if not found then
    raise exception 'Объект не найден' using errcode = 'P0002';
  end if;

  update public.tasks set deleted_at = now()
  where object_id = p_object_id and deleted_at is null;
end;
$$;

revoke all on function public.change_task_status(uuid, public.task_status, text) from public, anon, authenticated;
revoke all on function public.available_transitions(uuid) from public, anon, authenticated;
revoke all on function public.delete_task(uuid) from public, anon, authenticated;
revoke all on function public.delete_object(uuid) from public, anon, authenticated;

grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;
grant execute on function public.available_transitions(uuid) to authenticated;
grant execute on function public.delete_task(uuid) to authenticated;
grant execute on function public.delete_object(uuid) to authenticated;

-- Создание задачи тоже попадает в историю: первая строка "создана, статус Новая".
create function private.log_task_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_status_history (task_id, from_status, to_status, changed_by, changed_at)
  values (new.id, null, new.status, new.author_id, new.created_at);
  return new;
end;
$$;

create trigger tasks_log_created
  after insert on public.tasks
  for each row execute function private.log_task_created();

-- Назначить можно только исполнителя и только в живой объект. Функция читает таблицы без RLS,
-- поэтому результат не зависит от того, что видно вызывающему.
create function private.check_task_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles where id = new.assignee_id and role = 'executor'
  ) then
    raise exception 'Назначить можно только исполнителя' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.objects where id = new.object_id and deleted_at is null
  ) then
    raise exception 'Объект не найден' using errcode = 'P0002';
  end if;

  return new;
end;
$$;

create trigger tasks_check_refs
  before insert or update of assignee_id, object_id on public.tasks
  for each row execute function private.check_task_refs();

-- История неизменяема для всех, включая service_role и администратора базы:
-- этот запрет срабатывает внутри самой таблицы, его не обойти правами.
create function private.forbid_history_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'История статусов неизменяема' using errcode = '42501';
end;
$$;

create trigger task_status_history_immutable
  before update or delete on public.task_status_history
  for each row execute function private.forbid_history_change();

create trigger task_status_history_no_truncate
  before truncate on public.task_status_history
  for each statement execute function private.forbid_history_change();

-- Новый пользователь Supabase Auth получает профиль исполнителя. Роль из метаданных не читается:
-- их задаёт сам пользователь. Постановщика назначают вручную в таблице profiles.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(regexp_replace(new.raw_user_meta_data ->> 'full_name', '^[[:space:]]+|[[:space:]]+$', '', 'g'), ''), new.email, 'Без имени'),
    'executor'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
