-- Rassa JALA · Operaciones administrativas transaccionales
-- Ejecutar después de supabase_rassa.sql y admin_workflows_supabase.sql.

-- Conserva las líneas incluidas en cada liquidación para impedir que una venta
-- vuelva a liquidarse si se generan periodos que se traslapan.
create table if not exists public.ventas_liquidacion (
  id uuid primary key default gen_random_uuid(),
  liquidacion_id uuid not null references public.liquidaciones(id) on delete restrict,
  detalle_pedido_id uuid not null unique references public.detalles_pedido(id) on delete restrict,
  monto_venta numeric(12,2) not null check (monto_venta >= 0),
  creado_en timestamptz not null default now()
);
alter table public.ventas_liquidacion enable row level security;
drop policy if exists ventas_liquidacion_admin_read on public.ventas_liquidacion;
create policy ventas_liquidacion_admin_read on public.ventas_liquidacion
  for select to authenticated using (public.tiene_rol(array['administrador']));

-- El checkout calcula el crédito después de sumar las líneas y antes de confirmar
-- el pedido. Bloquea familia/miembros y pedidos pendientes para evitar sobrepasos
-- por dos compras simultáneas de miembros distintos.
create or replace function public.crear_pedido(lineas jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  nuevo_pedido uuid := gen_random_uuid();
  pendiente_id smallint;
  linea jsonb;
  publicado uuid;
  cantidad_solicitada numeric(12,3);
  stock_actual numeric(12,3);
  precio_actual numeric(12,2);
  nombre_actual text;
  unidad_actual text;
  v_familia_id uuid;
  limite_credito numeric(12,2);
  gasto_actual numeric(14,2);
begin
  if auth.uid() is null or not public.tiene_rol(array['comprador']) then
    raise exception 'Solo un comprador autenticado puede crear pedidos';
  end if;
  if lineas is null or jsonb_typeof(lineas) <> 'array' or jsonb_array_length(lineas) = 0 then
    raise exception 'El pedido debe contener al menos un producto';
  end if;
  if exists (select 1 from jsonb_array_elements(lineas) e group by (e->>'producto_publicado_id') having count(*) > 1) then
    raise exception 'Cada producto publicado debe aparecer una sola vez';
  end if;

  select id into strict pendiente_id from public.estados_pedido where nombre = 'pendiente';
  insert into public.pedidos(id, comprador_id, estado_id) values (nuevo_pedido, auth.uid(), pendiente_id);
  for linea in select value from jsonb_array_elements(lineas) order by (value->>'producto_publicado_id') loop
    publicado := (linea->>'producto_publicado_id')::uuid;
    cantidad_solicitada := (linea->>'cantidad')::numeric;
    if cantidad_solicitada is null or cantidad_solicitada <= 0 then raise exception 'La cantidad debe ser mayor que cero'; end if;
    select pp.stock_disponible, pp.precio, pr.nombre, u.nombre
      into stock_actual, precio_actual, nombre_actual, unidad_actual
    from public.productos_publicados pp
    join public.publicaciones_semanales ps on ps.id = pp.publicacion_id
    join public.productos pr on pr.id = pp.producto_id
    join public.unidades u on u.id = pp.unidad_id
    where pp.id = publicado and pp.activo and pr.activo and ps.estado = 'publicada'
    for update of pp;
    if not found then raise exception 'Producto no disponible: %', publicado; end if;
    if stock_actual < cantidad_solicitada then raise exception 'Existencia insuficiente para %', nombre_actual; end if;
    update public.productos_publicados set stock_disponible = stock_disponible - cantidad_solicitada where id = publicado;
    insert into public.detalles_pedido(pedido_id, producto_publicado_id, nombre_producto_snapshot, unidad_snapshot, precio_unitario, cantidad)
    values (nuevo_pedido, publicado, nombre_actual, unidad_actual, precio_actual, cantidad_solicitada);
  end loop;

  select i.familia_id into v_familia_id from public.integrantes_familia i
    join public.familias f on f.id = i.familia_id and f.activa where i.usuario_id = auth.uid();
  if v_familia_id is not null then
    perform 1 from public.familias where id = v_familia_id for update;
    perform i.usuario_id from public.integrantes_familia i where i.familia_id = v_familia_id order by i.usuario_id for update;
  end if;
  select limite into limite_credito from public.limites_credito where comprador_id = auth.uid() for update;
  if found then
    perform p.id from public.pedidos p
      where p.estado_id = pendiente_id
        and (p.comprador_id = auth.uid() or (v_familia_id is not null and p.comprador_id in
          (select i.usuario_id from public.integrantes_familia i where i.familia_id = v_familia_id)))
      order by p.id for update;
    select coalesce(sum(t.total), 0)::numeric(14,2) into gasto_actual
      from public.pedidos p join public.totales_pedido t on t.pedido_id = p.id
      where p.estado_id = pendiente_id
        and (p.comprador_id = auth.uid() or (v_familia_id is not null and p.comprador_id in
          (select i.usuario_id from public.integrantes_familia i where i.familia_id = v_familia_id)));
    if gasto_actual > limite_credito then
      raise exception 'El pedido excede el límite de crédito. Límite: % MXN; saldo pendiente de la familia: % MXN', limite_credito, gasto_actual;
    end if;
  end if;
  insert into public.historial_pedido(pedido_id, estado_nuevo_id, cambiado_por, comentario)
  values (nuevo_pedido, pendiente_id, auth.uid(), 'Pedido creado por el comprador');
  return nuevo_pedido;
end;
$$;
revoke all on function public.crear_pedido(jsonb) from public;
grant execute on function public.crear_pedido(jsonb) to authenticated;

create or replace function public.admin_registrar_pago(
  p_pedido_id uuid,
  p_tipo_pago_id smallint,
  p_monto numeric,
  p_referencia text default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  total_pedido numeric(14,2);
  pagado numeric(14,2);
  nuevo_pago uuid;
  nombre_tipo text;
  estado_pedido text;
begin
  if not public.tiene_rol(array['administrador']) then raise exception 'Solo un administrador puede registrar pagos'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if p_monto <> round(p_monto, 2) then raise exception 'El monto debe expresarse con máximo dos decimales'; end if;
  select ep.nombre into estado_pedido from public.pedidos p
    join public.estados_pedido ep on ep.id = p.estado_id where p.id = p_pedido_id for update of p;
  if not found then raise exception 'El pedido no existe'; end if;
  if estado_pedido = 'cancelado' then raise exception 'No se aceptan pagos para pedidos cancelados'; end if;
  select total into total_pedido from public.totales_pedido where pedido_id = p_pedido_id;
  select coalesce(sum(monto), 0) into pagado from public.pagos where pedido_id = p_pedido_id and estado = 'registrado';
  if pagado + p_monto > total_pedido then raise exception 'El pago excede el saldo pendiente (% MXN)', total_pedido - pagado; end if;
  select nombre into nombre_tipo from public.tipos_pago where id = p_tipo_pago_id and activo;
  if nombre_tipo is null then raise exception 'El método de pago no está activo'; end if;
  insert into public.pagos(pedido_id, tipo_pago_id, registrado_por, monto, referencia)
  values (p_pedido_id, p_tipo_pago_id, auth.uid(), p_monto, nullif(trim(p_referencia), '')) returning id into nuevo_pago;
  insert into public.recibos(pago_id, folio)
  values (nuevo_pago, 'RASSA-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(nuevo_pago::text, '-', ''), 1, 8)));
  insert into public.registros_auditoria(usuario_id, accion, tabla, registro_id, detalles)
  values (auth.uid(), 'registrar_pago', 'pagos', nuevo_pago, jsonb_build_object('pedido_id', p_pedido_id, 'monto', p_monto, 'metodo', nombre_tipo));
  return nuevo_pago;
end;
$$;
revoke all on function public.admin_registrar_pago(uuid, smallint, numeric, text) from public;
grant execute on function public.admin_registrar_pago(uuid, smallint, numeric, text) to authenticated;

create or replace function public.admin_abrir_corte_caja()
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  nuevo_corte uuid;
  teorico numeric(12,2);
begin
  if not public.tiene_rol(array['administrador']) then raise exception 'Solo un administrador puede abrir cortes de caja'; end if;
  perform 1 from public.perfiles where id = auth.uid() for update;
  if exists(select 1 from public.cortes_caja where abierto_por = auth.uid() and estado = 'abierto') then
    raise exception 'Ya tienes un corte de caja abierto';
  end if;
  select coalesce(sum(pg.monto), 0)::numeric(12,2) into teorico
  from public.pagos pg join public.tipos_pago tp on tp.id = pg.tipo_pago_id
  where pg.registrado_por = auth.uid() and pg.estado = 'registrado'
    and tp.nombre = 'efectivo' and pg.creado_en::date = current_date;
  insert into public.cortes_caja(abierto_por, monto_teorico) values (auth.uid(), teorico) returning id into nuevo_corte;
  insert into public.registros_auditoria(usuario_id, accion, tabla, registro_id, detalles)
  values (auth.uid(), 'abrir_corte_caja', 'cortes_caja', nuevo_corte, jsonb_build_object('monto_teorico', teorico));
  return nuevo_corte;
end;
$$;
revoke all on function public.admin_abrir_corte_caja() from public;
grant execute on function public.admin_abrir_corte_caja() to authenticated;

create or replace function public.admin_cerrar_corte_caja(p_corte_id uuid, p_monto_real numeric)
returns void
language plpgsql security definer set search_path = '' as $$
declare teorico numeric(12,2); abierto_por_id uuid;
begin
  if not public.tiene_rol(array['administrador']) then raise exception 'Solo un administrador puede cerrar cortes de caja'; end if;
  if p_monto_real is null or p_monto_real < 0 then raise exception 'El monto real no puede ser negativo'; end if;
  select monto_teorico, abierto_por into teorico, abierto_por_id from public.cortes_caja where id = p_corte_id and estado = 'abierto' for update;
  if not found then raise exception 'El corte no existe o ya fue cerrado'; end if;
  update public.cortes_caja set monto_real = p_monto_real,
    estado = case when p_monto_real = teorico then 'cuadrado' else 'cerrado' end,
    cerrado_por = auth.uid(), cerrado_en = now() where id = p_corte_id;
  insert into public.registros_auditoria(usuario_id, accion, tabla, registro_id, detalles)
  values (auth.uid(), 'cerrar_corte_caja', 'cortes_caja', p_corte_id,
    jsonb_build_object('abierto_por', abierto_por_id, 'monto_teorico', teorico, 'monto_real', p_monto_real, 'diferencia', p_monto_real - teorico));
end;
$$;
revoke all on function public.admin_cerrar_corte_caja(uuid, numeric) from public;
grant execute on function public.admin_cerrar_corte_caja(uuid, numeric) to authenticated;

create or replace function public.admin_registrar_merma(
  p_producto_publicado_id uuid, p_decision_id smallint, p_cantidad numeric, p_motivo text
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare disponible numeric(12,3); nueva_merma uuid;
begin
  if not public.tiene_rol(array['administrador']) then raise exception 'Solo un administrador puede registrar mermas'; end if;
  if p_cantidad is null or p_cantidad <= 0 or length(trim(coalesce(p_motivo, ''))) = 0 then raise exception 'Indica cantidad y motivo'; end if;
  select stock_disponible into disponible from public.productos_publicados where id = p_producto_publicado_id and activo for update;
  if not found then raise exception 'El producto publicado no existe o está inactivo'; end if;
  if p_cantidad > disponible then raise exception 'La cantidad supera el stock disponible (%)', disponible; end if;
  if not exists(select 1 from public.decisiones_merma where id = p_decision_id) then raise exception 'Decisión de merma desconocida'; end if;
  update public.productos_publicados set stock_disponible = stock_disponible - p_cantidad where id = p_producto_publicado_id;
  insert into public.mermas(producto_publicado_id, registrado_por, decision_id, cantidad, motivo)
  values (p_producto_publicado_id, auth.uid(), p_decision_id, p_cantidad, trim(p_motivo)) returning id into nueva_merma;
  insert into public.registros_auditoria(usuario_id, accion, tabla, registro_id, detalles)
  values (auth.uid(), 'registrar_merma', 'mermas', nueva_merma, jsonb_build_object('producto_publicado_id', p_producto_publicado_id, 'cantidad', p_cantidad));
  return nueva_merma;
end;
$$;
revoke all on function public.admin_registrar_merma(uuid, smallint, numeric, text) from public;
grant execute on function public.admin_registrar_merma(uuid, smallint, numeric, text) to authenticated;

create or replace function public.admin_generar_liquidaciones(p_inicio date, p_fin date)
returns integer
language plpgsql security definer set search_path = '' as $$
declare creadas integer;
begin
  if not public.tiene_rol(array['administrador']) then raise exception 'Solo un administrador puede generar liquidaciones'; end if;
  if p_inicio is null or p_fin is null or p_fin < p_inicio then raise exception 'Periodo de fechas inválido'; end if;
  with ventas_elegibles as materialized (
    select dp.id as detalle_id, ps.agricultor_id,
      (dp.precio_unitario * dp.cantidad)::numeric(12,2) as monto_venta
    from public.pedidos p
    join public.estados_pedido ep on ep.id = p.estado_id and ep.nombre = 'entregado'
    join public.detalles_pedido dp on dp.pedido_id = p.id
    join public.productos_publicados pp on pp.id = dp.producto_publicado_id
    join public.publicaciones_semanales ps on ps.id = pp.publicacion_id
    where p.creado_en::date between p_inicio and p_fin
      and not exists (select 1 from public.ventas_liquidacion vl where vl.detalle_pedido_id = dp.id)
  ), ventas_por_agricultor as (
    select agricultor_id, sum(monto_venta)::numeric(12,2) as ventas
    from ventas_elegibles group by agricultor_id
  ), insertadas as (
    insert into public.liquidaciones(agricultor_id, periodo_inicio, periodo_fin, ventas, comision, estado)
    select agricultor_id, p_inicio, p_fin, ventas, round(ventas * 0.10, 2), 'pendiente' from ventas_por_agricultor
    on conflict (agricultor_id, periodo_inicio, periodo_fin) do nothing
    returning id, agricultor_id
  ), ventas_vinculadas as (
    insert into public.ventas_liquidacion(liquidacion_id, detalle_pedido_id, monto_venta)
    select i.id, v.detalle_id, v.monto_venta
    from insertadas i join ventas_elegibles v on v.agricultor_id = i.agricultor_id
    returning id
  ) select count(*) into creadas from insertadas;
  if creadas = 0 then raise exception 'No hay ventas entregadas nuevas para el periodo indicado'; end if;
  insert into public.registros_auditoria(usuario_id, accion, tabla, detalles)
  values (auth.uid(), 'generar_liquidaciones', 'liquidaciones', jsonb_build_object('inicio', p_inicio, 'fin', p_fin, 'cantidad', creadas, 'comision', 0.10));
  return creadas;
end;
$$;
revoke all on function public.admin_generar_liquidaciones(date, date) from public;
grant execute on function public.admin_generar_liquidaciones(date, date) to authenticated;

create or replace function public.admin_marcar_liquidacion_pagada(p_liquidacion_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.tiene_rol(array['administrador']) then raise exception 'Solo un administrador puede pagar liquidaciones'; end if;
  update public.liquidaciones set estado = 'pagada' where id = p_liquidacion_id and estado in ('pendiente','parcial');
  if not found then raise exception 'Liquidación inexistente o ya pagada'; end if;
  insert into public.registros_auditoria(usuario_id, accion, tabla, registro_id)
  values (auth.uid(), 'marcar_liquidacion_pagada', 'liquidaciones', p_liquidacion_id);
end;
$$;
revoke all on function public.admin_marcar_liquidacion_pagada(uuid) from public;
grant execute on function public.admin_marcar_liquidacion_pagada(uuid) to authenticated;
