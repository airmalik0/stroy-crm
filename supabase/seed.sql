-- Демо-данные: 2 постановщика, 2 исполнителя, 3 объекта, задачи во всех статусах.
-- Пароль здесь только для локального запуска. На демо-стенде пароли другие.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
  extensions.crypt('local-demo-pass', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name), now(), now(), '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001', 'manager1@example.com', 'Сергей Орлов'),
  ('a0000000-0000-4000-8000-000000000002', 'manager2@example.com', 'Анна Белова'),
  ('b0000000-0000-4000-8000-000000000001', 'executor1@example.com', 'Дмитрий Ковалёв'),
  ('b0000000-0000-4000-8000-000000000002', 'executor2@example.com', 'Рустам Хасанов')
) as u (id, email, full_name);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
from auth.users
where email like '%@example.com';

-- Триггер завёл всех исполнителями, постановщиков назначаем вручную.
update public.profiles set role = 'manager'
where id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');

insert into public.objects (id, name, address, created_at) values
  ('c0000000-0000-4000-8000-000000000001', 'ЖК «Северный», корпус 2', 'г. Казань, ул. Лесная, 12', now() - interval '20 days'),
  ('c0000000-0000-4000-8000-000000000002', 'Склад «Логистик-Юг»', 'г. Краснодар, Промзона, 3', now() - interval '14 days'),
  ('c0000000-0000-4000-8000-000000000003', 'Школа на 600 мест', 'г. Самара, ул. Мира, 45', now() - interval '10 days');

-- Триггер пишет первую строку истории с датой created_at. Дальше статус и история задаются вместе,
-- как это делает change_task_status, только с датами в прошлом.
do $$
declare
  m1 constant uuid := 'a0000000-0000-4000-8000-000000000001';
  m2 constant uuid := 'a0000000-0000-4000-8000-000000000002';
  e1 constant uuid := 'b0000000-0000-4000-8000-000000000001';
  e2 constant uuid := 'b0000000-0000-4000-8000-000000000002';
  o1 constant uuid := 'c0000000-0000-4000-8000-000000000001';
  o2 constant uuid := 'c0000000-0000-4000-8000-000000000002';
  o3 constant uuid := 'c0000000-0000-4000-8000-000000000003';
  r record;
  v_id uuid;
  v_step record;
  v_from public.task_status;
begin
  for r in
    select * from (values
      ('Залить фундамент секции 2', 'Бетон В25, объём по проекту КЖ-3. Приложить акт скрытых работ.', o1, e1, m1, 18,
        '[{"to":"in_progress","by":"e","days":17},{"to":"review","by":"e","days":12,"comment":"Залито, акт передан прорабу"},{"to":"accepted","by":"m","days":11,"comment":"Принято, замечаний нет"}]'),
      ('Смонтировать опалубку 3 этажа', 'Захватка А. Проверить вертикальность стоек перед заливкой.', o1, e1, m1, 6,
        '[{"to":"in_progress","by":"e","days":4}]'),
      ('Проверить армирование плиты', 'Плита перекрытия 2 этажа, сверка с чертежом КЖ-5.', o1, e2, m2, 5,
        '[{"to":"in_progress","by":"e","days":3},{"to":"review","by":"e","days":1,"comment":"Шаг арматуры соответствует чертежу"}]'),
      ('Устройство кровли, захватка 1', 'Мембрана ПВХ, примыкания к парапету по узлу 4.', o2, e1, m1, 9,
        '[{"to":"in_progress","by":"e","days":8},{"to":"review","by":"e","days":3},{"to":"rework","by":"m","days":2,"comment":"На примыкании у оси Б видны складки мембраны, переделать узел"}]'),
      ('Разводка электрики в зоне отгрузки', 'Кабельные лотки по проекту ЭМ, щит ЩР-2.', o2, e1, m2, 1,
        '[]'),
      ('Кладка перегородок 1 этажа', 'Газоблок D500, армирование каждого третьего ряда.', o3, e2, m1, 7,
        '[{"to":"in_progress","by":"e","days":5}]'),
      ('Монтаж окон в спортзале', 'Заказ подтверждён, поставка на объект в понедельник.', o3, e2, m2, 2,
        '[]')
    ) as t (title, description, object_id, assignee_id, author_id, age, steps)
  loop
    insert into public.tasks (title, description, object_id, assignee_id, author_id, created_at)
    values (r.title, r.description, r.object_id, r.assignee_id, r.author_id, now() - make_interval(days => r.age))
    returning id into v_id;

    v_from := 'new';
    for v_step in
      select * from jsonb_to_recordset(r.steps::jsonb) as s ("to" public.task_status, "by" text, days int, comment text)
    loop
      insert into public.task_status_history (task_id, from_status, to_status, changed_by, comment, changed_at)
      values (
        v_id, v_from, v_step."to",
        case v_step."by" when 'e' then r.assignee_id else r.author_id end,
        v_step.comment, now() - make_interval(days => v_step.days)
      );
      v_from := v_step."to";
    end loop;

    update public.tasks set status = v_from where id = v_id;
  end loop;
end;
$$;
