-- Rassa JALA · RPCs transaccionales para operaciones del panel admin
-- Ejecutar una vez en Supabase SQL Editor después de supabase_rassa.sql.
-- Las funciones validan el rol en la base de datos y ejecutan cada flujo dentro
-- de una sola transacción para conservar stock e historial coherentes.

create or replace function public.admin_cambiar_estado_pedido(
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
  linea record;
  siguiente text;
begin
  if not public.tiene_rol(array['administrador']) then
    raise exception 'Solo un administrador puede actualizar pedidos';
  end if;

  select e.nombre into estado_actual
  from public.pedidos p
  join public.estados_pedido e on e.id = p.estado_id
  where p.id = p_pedido_id
  for update of p;

  if not found then raise exception 'El pedido no existe'; end if;
  if estado_actual in ('entregado','cancelado') then
    raise exception 'El pedido ya está en un estado final';
  end if;
  if p_nuevo_estado = 'cancelado' then
    siguiente := 'cancelado';
  else
    siguiente := case estado_actual
      when 'pendiente' then 'confirmado'
      when 'confirmado' then 'en_preparacion'
      when 'en_preparacion' then 'listo_para_retirar'
      when 'listo_para_retirar' then 'entregado'
      else null
    end;
    if siguiente is null or p_nuevo_estado <> siguiente then
      raise exception 'Transición no permitida: desde % solo se puede avanzar a % o cancelar', estado_actual, coalesce(siguiente, 'ninguno');
    end if;
  end if;

  select id into estado_destino_id from public.estados_pedido where nombre = p_nuevo_estado;
  if estado_destino_id is null then raise exception 'Estado de pedido desconocido'; end if;

  if p_nuevo_estado = 'cancelado' then
    for linea in
      select producto_publicado_id, cantidad
      from public.detalles_pedido
      where pedido_id = p_pedido_id
      order by producto_publicado_id
    loop
      update public.productos_publicados
      set stock_disponible = least(stock_inicial, stock_disponible + linea.cantidad)
      where id = linea.producto_publicado_id;
    end loop;
  end if;

  update public.pedidos
  set estado_id = estado_destino_id, actualizado_en = now()
  where id = p_pedido_id;

  insert into public.historial_pedido(pedido_id, estado_anterior_id, estado_nuevo_id, cambiado_por, comentario)
  select p_pedido_id, old_state.id, estado_destino_id, auth.uid(),
         case when p_nuevo_estado = 'cancelado' then 'Pedido cancelado desde el panel administrativo' else 'Estado actualizado desde el panel administrativo' end
  from public.estados_pedido old_state
  where old_state.nombre = estado_actual;

  insert into public.registros_auditoria(usuario_id, accion, tabla, registro_id, detalles)
  values (auth.uid(), 'cambiar_estado_pedido', 'pedidos', p_pedido_id,
          jsonb_build_object('anterior', estado_actual, 'nuevo', p_nuevo_estado));
end;
$$;

revoke all on function public.admin_cambiar_estado_pedido(uuid, text) from public;
grant execute on function public.admin_cambiar_estado_pedido(uuid, text) to authenticated;

create or replace function public.admin_asignar_vendedor(
  p_pedido_id uuid,
  p_vendedor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  vendedor_nombre text;
begin
  if not public.tiene_rol(array['administrador']) then
    raise exception 'Solo un administrador puede asignar vendedores';
  end if;
  if p_vendedor_id is not null then
    select p.nombres || ' ' || p.apellido_paterno into vendedor_nombre
    from public.perfiles p
    join public.roles r on r.id = p.rol_id
    where p.id = p_vendedor_id and p.activo and r.nombre = 'vendedor';
    if vendedor_nombre is null then raise exception 'Selecciona una cuenta activa con rol vendedor'; end if;
  end if;

  update public.pedidos
  set vendedor_id = p_vendedor_id, actualizado_en = now()
  where id = p_pedido_id;
  if not found then raise exception 'El pedido no existe'; end if;

  insert into public.registros_auditoria(usuario_id, accion, tabla, registro_id, detalles)
  values (auth.uid(), 'asignar_vendedor_pedido', 'pedidos', p_pedido_id,
          jsonb_build_object('vendedor_id', p_vendedor_id, 'vendedor', vendedor_nombre));
end;
$$;

revoke all on function public.admin_asignar_vendedor(uuid, uuid) from public;
grant execute on function public.admin_asignar_vendedor(uuid, uuid) to authenticated;
