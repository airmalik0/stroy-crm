-- Проверки на уровне базы: то, что не видно через API.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Все таблицы в public под RLS, новые таблицы закрыты по умолчанию.
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0, 'RLS включён на всех таблицах public'
);

-- Колонки, которые нельзя писать напрямую.
select ok(not has_column_privilege('authenticated', 'public.tasks', 'status', 'UPDATE'), 'status закрыт на update');
select ok(not has_column_privilege('authenticated', 'public.tasks', 'status', 'INSERT'), 'status закрыт на insert');
select ok(not has_column_privilege('authenticated', 'public.tasks', 'author_id', 'UPDATE'), 'author_id закрыт на update');
select ok(not has_table_privilege('authenticated', 'public.tasks', 'DELETE'), 'прямой delete задач закрыт');
select ok(not has_table_privilege('authenticated', 'public.task_status_history', 'INSERT'), 'запись истории закрыта');
select ok(not has_function_privilege('anon', 'public.change_task_status(uuid, public.task_status, text)', 'EXECUTE'), 'anon не вызывает смену статуса');

-- Демо-задача на проверке, чтобы было что удалять.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
create temp table probe on commit drop as
  select id from public.tasks where status = 'review' limit 1;

-- История неизменяема даже для администратора базы и service_role.
select throws_ok(
  $$update public.task_status_history set comment = 'Подделка'$$,
  '42501', 'История статусов неизменяема', 'администратор базы не правит историю'
);
select throws_ok(
  $$delete from public.task_status_history$$,
  '42501', 'История статусов неизменяема', 'администратор базы не удаляет историю'
);
select throws_ok(
  $$truncate public.task_status_history$$,
  '42501', 'История статусов неизменяема', 'truncate истории не проходит'
);
set local role service_role;
select throws_ok(
  $$update public.task_status_history set comment = 'Подделка'$$,
  '42501', 'История статусов неизменяема', 'service_role не правит историю'
);
reset role;

-- Мягкое удаление сохраняет историю.
create temp table before_delete on commit drop as
  select count(*)::int as n from public.task_status_history
  where task_id = (select id from probe);
select public.delete_task((select id from probe));
select is(
  (select count(*)::int from public.task_status_history where task_id = (select id from probe)),
  (select n from before_delete), 'после удаления задачи история на месте'
);
select ok(
  (select deleted_at is not null from public.tasks where id = (select id from probe)),
  'задача помечена удалённой, а не стёрта'
);

select * from finish();
rollback;
