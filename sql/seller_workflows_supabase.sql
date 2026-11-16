-- Rassa JALA · Operación segura de pedidos por vendedor
-- Ejecutar después de supabase_rassa.sql y sql/admin_workflows_supabase.sql.
-- El vendedor autenticado solo puede avanzar pedidos que están asignados a su cuenta.

-- Endurece instalaciones existentes: vendedores cambian pedidos e historial únicamente
-- mediante la RPC de abajo, que verifica asignación y transición de estado.
drop policy if exists pedido_update_staff on public.pedidos;
create policy pedido_update_staff on public.pedidos for update to authenticated
  using (public.tiene_rol(array['administrador']))
  with check (public.tiene_rol(array['administrador']));
drop policy if exists historial_staff_write on public.historial_pedido;
create policy historial_staff_write on public.historial_pedido for insert to authenticated
  with check (public.tiene_rol(array['administrador']));

create or replace function public.vendedor_avanzar_pedido(
  p_pedido_id uuid,
  p_nuevo_estado text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  estado_actual text;
  estado_destino_id smallint;
  vendedor_asignado uuid;
  siguiente text;
begin
  if not public.tiene_rol(array['vendedor']) then
    raise exception 'Solo una cuenta vendedora activa puede actualizar pedidos';
  end if;

  select e.nombre, p.vendedor_id into estado_actual, vendedor_asignado
  from public.pedidos p
  join public.estados_pedido e on e.id = p.estado_id
  where p.id = p_pedido_id
  for update of p;

  if not found then raise exception 'El pedido no existe'; end if;
  if vendedor_asignado is distinct from auth.uid() then
    raise exception 'Este pedido no está asignado a tu cuenta';
  end if;
  siguiente := case estado_actual
    when 'pendiente' then 'confirmado'
    when 'confirmado' then 'en_preparacion'
    when 'en_preparacion' then 'listo_para_retirar'
    when 'listo_para_retirar' then 'entregado'
    else null
  end;
  if siguiente is null or p_nuevo_estado is distinct from siguiente then
    raise exception 'Transición no permitida: desde % solo se puede avanzar a %', estado_actual, coalesce(siguiente, 'ninguno');
  end if;

  select id into estado_destino_id from public.estados_pedido where nombre = p_nuevo_estado;
  if estado_destino_id is null then raise exception 'Estado de pedido desconocido'; end if;

  update public.pedidos set estado_id = estado_destino_id, actualizado_en = now()
  where id = p_pedido_id;

  insert into public.historial_pedido(pedido_id, estado_anterior_id, estado_nuevo_id, cambiado_por, comentario)
  select p_pedido_id, anterior.id, estado_destino_id, auth.uid(),
         'Estado actualizado por el vendedor asignado'
  from public.estados_pedido anterior where anterior.nombre = estado_actual;

  insert into public.registros_auditoria(usuario_id, accion, tabla, registro_id, detalles)
  values (auth.uid(), 'vendedor_avanzar_pedido', 'pedidos', p_pedido_id,
          jsonb_build_object('anterior', estado_actual, 'nuevo', p_nuevo_estado));
end;
$$;

revoke all on function public.vendedor_avanzar_pedido(uuid, text) from public;
grant execute on function public.vendedor_avanzar_pedido(uuid, text) to authenticated;
