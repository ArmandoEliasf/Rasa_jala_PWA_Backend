-- Rassa JALA · Seguridad de usuarios, auditoría y pagos de liquidación
-- Ejecutar después de supabase_rassa.sql, admin_workflows_supabase.sql y
-- admin_operations_supabase.sql.

begin;

-- Protege los cambios de rol/estado incluso si se intenta llamar a PostgREST
-- directamente. El advisory lock hace atómica la protección del último admin.
create or replace function public.proteger_cambio_rol()
returns trigger language plpgsql set search_path = '' as $$
declare
  administradores_activos integer;
  es_admin_actual boolean;
  rol_administrador smallint;
begin
  es_admin_actual := public.tiene_rol(array['administrador']);
  if new.rol_id is distinct from old.rol_id or new.activo is distinct from old.activo then
    if coalesce(auth.role(), '') not in ('service_role','supabase_admin')
       and current_user not in ('postgres','supabase_admin')
       and not es_admin_actual then
      raise exception 'Solo un administrador puede cambiar roles o estados de cuenta';
    end if;
  end if;

  select r.id into rol_administrador from public.roles r where r.nombre = 'administrador';
  if (old.rol_id = rol_administrador or new.rol_id = rol_administrador)
     and (new.rol_id is distinct from old.rol_id or new.activo is distinct from old.activo) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rassa.active_admin_guard', 0));
    if old.activo and old.rol_id = rol_administrador
       and (not new.activo or new.rol_id is distinct from rol_administrador) then
      select count(*) into administradores_activos
      from public.perfiles p join public.roles r on r.id = p.rol_id
      where p.activo and r.nombre = 'administrador';
      if administradores_activos <= 1 then
        raise exception 'No se puede desactivar ni degradar al último administrador activo';
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists perfiles_proteger_rol on public.perfiles;
create trigger perfiles_proteger_rol before update of rol_id, activo on public.perfiles
for each row execute function public.proteger_cambio_rol();

create or replace function public.admin_actualizar_usuario(
  p_usuario_id uuid,
  p_rol_id smallint,
  p_activo boolean
)
returns void
language plpgsql security definer set search_path = '' as $$
declare rol_nombre text;
begin
  if not public.tiene_rol(array['administrador']) then
    raise exception 'Solo un administrador puede actualizar cuentas';
  end if;
  if p_activo is null then raise exception 'El estado de la cuenta es obligatorio'; end if;
  if p_usuario_id = auth.uid() and (not p_activo or exists(
    select 1 from public.perfiles p where p.id = p_usuario_id and p.rol_id <> p_rol_id
  )) then
    raise exception 'No puedes desactivar tu cuenta ni cambiar tu propio rol';
  end if;
  select nombre into rol_nombre from public.roles where id = p_rol_id;
  if rol_nombre is null then raise exception 'El rol seleccionado no existe'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rassa.active_admin_guard', 0));
  update public.perfiles set rol_id = p_rol_id, activo = p_activo, actualizado_en = now()
  where id = p_usuario_id;
  if not found then raise exception 'La cuenta no existe'; end if;
end;
$$;
revoke all on function public.admin_actualizar_usuario(uuid, smallint, boolean) from public;
grant execute on function public.admin_actualizar_usuario(uuid, smallint, boolean) to authenticated;

-- Registro automático de cambios de administración. Solo se guardan nombres de
-- campos modificados, nunca nombres, correos, teléfonos, domicilios ni mensajes.
create or replace function public.registrar_cambio_admin()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  nuevo jsonb := '{}'::jsonb;
  anterior jsonb := '{}'::jsonb;
  id_texto text;
  id_registro uuid;
  campos text[];
  operacion text := lower(tg_op);
begin
  if tg_op <> 'DELETE' then nuevo := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then anterior := to_jsonb(old); end if;
  id_texto := coalesce(nuevo->>'id', nuevo->>'familia_id', nuevo->>'comprador_id', nuevo->>'conversacion_id',
                       anterior->>'id', anterior->>'familia_id', anterior->>'comprador_id', anterior->>'conversacion_id');
  if id_texto is not null then id_registro := id_texto::uuid; end if;

  if tg_op = 'INSERT' then
    select coalesce(array_agg(fields.field_name order by fields.field_name), array[]::text[]) into campos from jsonb_object_keys(nuevo) as fields(field_name);
  elsif tg_op = 'DELETE' then
    select coalesce(array_agg(fields.field_name order by fields.field_name), array[]::text[]) into campos from jsonb_object_keys(anterior) as fields(field_name);
  else
    select coalesce(array_agg(keys.key order by keys.key), array[]::text[]) into campos
    from (select jsonb_object_keys(nuevo) as field_name union select jsonb_object_keys(anterior) as field_name) fields
    where nuevo->fields.field_name is distinct from anterior->fields.field_name;
  end if;

  insert into public.registros_auditoria(usuario_id, accion, tabla, registro_id, detalles)
  values (auth.uid(), operacion || '_' || tg_table_name, tg_table_name, id_registro,
          jsonb_build_object('campos', campos,
            'usuario_relacionado', coalesce(nuevo->>'usuario_id', anterior->>'usuario_id')));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.registrar_cambio_admin() from public;

do $$
declare tabla text;
begin
  foreach tabla in array array[
    'perfiles','productos','categorias','unidades','municipios','localidades',
    'publicaciones_semanales','productos_publicados','familias','integrantes_familia',
    'limites_credito','recolecciones','conversaciones','integrantes_conversacion',
    'mensajes','adjuntos_mensaje'
  ] loop
    execute format('drop trigger if exists auditoria_admin_auto on public.%I', tabla);
    execute format('create trigger auditoria_admin_auto after insert or update or delete on public.%I for each row execute function public.registrar_cambio_admin()', tabla);
  end loop;
end;
$$;

-- Registra el pago de una liquidación con método y referencia en una tabla
-- normalizada; la transición a pagada ocurre en la misma transacción.
create table if not exists public.pagos_liquidacion (
  id uuid primary key default gen_random_uuid(),
  liquidacion_id uuid not null unique references public.liquidaciones(id) on delete restrict,
  registrado_por uuid references public.perfiles(id) on delete set null,
  tipo_pago_id smallint not null references public.tipos_pago(id) on delete restrict,
  monto numeric(12,2) not null check (monto > 0),
  referencia text,
  creado_en timestamptz not null default now()
);
alter table public.pagos_liquidacion enable row level security;
revoke all on table public.pagos_liquidacion from anon, authenticated;
grant select on table public.pagos_liquidacion to authenticated;
drop policy if exists pagos_liquidacion_admin_read on public.pagos_liquidacion;
create policy pagos_liquidacion_admin_read on public.pagos_liquidacion
  for select to authenticated using (public.tiene_rol(array['administrador']));

create or replace function public.proteger_estado_liquidacion()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'pagada' and old.estado is distinct from 'pagada'
     and not exists(select 1 from public.pagos_liquidacion p where p.liquidacion_id = old.id) then
    raise exception 'Registra el pago antes de marcar la liquidación como pagada';
  end if;
  return new;
end;
$$;
drop trigger if exists liquidacion_requiere_pago on public.liquidaciones;
create trigger liquidacion_requiere_pago before update of estado on public.liquidaciones
for each row execute function public.proteger_estado_liquidacion();

create or replace function public.admin_pagar_liquidacion(
  p_liquidacion_id uuid,
  p_tipo_pago_id smallint,
  p_referencia text default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  liquidacion public.liquidaciones%rowtype;
  nuevo_pago uuid;
begin
  if not public.tiene_rol(array['administrador']) then
    raise exception 'Solo un administrador puede pagar liquidaciones';
  end if;
  select * into liquidacion from public.liquidaciones where id = p_liquidacion_id for update;
  if not found then raise exception 'La liquidación no existe'; end if;
  if liquidacion.estado not in ('pendiente','parcial') then raise exception 'La liquidación ya fue pagada'; end if;
  if not exists(select 1 from public.tipos_pago where id = p_tipo_pago_id and activo) then
    raise exception 'El método de pago no está activo';
  end if;
  insert into public.pagos_liquidacion(liquidacion_id, registrado_por, tipo_pago_id, monto, referencia)
  values (p_liquidacion_id, auth.uid(), p_tipo_pago_id, liquidacion.monto_liquidar, nullif(trim(p_referencia), ''))
  returning id into nuevo_pago;
  update public.liquidaciones set estado = 'pagada' where id = p_liquidacion_id;
  insert into public.registros_auditoria(usuario_id, accion, tabla, registro_id, detalles)
  values (auth.uid(), 'pagar_liquidacion', 'liquidaciones', p_liquidacion_id,
          jsonb_build_object('pago_id', nuevo_pago, 'monto', liquidacion.monto_liquidar, 'tipo_pago_id', p_tipo_pago_id));
  return nuevo_pago;
end;
$$;
revoke all on function public.admin_pagar_liquidacion(uuid, smallint, text) from public;
grant execute on function public.admin_pagar_liquidacion(uuid, smallint, text) to authenticated;

-- Deshabilita la antigua acción que cambiaba el estado sin registrar el pago.
revoke all on function public.admin_marcar_liquidacion_pagada(uuid) from public, authenticated;

commit;
