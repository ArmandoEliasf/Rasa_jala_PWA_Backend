-- RASSA JALA · Asignación de roles a cuentas de prueba en Supabase
--
-- REQUISITO: primero crea estas cuatro cuentas en Supabase Dashboard:
-- Authentication → Users → Add user.
-- Este script NO crea credenciales ni inserta directamente en auth.users.
-- El trigger auth_user_crear_perfil crea el perfil comprador al registrar la cuenta.
--
-- Antes de ejecutar, cambia los cuatro correos de ejemplo por los correos
-- exactos que registraste en Auth. Define las contraseñas en Supabase, nunca aquí.
-- Ejecutar después de instalar supabase_rassa.sql, en un proyecto de pruebas.

-- Asegura que el trigger reconozca las sesiones SQL administrativas de Supabase.
-- La app sigue necesitando un JWT service_role o un administrador para cambiar roles.
create or replace function public.proteger_cambio_rol()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.rol_id is distinct from old.rol_id
     and coalesce(auth.role(), '') not in ('service_role','supabase_admin')
     and current_user not in ('postgres','supabase_admin')
     and session_user not in ('postgres','supabase_admin')
     and not public.tiene_rol(array['administrador']) then
    raise exception 'Solo un administrador puede cambiar roles';
  end if;
  return new;
end;
$$;

-- Un bloque DO mantiene validaciones y actualizaciones en una sola sentencia,
-- sin depender de tablas temporales ni de que el editor conserve una sesión.
do $$
declare
  demo record;
  usuario_id uuid;
  rol_id_demo smallint;
begin
  for demo in
    select * from (values
      ('admin-demo@rassa.com',      'administrador', 'Admin',      'Demo'),
      ('vendedor-demo@rassa.com',   'vendedor',      'Vendedor',   'Demo'),
      ('agricultor-demo@rassa.com', 'agricultor',    'Agricultor', 'Demo'),
      ('comprador-demo@rassa.com',  'comprador',     'Comprador',  'Demo')
    ) as cuentas(email, rol, nombres, apellido_paterno)
  loop
    select u.id into usuario_id
    from auth.users u
    where lower(u.email) = lower(demo.email);

    if usuario_id is null then
      raise exception 'Crea primero la cuenta % en Supabase Auth', demo.email;
    end if;

    if not exists (select 1 from public.perfiles p where p.id = usuario_id) then
      raise exception 'No existe el perfil de %. Revisa el trigger auth_user_crear_perfil', demo.email;
    end if;

    select r.id into rol_id_demo from public.roles r where r.nombre = demo.rol;
    if rol_id_demo is null then
      raise exception 'No existe el rol % en public.roles', demo.rol;
    end if;

    update public.perfiles p
    set rol_id = rol_id_demo,
        nombres = demo.nombres,
        apellido_paterno = demo.apellido_paterno,
        activo = true,
        actualizado_en = now()
    where p.id = usuario_id;
  end loop;
end;
$$;

-- Resultado de verificación.
select u.email, r.nombre as rol, p.activo
from auth.users u
join public.perfiles p on p.id = u.id
join public.roles r on r.id = p.rol_id
join (values
  ('admin-demo@rassa.com'),
  ('vendedor-demo@rassa.com'),
  ('agricultor-demo@rassa.com'),
  ('comprador-demo@rassa.com')
) as cuentas(email) on lower(cuentas.email) = lower(u.email)
order by r.nombre;
