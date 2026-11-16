-- RASSA JALA · Esquema físico PostgreSQL para Supabase
-- Ejecutar en un proyecto Supabase vacío (SQL Editor o migración CLI).
-- No incluye cuentas ni datos ficticios. Auth se delega a Supabase Auth.
-- Precios y totales son importes finales sin IVA. Las unidades se administran
-- en catálogo y no se incluye libra como unidad predeterminada.

begin;

create extension if not exists pgcrypto;

-- Catálogos de acceso y datos de negocio
create table public.roles (
  id smallint generated always as identity primary key,
  nombre text not null unique check (nombre in ('administrador','vendedor','agricultor','comprador')),
  descripcion text not null default '',
  creado_en timestamptz not null default now()
);

insert into public.roles (nombre, descripcion) values
 ('administrador','Administra usuarios, catálogos y operación'),
 ('vendedor','Gestiona pedidos, pagos y entregas'),
 ('agricultor','Publica productos y atiende conversaciones'),
 ('comprador','Consulta catálogo, realiza pedidos y chatea')
on conflict (nombre) do nothing;

create table public.municipios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(trim(nombre)) > 0),
  creado_en timestamptz not null default now()
);

create table public.localidades (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id) on delete restrict,
  nombre text not null check (length(trim(nombre)) > 0),
  creado_en timestamptz not null default now(),
  unique (municipio_id, nombre)
);

-- auth.users es la fuente de identidad/contraseña; aquí solo se guarda el perfil.
create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol_id smallint not null references public.roles(id) on delete restrict,
  nombres text not null check (length(trim(nombres)) > 0),
  apellido_paterno text not null check (length(trim(apellido_paterno)) > 0),
  apellido_materno text,
  telefono text unique check (telefono is null or telefono ~ '^[+0-9() -]{7,20}$'),
  fecha_nacimiento date,
  domicilio text,
  localidad_id uuid references public.localidades(id) on delete set null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(trim(nombre)) > 0),
  descripcion text,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Catálogo configurable: no se predefine ni fuerza la unidad libra.
create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(trim(nombre)) > 0),
  abreviatura text not null unique check (length(trim(abreviatura)) > 0),
  permite_fraccion boolean not null default false,
  activa boolean not null default true
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.categorias(id) on delete restrict,
  nombre text not null check (length(trim(nombre)) > 0),
  descripcion text,
  es_perecedero boolean not null default false,
  activo boolean not null default true,
  creado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  unique (categoria_id, nombre)
);

create table public.imagenes_producto (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  ruta_storage text not null unique,
  texto_alternativo text,
  es_principal boolean not null default false,
  orden smallint not null default 0 check (orden >= 0),
  creado_en timestamptz not null default now()
);
create unique index una_imagen_principal_por_producto
  on public.imagenes_producto(producto_id) where es_principal;

create table public.publicaciones_semanales (
  id uuid primary key default gen_random_uuid(),
  agricultor_id uuid not null references public.perfiles(id) on delete restrict,
  fecha_publicacion date not null,
  estado text not null default 'borrador' check (estado in ('borrador','publicada','cerrada')),
  creado_en timestamptz not null default now(),
  unique (agricultor_id, fecha_publicacion),
  check (extract(isodow from fecha_publicacion) = 1)
);

create table public.productos_publicados (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones_semanales(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete restrict,
  unidad_id uuid not null references public.unidades(id) on delete restrict,
  precio numeric(12,2) not null check (precio >= 0),
  stock_inicial numeric(12,3) not null check (stock_inicial >= 0),
  stock_disponible numeric(12,3) not null check (stock_disponible >= 0 and stock_disponible <= stock_inicial),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (publicacion_id, producto_id),
  unique (id, unidad_id)
);

create table public.estados_pedido (
  id smallint generated always as identity primary key,
  nombre text not null unique check (nombre in ('pendiente','confirmado','en_preparacion','listo_para_retirar','entregado','cancelado')),
  descripcion text not null default ''
);
insert into public.estados_pedido(nombre, descripcion) values
 ('pendiente','Pedido recibido y pendiente de revisión'),('confirmado','Pedido aceptado'),
 ('en_preparacion','Pedido en preparación'),('listo_para_retirar','Listo para recolección'),
 ('entregado','Entregado al comprador'),('cancelado','Pedido cancelado') on conflict do nothing;

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  comprador_id uuid not null references public.perfiles(id) on delete restrict,
  vendedor_id uuid references public.perfiles(id) on delete set null,
  estado_id smallint not null references public.estados_pedido(id) on delete restrict,
  moneda char(3) not null default 'MXN' check (moneda = 'MXN'),
  notas text,
  vence_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.detalles_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  producto_publicado_id uuid not null references public.productos_publicados(id) on delete restrict,
  nombre_producto_snapshot text not null,
  unidad_snapshot text not null,
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  cantidad numeric(12,3) not null check (cantidad > 0),
  creado_en timestamptz not null default now(),
  unique (pedido_id, producto_publicado_id)
);
create index detalles_pedido_pedido_idx on public.detalles_pedido(pedido_id);

-- Subtotal/total se calculan a partir de los detalles; no se almacena IVA.
create view public.totales_pedido with (security_invoker = true) as
select p.id as pedido_id,
       coalesce(sum(d.precio_unitario * d.cantidad), 0)::numeric(14,2) as subtotal,
       coalesce(sum(d.precio_unitario * d.cantidad), 0)::numeric(14,2) as total
from public.pedidos p left join public.detalles_pedido d on d.pedido_id = p.id
group by p.id;

create table public.historial_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  estado_anterior_id smallint references public.estados_pedido(id) on delete restrict,
  estado_nuevo_id smallint not null references public.estados_pedido(id) on delete restrict,
  cambiado_por uuid references public.perfiles(id) on delete set null,
  comentario text,
  creado_en timestamptz not null default now()
);

create table public.tipos_pago (
  id smallint generated always as identity primary key,
  nombre text not null unique check (nombre in ('efectivo','transferencia','deposito')),
  activo boolean not null default true
);
insert into public.tipos_pago(nombre) values ('efectivo'),('transferencia'),('deposito') on conflict do nothing;

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete restrict,
  tipo_pago_id smallint not null references public.tipos_pago(id) on delete restrict,
  registrado_por uuid references public.perfiles(id) on delete set null,
  monto numeric(12,2) not null check (monto > 0),
  referencia text,
  estado text not null default 'registrado' check (estado in ('registrado','reembolsado','anulado')),
  creado_en timestamptz not null default now()
);

create table public.recibos (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null unique references public.pagos(id) on delete restrict,
  folio text not null unique,
  emitido_en timestamptz not null default now()
);

create table public.familias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  jefe_id uuid references public.perfiles(id) on delete set null,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);
create table public.integrantes_familia (
  familia_id uuid not null references public.familias(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  unido_en timestamptz not null default now(),
  primary key (familia_id, usuario_id),
  unique (usuario_id)
);
create table public.limites_credito (
  comprador_id uuid primary key references public.perfiles(id) on delete cascade,
  limite numeric(12,2) not null check (limite >= 0),
  actualizado_en timestamptz not null default now()
);

create table public.conversaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text,
  tipo text not null default 'privada' check (tipo in ('privada','grupal')),
  creada_por uuid references public.perfiles(id) on delete set null,
  creada_en timestamptz not null default now(),
  activa boolean not null default true
);
create table public.integrantes_conversacion (
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  unido_en timestamptz not null default now(),
  primary key (conversacion_id, usuario_id)
);
create table public.mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  emisor_id uuid not null references public.perfiles(id) on delete restrict,
  contenido text check (contenido is null or length(contenido) <= 10000),
  creado_en timestamptz not null default now(),
  editado_en timestamptz,
  eliminado_en timestamptz,
  -- Puede ser NULL si el mensaje contiene solamente una o más imágenes adjuntas.
  check (contenido is null or length(trim(contenido)) > 0)
);
create index mensajes_conversacion_fecha_idx on public.mensajes(conversacion_id, creado_en desc);
create table public.adjuntos_mensaje (
  id uuid primary key default gen_random_uuid(),
  mensaje_id uuid not null references public.mensajes(id) on delete cascade,
  subido_por uuid not null references public.perfiles(id) on delete restrict,
  ruta_storage text not null unique,
  nombre_archivo text not null,
  mime_type text not null check (mime_type like 'image/%'),
  bytes bigint not null check (bytes > 0 and bytes <= 10485760),
  creado_en timestamptz not null default now()
);

create table public.recolecciones (
  id uuid primary key default gen_random_uuid(),
  agricultor_id uuid not null references public.perfiles(id) on delete restrict,
  fecha date not null,
  hora_inicio time,
  hora_fin time,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_ruta','recolectada','cancelada')),
  comentarios text,
  creado_en timestamptz not null default now(),
  check (hora_fin is null or hora_inicio is null or hora_fin > hora_inicio)
);

create table public.decisiones_merma (
  id smallint generated always as identity primary key,
  nombre text not null unique check (nombre in ('donar','desechar','vender_barato','compostar'))
);
insert into public.decisiones_merma(nombre) values ('donar'),('desechar'),('vender_barato'),('compostar') on conflict do nothing;
create table public.mermas (
  id uuid primary key default gen_random_uuid(),
  producto_publicado_id uuid not null references public.productos_publicados(id) on delete restrict,
  registrado_por uuid references public.perfiles(id) on delete set null,
  decision_id smallint not null references public.decisiones_merma(id) on delete restrict,
  cantidad numeric(12,3) not null check (cantidad > 0),
  motivo text not null,
  creado_en timestamptz not null default now()
);

create table public.cortes_caja (
  id uuid primary key default gen_random_uuid(),
  abierto_por uuid not null references public.perfiles(id) on delete restrict,
  cerrado_por uuid references public.perfiles(id) on delete set null,
  monto_teorico numeric(12,2) not null default 0 check (monto_teorico >= 0),
  monto_real numeric(12,2) check (monto_real is null or monto_real >= 0),
  estado text not null default 'abierto' check (estado in ('abierto','cerrado','cuadrado')),
  abierto_en timestamptz not null default now(),
  cerrado_en timestamptz,
  check ((estado = 'abierto' and cerrado_en is null) or (estado <> 'abierto' and cerrado_en is not null))
);

create table public.liquidaciones (
  id uuid primary key default gen_random_uuid(),
  agricultor_id uuid not null references public.perfiles(id) on delete restrict,
  periodo_inicio date not null,
  periodo_fin date not null,
  ventas numeric(12,2) not null check (ventas >= 0),
  comision numeric(12,2) not null default 0 check (comision >= 0 and comision <= ventas),
  monto_liquidar numeric(12,2) generated always as (ventas - comision) stored,
  estado text not null default 'pendiente' check (estado in ('pendiente','pagada','parcial')),
  creado_en timestamptz not null default now(),
  check (periodo_fin >= periodo_inicio),
  unique (agricultor_id, periodo_inicio, periodo_fin)
);

create table public.registros_auditoria (
  id bigint generated always as identity primary key,
  usuario_id uuid references public.perfiles(id) on delete set null,
  accion text not null,
  tabla text not null,
  registro_id uuid,
  detalles jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

-- Helper seguro para políticas: la autorización se basa en la tabla privada de perfiles.
create or replace function public.tiene_rol(roles_permitidos text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles p join public.roles r on r.id = p.rol_id
    where p.id = (select auth.uid()) and p.activo and r.nombre = any(roles_permitidos)
  );
$$;
revoke all on function public.tiene_rol(text[]) from public;
grant execute on function public.tiene_rol(text[]) to authenticated;

create or replace function public.es_integrante(conversacion uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.integrantes_conversacion i
    where i.conversacion_id = conversacion and i.usuario_id = (select auth.uid()));
$$;
revoke all on function public.es_integrante(uuid) from public;
grant execute on function public.es_integrante(uuid) to authenticated;

-- Registro público solo acepta comprador o vendedor. Admin/agricultor no se eligen aquí.
create or replace function public.crear_perfil_comprador()
returns trigger language plpgsql security definer set search_path = '' as $$
declare nuevo_rol smallint; nombre_rol text;
begin
  nombre_rol := coalesce(nullif(new.raw_user_meta_data->>'rol_publico',''), 'comprador');
  if nombre_rol not in ('comprador','vendedor') then
    raise exception 'El registro público solo permite los roles comprador y vendedor';
  end if;
  select id into nuevo_rol from public.roles where nombre = nombre_rol;
  insert into public.perfiles(id, rol_id, nombres, apellido_paterno, apellido_materno, telefono, domicilio)
  values (new.id, nuevo_rol,
    coalesce(nullif(new.raw_user_meta_data->>'nombres',''), 'Pendiente'),
    coalesce(nullif(new.raw_user_meta_data->>'apellido_paterno',''), 'Pendiente'),
    nullif(new.raw_user_meta_data->>'apellido_materno',''),
    nullif(new.raw_user_meta_data->>'telefono',''),
    nullif(new.raw_user_meta_data->>'domicilio',''));
  return new;
end;
$$;
create trigger auth_user_crear_perfil after insert on auth.users
for each row execute function public.crear_perfil_comprador();

-- Evita que un usuario se otorgue privilegios cambiando su propio rol.
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
create trigger perfiles_proteger_rol before update of rol_id on public.perfiles
for each row execute function public.proteger_cambio_rol();

-- Checkout atómico: el servidor calcula el precio vigente y bloquea filas de stock.
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
begin
  if auth.uid() is null or not public.tiene_rol(array['comprador']) then
    raise exception 'Solo un comprador autenticado puede crear pedidos';
  end if;
  if lineas is null or jsonb_typeof(lineas) <> 'array' then
    raise exception 'Las líneas deben enviarse como una lista JSON';
  end if;
  if jsonb_array_length(lineas) = 0 then
    raise exception 'El pedido debe contener al menos un producto';
  end if;
  if exists (
    select 1 from jsonb_array_elements(lineas) e
    group by (e->>'producto_publicado_id') having count(*) > 1
  ) then raise exception 'Cada producto publicado debe aparecer una sola vez'; end if;

  select id into strict pendiente_id from public.estados_pedido where nombre = 'pendiente';
  insert into public.pedidos(id, comprador_id, estado_id)
  values (nuevo_pedido, auth.uid(), pendiente_id);

  for linea in select value from jsonb_array_elements(lineas)
    order by (value->>'producto_publicado_id')
  loop
    publicado := (linea->>'producto_publicado_id')::uuid;
    cantidad_solicitada := (linea->>'cantidad')::numeric;
    if cantidad_solicitada is null or cantidad_solicitada <= 0 then
      raise exception 'La cantidad debe ser mayor que cero';
    end if;
    select pp.stock_disponible, pp.precio, pr.nombre, u.nombre
      into stock_actual, precio_actual, nombre_actual, unidad_actual
    from public.productos_publicados pp
    join public.publicaciones_semanales ps on ps.id = pp.publicacion_id
    join public.productos pr on pr.id = pp.producto_id
    join public.unidades u on u.id = pp.unidad_id
    where pp.id = publicado and pp.activo and pr.activo and ps.estado = 'publicada'
    for update of pp;
    if not found then raise exception 'Producto no disponible: %', publicado; end if;
    if stock_actual < cantidad_solicitada then
      raise exception 'Existencia insuficiente para %', nombre_actual;
    end if;
    update public.productos_publicados
      set stock_disponible = stock_disponible - cantidad_solicitada
      where id = publicado;
    insert into public.detalles_pedido
      (pedido_id, producto_publicado_id, nombre_producto_snapshot, unidad_snapshot, precio_unitario, cantidad)
    values (nuevo_pedido, publicado, nombre_actual, unidad_actual, precio_actual, cantidad_solicitada);
  end loop;

  insert into public.historial_pedido (pedido_id, estado_nuevo_id, cambiado_por, comentario)
  values (nuevo_pedido, pendiente_id, auth.uid(), 'Pedido creado por el comprador');
  return nuevo_pedido;
end;
$$;
revoke all on function public.crear_pedido(jsonb) from public;
grant execute on function public.crear_pedido(jsonb) to authenticated;
revoke insert on public.pedidos from authenticated;
revoke insert on public.detalles_pedido from authenticated;

-- RLS en todas las tablas expuestas.
do $$ declare t text; begin
  foreach t in array array['perfiles','roles','municipios','localidades','categorias','unidades','productos','imagenes_producto',
    'publicaciones_semanales','productos_publicados','estados_pedido','pedidos','detalles_pedido','historial_pedido',
    'tipos_pago','pagos','recibos','familias','integrantes_familia','limites_credito','conversaciones',
    'integrantes_conversacion','mensajes','adjuntos_mensaje','recolecciones','decisiones_merma','mermas',
    'cortes_caja','liquidaciones','registros_auditoria'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Lectura pública únicamente de catálogos activos y productos publicados.
create policy catalogos_lectura on public.categorias for select to anon, authenticated using (activa);
create policy roles_lectura_auth on public.roles for select to authenticated using (true);
create policy unidades_lectura on public.unidades for select to anon, authenticated using (activa);
create policy municipios_lectura on public.municipios for select to anon, authenticated using (true);
create policy localidades_lectura on public.localidades for select to anon, authenticated using (true);
create policy estados_pedido_lectura on public.estados_pedido for select to authenticated using (true);
create policy tipos_pago_lectura on public.tipos_pago for select to authenticated using (activo);
create policy decisiones_merma_lectura on public.decisiones_merma for select to authenticated using (true);
create policy productos_lectura on public.productos for select to anon, authenticated using (activo);
create policy imagenes_producto_lectura on public.imagenes_producto for select to anon, authenticated using (true);
create policy publicaciones_lectura on public.publicaciones_semanales for select to anon, authenticated using (estado = 'publicada' or agricultor_id = (select auth.uid()) or public.tiene_rol(array['administrador']));
create policy productos_publicados_lectura on public.productos_publicados for select to anon, authenticated using (activo and exists (
  select 1 from public.publicaciones_semanales ps where ps.id = publicacion_id and ps.estado = 'publicada'));

create policy perfiles_select on public.perfiles for select to authenticated using (id = (select auth.uid()) or public.tiene_rol(array['administrador']) or (public.tiene_rol(array['vendedor']) and exists(select 1 from public.pedidos p where p.vendedor_id = (select auth.uid()) and p.comprador_id = perfiles.id)));
create policy perfiles_update on public.perfiles for update to authenticated using (id = (select auth.uid()) or public.tiene_rol(array['administrador'])) with check (id = (select auth.uid()) or public.tiene_rol(array['administrador']));
create policy roles_admin on public.roles for all to authenticated using (public.tiene_rol(array['administrador'])) with check (public.tiene_rol(array['administrador']));
create policy productos_admin_read on public.productos for all to authenticated using (public.tiene_rol(array['administrador'])) with check (public.tiene_rol(array['administrador']));
create policy categoria_admin_write on public.categorias for all to authenticated using (public.tiene_rol(array['administrador'])) with check (public.tiene_rol(array['administrador']));
create policy unidad_admin_write on public.unidades for all to authenticated using (public.tiene_rol(array['administrador'])) with check (public.tiene_rol(array['administrador']));

create policy publicaciones_owner_manage on public.publicaciones_semanales for all to authenticated
using (agricultor_id = (select auth.uid()) or public.tiene_rol(array['administrador']))
with check ((agricultor_id = (select auth.uid()) and public.tiene_rol(array['agricultor'])) or public.tiene_rol(array['administrador']));
create policy productos_publicados_manage on public.productos_publicados for all to authenticated
using (exists(select 1 from public.publicaciones_semanales ps where ps.id = publicacion_id and (ps.agricultor_id = (select auth.uid()) or public.tiene_rol(array['administrador']))))
with check (exists(select 1 from public.publicaciones_semanales ps where ps.id = publicacion_id and (ps.agricultor_id = (select auth.uid()) or public.tiene_rol(array['administrador']))));

create policy pedido_select_partes on public.pedidos for select to authenticated using (comprador_id = (select auth.uid()) or vendedor_id = (select auth.uid()) or public.tiene_rol(array['administrador']));
create policy pedido_insert_comprador on public.pedidos for insert to authenticated with check (comprador_id = (select auth.uid()) and public.tiene_rol(array['comprador']));
-- Los vendedores avanzan pedidos asignados mediante la RPC transaccional; no editan filas directamente.
create policy pedido_update_staff on public.pedidos for update to authenticated using (public.tiene_rol(array['administrador'])) with check (public.tiene_rol(array['administrador']));
create policy detalles_select_partes on public.detalles_pedido for select to authenticated using (exists(select 1 from public.pedidos p where p.id = pedido_id and (p.comprador_id = (select auth.uid()) or p.vendedor_id = (select auth.uid()) or public.tiene_rol(array['administrador']))));
create policy detalles_insert_comprador on public.detalles_pedido for insert to authenticated with check (exists(select 1 from public.pedidos p where p.id = pedido_id and p.comprador_id = (select auth.uid())));
create policy historial_select_partes on public.historial_pedido for select to authenticated using (exists(select 1 from public.pedidos p where p.id = pedido_id and (p.comprador_id = (select auth.uid()) or p.vendedor_id = (select auth.uid()) or public.tiene_rol(array['administrador']))));
-- El historial operativo lo escriben RPCs verificadas; evita inserciones manuales por el cliente.
create policy historial_staff_write on public.historial_pedido for insert to authenticated with check (public.tiene_rol(array['administrador']));

create policy pagos_partes_select on public.pagos for select to authenticated using (public.tiene_rol(array['administrador']) or exists(select 1 from public.pedidos p where p.id = pedido_id and (p.comprador_id = (select auth.uid()) or p.vendedor_id = (select auth.uid()))));
create policy pagos_staff_write on public.pagos for insert to authenticated with check (public.tiene_rol(array['administrador']));
create policy recibos_partes_select on public.recibos for select to authenticated using (public.tiene_rol(array['administrador']) or exists(select 1 from public.pagos pg join public.pedidos p on p.id = pg.pedido_id where pg.id = pago_id and (p.comprador_id = (select auth.uid()) or p.vendedor_id = (select auth.uid()))));
create policy recibos_staff_write on public.recibos for insert to authenticated with check (public.tiene_rol(array['administrador']));

create policy familia_members_read on public.familias for select to authenticated using (jefe_id = (select auth.uid()) or exists(select 1 from public.integrantes_familia f where f.familia_id = id and f.usuario_id = (select auth.uid())) or public.tiene_rol(array['administrador']));
create policy familia_admin_manage on public.familias for all to authenticated using (public.tiene_rol(array['administrador'])) with check (public.tiene_rol(array['administrador']));
create policy integrantes_familia_read on public.integrantes_familia for select to authenticated using (usuario_id = (select auth.uid()) or public.tiene_rol(array['administrador']));
create policy integrantes_familia_admin on public.integrantes_familia for all to authenticated using (public.tiene_rol(array['administrador'])) with check (public.tiene_rol(array['administrador']));
create policy credito_self_admin on public.limites_credito for select to authenticated using (comprador_id = (select auth.uid()) or public.tiene_rol(array['administrador']));
create policy credito_admin_write on public.limites_credito for all to authenticated using (public.tiene_rol(array['administrador'])) with check (public.tiene_rol(array['administrador']));

create policy conversaciones_member_select on public.conversaciones for select to authenticated using (public.es_integrante(id) or public.tiene_rol(array['administrador']));
create policy conversaciones_member_create on public.conversaciones for insert to authenticated with check (creada_por = (select auth.uid()));
create policy integrantes_conversacion_member_select on public.integrantes_conversacion for select to authenticated using (public.es_integrante(conversacion_id) or public.tiene_rol(array['administrador']));
create policy integrantes_conversacion_create on public.integrantes_conversacion for insert to authenticated with check (usuario_id = (select auth.uid()) or public.tiene_rol(array['administrador']));
create policy mensajes_member_select on public.mensajes for select to authenticated using (public.es_integrante(conversacion_id) or public.tiene_rol(array['administrador']));
create policy mensajes_member_insert on public.mensajes for insert to authenticated with check (emisor_id = (select auth.uid()) and public.es_integrante(conversacion_id));
create policy mensajes_sender_update on public.mensajes for update to authenticated using (emisor_id = (select auth.uid())) with check (emisor_id = (select auth.uid()));
create policy adjuntos_member_select on public.adjuntos_mensaje for select to authenticated using (exists(select 1 from public.mensajes m where m.id = mensaje_id and public.es_integrante(m.conversacion_id)));
create policy adjuntos_member_insert on public.adjuntos_mensaje for insert to authenticated with check (subido_por = (select auth.uid()) and exists(select 1 from public.mensajes m where m.id = mensaje_id and m.emisor_id = (select auth.uid()) and public.es_integrante(m.conversacion_id)));

create policy recoleccion_staff_read on public.recolecciones for select to authenticated using (agricultor_id = (select auth.uid()) or public.tiene_rol(array['administrador']));
create policy recoleccion_staff_write on public.recolecciones for all to authenticated using (public.tiene_rol(array['administrador'])) with check (public.tiene_rol(array['administrador']));
create policy mermas_staff_read on public.mermas for select to authenticated using (public.tiene_rol(array['administrador']) or exists(select 1 from public.productos_publicados pp join public.publicaciones_semanales ps on ps.id = pp.publicacion_id where pp.id = producto_publicado_id and ps.agricultor_id = (select auth.uid())));
create policy mermas_staff_write on public.mermas for insert to authenticated with check (public.tiene_rol(array['administrador']) or exists(select 1 from public.productos_publicados pp join public.publicaciones_semanales ps on ps.id = pp.publicacion_id where pp.id = producto_publicado_id and ps.agricultor_id = (select auth.uid())));
create policy cortes_admin_vendedor on public.cortes_caja for all to authenticated using (public.tiene_rol(array['administrador'])) with check (public.tiene_rol(array['administrador']));
create policy liquidaciones_admin_agricultor_read on public.liquidaciones for select to authenticated using (agricultor_id = (select auth.uid()) or public.tiene_rol(array['administrador']));
create policy liquidaciones_admin_write on public.liquidaciones for all to authenticated using (public.tiene_rol(array['administrador'])) with check (public.tiene_rol(array['administrador']));
create policy auditoria_admin_read on public.registros_auditoria for select to authenticated using (public.tiene_rol(array['administrador']));

-- Acceso completo del administrador a las áreas del panel. Auditoría se conserva de solo lectura.
do $$ declare t text; begin
  foreach t in array array['perfiles','roles','municipios','localidades','categorias','unidades','productos','imagenes_producto',
    'publicaciones_semanales','productos_publicados','estados_pedido','pedidos','detalles_pedido','historial_pedido',
    'tipos_pago','pagos','recibos','familias','integrantes_familia','limites_credito','conversaciones',
    'integrantes_conversacion','mensajes','adjuntos_mensaje','recolecciones','decisiones_merma','mermas',
    'cortes_caja','liquidaciones'] loop
    execute format('create policy admin_access_all on public.%I for all to authenticated using (public.tiene_rol(array[''administrador''])) with check (public.tiene_rol(array[''administrador'']))', t);
  end loop;
end $$;

-- Bucket privado de adjuntos del chat (imágenes hasta 10 MiB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images','chat-images',false,10485760,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];
create policy chat_images_read_member on storage.objects for select to authenticated using (
  bucket_id = 'chat-images' and exists (
    select 1 from public.adjuntos_mensaje a join public.mensajes m on m.id = a.mensaje_id
    where a.ruta_storage = name and public.es_integrante(m.conversacion_id)));
create policy chat_images_insert_auth on storage.objects for insert to authenticated with check (
  bucket_id = 'chat-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Índices para FKs, paneles y políticas habituales.
create index perfiles_rol_idx on public.perfiles(rol_id);
create index productos_categoria_idx on public.productos(categoria_id);
create index publicaciones_agricultor_fecha_idx on public.publicaciones_semanales(agricultor_id, fecha_publicacion desc);
create index productos_publicados_publicacion_idx on public.productos_publicados(publicacion_id);
create index pedidos_comprador_fecha_idx on public.pedidos(comprador_id, creado_en desc);
create index pedidos_vendedor_estado_idx on public.pedidos(vendedor_id, estado_id, creado_en desc);
create index pagos_pedido_idx on public.pagos(pedido_id);
create index integrantes_conversacion_usuario_idx on public.integrantes_conversacion(usuario_id);
create index mensajes_emisor_idx on public.mensajes(emisor_id);
create index adjuntos_mensaje_idx on public.adjuntos_mensaje(mensaje_id);
create index mermas_producto_fecha_idx on public.mermas(producto_publicado_id, creado_en desc);

commit;

-- NOTAS DE IMPLEMENTACIÓN:
-- 1) Alta Auth crea perfil comprador. Cambios de rol privilegiado solo por administrador.
-- 2) Checkout debe ser una función transaccional/RPC que valide stock/precio y cree pedido+detalles.
-- 3) Los totales se consultan en totales_pedido; no se duplica subtotal/IVA en pedidos.
-- 4) Para Storage, ruta recomendada: <uuid-usuario>/<uuid-archivo>.<ext>. La app registra la ruta en adjuntos_mensaje.
