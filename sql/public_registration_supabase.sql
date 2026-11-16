-- Rassa JALA · Registro público de compradores y vendedores
-- Ejecutar una vez en Supabase SQL Editor después del esquema base.
-- El registro nunca permite crear administradores ni agricultores.

create or replace function public.crear_perfil_comprador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nuevo_rol smallint;
  nombre_rol text;
begin
  nombre_rol := coalesce(nullif(new.raw_user_meta_data->>'rol_publico',''), 'comprador');
  if nombre_rol not in ('comprador','vendedor') then
    raise exception 'El registro público solo permite los roles comprador y vendedor';
  end if;

  select id into nuevo_rol from public.roles where nombre = nombre_rol;
  if nuevo_rol is null then raise exception 'El rol solicitado no está configurado'; end if;

  insert into public.perfiles(id, rol_id, nombres, apellido_paterno, apellido_materno, telefono, domicilio)
  values (
    new.id,
    nuevo_rol,
    coalesce(nullif(new.raw_user_meta_data->>'nombres',''), 'Pendiente'),
    coalesce(nullif(new.raw_user_meta_data->>'apellido_paterno',''), 'Pendiente'),
    nullif(new.raw_user_meta_data->>'apellido_materno',''),
    nullif(new.raw_user_meta_data->>'telefono',''),
    nullif(new.raw_user_meta_data->>'domicilio','')
  );
  return new;
end;
$$;
revoke all on function public.crear_perfil_comprador() from public, anon, authenticated;

-- Las transiciones y el historial de pedidos se escriben únicamente por RPCs verificadas.
drop policy if exists pedido_update_staff on public.pedidos;
create policy pedido_update_staff on public.pedidos for update to authenticated
using (public.tiene_rol(array['administrador']))
with check (public.tiene_rol(array['administrador']));
drop policy if exists historial_staff_write on public.historial_pedido;
create policy historial_staff_write on public.historial_pedido for insert to authenticated
with check (public.tiene_rol(array['administrador']));

-- Limita los datos personales visibles para el vendedor a clientes con pedido asignado.
drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles for select to authenticated
using (
  id = (select auth.uid())
  or public.tiene_rol(array['administrador'])
  or (
    public.tiene_rol(array['vendedor'])
    and exists (
      select 1 from public.pedidos p
      where p.vendedor_id = (select auth.uid()) and p.comprador_id = perfiles.id
    )
  )
);

-- Hasta implementar el flujo financiero del vendedor, limita escrituras financieras al admin.
drop policy if exists pagos_partes_select on public.pagos;
create policy pagos_partes_select on public.pagos for select to authenticated
using (
  public.tiene_rol(array['administrador'])
  or exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and (p.comprador_id = (select auth.uid()) or p.vendedor_id = (select auth.uid()))
  )
);
drop policy if exists pagos_staff_write on public.pagos;
create policy pagos_staff_write on public.pagos for insert to authenticated
with check (public.tiene_rol(array['administrador']));
drop policy if exists recibos_partes_select on public.recibos;
create policy recibos_partes_select on public.recibos for select to authenticated
using (
  public.tiene_rol(array['administrador'])
  or exists (
    select 1 from public.pagos pg join public.pedidos p on p.id = pg.pedido_id
    where pg.id = pago_id and (p.comprador_id = (select auth.uid()) or p.vendedor_id = (select auth.uid()))
  )
);
drop policy if exists recibos_staff_write on public.recibos;
create policy recibos_staff_write on public.recibos for insert to authenticated
with check (public.tiene_rol(array['administrador']));

-- El vendedor aún no tiene pantallas transaccionales para recolecciones, mermas o caja.
drop policy if exists recoleccion_staff_read on public.recolecciones;
create policy recoleccion_staff_read on public.recolecciones for select to authenticated
using (agricultor_id = (select auth.uid()) or public.tiene_rol(array['administrador']));
drop policy if exists recoleccion_staff_write on public.recolecciones;
create policy recoleccion_staff_write on public.recolecciones for all to authenticated
using (public.tiene_rol(array['administrador']))
with check (public.tiene_rol(array['administrador']));
drop policy if exists mermas_staff_read on public.mermas;
create policy mermas_staff_read on public.mermas for select to authenticated
using (
  public.tiene_rol(array['administrador'])
  or exists (
    select 1 from public.productos_publicados pp
    join public.publicaciones_semanales ps on ps.id = pp.publicacion_id
    where pp.id = producto_publicado_id and ps.agricultor_id = (select auth.uid())
  )
);
drop policy if exists mermas_staff_write on public.mermas;
create policy mermas_staff_write on public.mermas for insert to authenticated
with check (
  public.tiene_rol(array['administrador'])
  or exists (
    select 1 from public.productos_publicados pp
    join public.publicaciones_semanales ps on ps.id = pp.publicacion_id
    where pp.id = producto_publicado_id and ps.agricultor_id = (select auth.uid())
  )
);
drop policy if exists cortes_admin_vendedor on public.cortes_caja;
create policy cortes_admin_vendedor on public.cortes_caja for all to authenticated
using (public.tiene_rol(array['administrador']))
with check (public.tiene_rol(array['administrador']));
