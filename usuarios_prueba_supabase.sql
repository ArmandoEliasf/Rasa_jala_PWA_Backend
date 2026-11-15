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

begin;

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

create temporary table usuarios_prueba_seed (
  email text primary key,
  rol text not null check (rol in ('administrador','vendedor','agricultor','comprador')),
  nombres text not null,
  apellido_paterno text not null
) on commit drop;

insert into usuarios_prueba_seed (email, rol, nombres, apellido_paterno) values
  ('admin-demo@rassa.com',      'administrador', 'Admin',      'Demo'),
  ('vendedor-demo@rassa.com',   'vendedor',      'Vendedor',   'Demo'),
  ('agricultor-demo@rassa.com', 'agricultor',    'Agricultor', 'Demo'),
  ('comprador-demo@rassa.com',  'comprador',     'Comprador',  'Demo');

do $$
declare
  faltantes text;
begin
  select string_agg(s.email, ', ' order by s.email)
    into faltantes
  from usuarios_prueba_seed s
  left join auth.users u on lower(u.email) = lower(s.email)
  where u.id is null;

  if faltantes is not null then
    raise exception 'Crea primero estas cuentas en Supabase Auth: %', faltantes;
  end if;

  select string_agg(s.email, ', ' order by s.email)
    into faltantes
  from usuarios_prueba_seed s
  join auth.users u on lower(u.email) = lower(s.email)
  left join public.perfiles p on p.id = u.id
  where p.id is null;

  if faltantes is not null then
    raise exception 'No se generó el perfil para estas cuentas; revisa el trigger auth_user_crear_perfil: %', faltantes;
  end if;

  select string_agg(distinct s.rol, ', ' order by s.rol)
    into faltantes
  from usuarios_prueba_seed s
  left join public.roles r on r.nombre = s.rol
  where r.id is null;

  if faltantes is not null then
    raise exception 'No existen estos roles en public.roles: %', faltantes;
  end if;
end;
$$;

update public.perfiles p
set rol_id = r.id,
    nombres = s.nombres,
    apellido_paterno = s.apellido_paterno,
    activo = true,
    actualizado_en = now()
from auth.users u
join usuarios_prueba_seed s on lower(s.email) = lower(u.email)
join public.roles r on r.nombre = s.rol
where p.id = u.id;

-- Resultado de verificación antes de confirmar la transacción.
select u.email, r.nombre as rol, p.activo
from auth.users u
join public.perfiles p on p.id = u.id
join public.roles r on r.id = p.rol_id
join usuarios_prueba_seed s on lower(s.email) = lower(u.email)
order by r.nombre;

commit;
