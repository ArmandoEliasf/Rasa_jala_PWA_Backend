# Diccionario de datos · Rassa JALA

**Motor:** PostgreSQL en Supabase · **Esquema:** `public` · **Identificadores:** UUID para entidades; secuencias pequeñas para catálogos.
**Alcance:** una sola PWA para administrador, vendedor, agricultor y comprador, con e-commerce, publicaciones semanales, pagos, recolecciones, liquidaciones y chat con imágenes.

El esquema ejecutable está en [supabase_rassa.sql](./supabase_rassa.sql); el modelo físico se muestra en [diagrama-fisico-rassa.md](./diagrama-fisico-rassa.md).

## Reglas globales

- Las tablas operativas usan clave primaria. Las relaciones usan claves foráneas con `ON DELETE` explícito: se restringe borrar transacciones/catálogos usados; datos dependientes (p. ej. detalle de pedido, mensaje) pueden eliminarse en cascada cuando carecen de sentido sin el padre.
- `NOT NULL` marca datos requeridos; restricciones `UNIQUE`, `CHECK` e índices parciales protegen unicidad, rangos, valores válidos y búsquedas.
- Fechas usan `timestamptz` para almacenar instantes inequívocos. Los importes usan `numeric(12,2)` y cantidades `numeric(12,3)` para permitir unidades fraccionarias no libras.
- Los precios capturados en detalle son una instantánea histórica. `totales_pedido` deriva subtotal y total de los detalles. No se guarda ni calcula IVA.
- La autenticación reside en `auth.users` de Supabase. `perfiles.id` referencia esa identidad; nunca se guarda contraseña en tablas propias.
- RLS debe permanecer activa. La clave `service_role` es secreta y nunca va en el bundle de React.

## Diccionario de tablas y columnas

### Identidad, ubicación y catálogos

| Tabla | Campo | Tipo | Reglas / descripción |
|---|---|---|---|
| `roles` | `id` | smallint | PK identity. |
|  | `nombre` | text | Obligatorio, único; administrador, vendedor, agricultor o comprador. |
|  | `descripcion` | text | Obligatorio, vacío por defecto. |
|  | `creado_en` | timestamptz | Obligatorio, `now()`. |
| `municipios` | `id` | uuid | PK. |
|  | `nombre` | text | Obligatorio, único, no vacío. |
|  | `creado_en` | timestamptz | Obligatorio, `now()`. |
| `localidades` | `id` | uuid | PK. |
|  | `municipio_id` | uuid | FK → municipios, obligatorio, `RESTRICT`. |
|  | `nombre` | text | Obligatorio. |
|  | `creado_en` | timestamptz | Obligatorio. |
|  | — | — | UNIQUE (`municipio_id`,`nombre`). |
| `perfiles` | `id` | uuid | PK y FK → `auth.users`, `CASCADE`; Supabase Auth es la identidad. |
|  | `rol_id` | smallint | FK → roles, obligatorio, `RESTRICT`. |
|  | `nombres`, `apellido_paterno` | text | Obligatorios, no vacíos. |
|  | `apellido_materno` | text | Opcional. |
|  | `telefono` | text | Opcional, único; CHECK formato básico. |
|  | `fecha_nacimiento` | date | Opcional. |
|  | `domicilio` | text | Opcional. |
|  | `localidad_id` | uuid | FK → localidades, opcional, `SET NULL`. |
|  | `activo` | boolean | Obligatorio, verdadero por defecto. |
|  | `creado_en`,`actualizado_en` | timestamptz | Auditoría temporal; actualización por la app/trigger futuro. |
| `categorias` | `id` | uuid | PK. |
|  | `nombre` | text | Obligatorio, único, no vacío. |
|  | `descripcion` | text | Opcional. |
|  | `activa` | boolean | Obligatorio, verdadero por defecto. |
|  | `creado_en` | timestamptz | Obligatorio. |
| `unidades` | `id` | uuid | PK. |
|  | `nombre`,`abreviatura` | text | Obligatorios, cada uno único y no vacío. El catálogo no inserta libras. |
|  | `permite_fraccion`,`activa` | boolean | Obligatorios, falso/verdadero por defecto. |
| `estados_pedido` | `id` | smallint | PK identity. |
|  | `nombre` | text | Obligatorio, único, CHECK: pendiente, confirmado, en_preparacion, listo_para_retirar, entregado o cancelado. |
|  | `descripcion` | text | Obligatorio, vacío por defecto. |
| `tipos_pago` | `id` | smallint | PK identity. |
|  | `nombre` | text | Obligatorio, único; efectivo, transferencia o deposito. |
|  | `activo` | boolean | Obligatorio, verdadero por defecto. |
| `decisiones_merma` | `id` | smallint | PK identity. |
|  | `nombre` | text | Obligatorio, único; donar, desechar, vender_barato o compostar. |

### Catálogo y publicaciones

| Tabla | Campo | Tipo | Reglas / descripción |
|---|---|---|---|
| `productos` | `id` | uuid | PK. |
|  | `categoria_id` | uuid | FK → categorias, obligatorio, `RESTRICT`. |
|  | `nombre` | text | Obligatorio, no vacío; UNIQUE junto con categoría. |
|  | `descripcion` | text | Opcional. |
|  | `es_perecedero`,`activo` | boolean | Obligatorios; falso/verdadero por defecto. |
|  | `creado_por` | uuid | FK → perfiles, `SET NULL`. |
|  | `creado_en` | timestamptz | Obligatorio. |
| `imagenes_producto` | `id` | uuid | PK. |
|  | `producto_id` | uuid | FK → productos, obligatorio, `CASCADE`. |
|  | `ruta_storage` | text | Obligatoria, única; ruta de objeto Storage, no URL pública fija. |
|  | `texto_alternativo` | text | Opcional. |
|  | `es_principal` | boolean | Obligatorio, falso por defecto; índice parcial permite solo una principal por producto. |
|  | `orden` | smallint | Obligatorio, >= 0. |
|  | `creado_en` | timestamptz | Obligatorio. |
| `publicaciones_semanales` | `id` | uuid | PK. |
|  | `agricultor_id` | uuid | FK → perfiles, obligatorio, `RESTRICT`. |
|  | `fecha_publicacion` | date | Obligatoria; CHECK lunes; UNIQUE por agricultor y fecha. |
|  | `estado` | text | Obligatorio; borrador, publicada o cerrada. |
|  | `creado_en` | timestamptz | Obligatorio. |
| `productos_publicados` | `id` | uuid | PK. |
|  | `publicacion_id` | uuid | FK → publicaciones, obligatorio, `CASCADE`. |
|  | `producto_id` | uuid | FK → productos, obligatorio, `RESTRICT`. |
|  | `unidad_id` | uuid | FK → unidades, obligatorio, `RESTRICT`. |
|  | `precio` | numeric(12,2) | Obligatorio, >= 0; precio final sin IVA. |
|  | `stock_inicial`,`stock_disponible` | numeric(12,3) | Obligatorios, >= 0; disponible no supera inicial. |
|  | `activo` | boolean | Obligatorio, verdadero por defecto. |
|  | `creado_en` | timestamptz | Obligatorio. |
|  | — | — | UNIQUE (`publicacion_id`,`producto_id`); clave compuesta auxiliar UNIQUE (`id`,`unidad_id`). |

### Pedidos y pagos

| Tabla | Campo | Tipo | Reglas / descripción |
|---|---|---|---|
| `pedidos` | `id` | uuid | PK. |
|  | `comprador_id` | uuid | FK → perfiles, obligatorio, `RESTRICT`. |
|  | `vendedor_id` | uuid | FK → perfiles, opcional, `SET NULL`. |
|  | `estado_id` | smallint | FK → estados_pedido, obligatorio, `RESTRICT`. |
|  | `moneda` | char(3) | Obligatoria, MXN por defecto y única permitida en este alcance. |
|  | `notas` | text | Opcional. |
|  | `vence_en` | timestamptz | Opcional. |
|  | `creado_en`,`actualizado_en` | timestamptz | Obligatorios. |
| `detalles_pedido` | `id` | uuid | PK. |
|  | `pedido_id` | uuid | FK → pedidos, obligatorio, `CASCADE`. |
|  | `producto_publicado_id` | uuid | FK → productos_publicados, obligatorio, `RESTRICT`. |
|  | `nombre_producto_snapshot`,`unidad_snapshot` | text | Obligatorios; preservan descripción/unidad al comprar. |
|  | `precio_unitario` | numeric(12,2) | Obligatorio, >= 0; snapshot del precio acordado sin IVA. |
|  | `cantidad` | numeric(12,3) | Obligatoria, > 0; se expresa en la unidad del producto. |
|  | `creado_en` | timestamptz | Obligatorio. |
|  | — | — | UNIQUE (`pedido_id`,`producto_publicado_id`). |
| `totales_pedido` | `pedido_id` | uuid | Clave de consulta derivada; view, no tabla almacenada. |
|  | `subtotal`,`total` | numeric(14,2) | Suma de precio × cantidad de detalles; iguales porque no se aplica IVA. |
| `historial_pedido` | `id` | uuid | PK. |
|  | `pedido_id` | uuid | FK → pedidos, obligatorio, `CASCADE`. |
|  | `estado_anterior_id` | smallint | FK → estados_pedido, opcional, `RESTRICT`. |
|  | `estado_nuevo_id` | smallint | FK → estados_pedido, obligatorio, `RESTRICT`. |
|  | `cambiado_por` | uuid | FK → perfiles, opcional, `SET NULL`. |
|  | `comentario` | text | Opcional. |
|  | `creado_en` | timestamptz | Obligatorio. |
| `pagos` | `id` | uuid | PK. |
|  | `pedido_id` | uuid | FK → pedidos, obligatorio, `RESTRICT`. |
|  | `tipo_pago_id` | smallint | FK → tipos_pago, obligatorio, `RESTRICT`. |
|  | `registrado_por` | uuid | FK → perfiles, `SET NULL`. |
|  | `monto` | numeric(12,2) | Obligatorio, > 0. |
|  | `referencia` | text | Opcional. |
|  | `estado` | text | Obligatorio: registrado, reembolsado o anulado. |
|  | `creado_en` | timestamptz | Obligatorio. |
| `recibos` | `id` | uuid | PK. |
|  | `pago_id` | uuid | FK → pagos, obligatorio, único, `RESTRICT`; un recibo por pago. |
|  | `folio` | text | Obligatorio, único. |
|  | `emitido_en` | timestamptz | Obligatorio. |

### Familias y crédito

| Tabla | Campo | Tipo | Reglas / descripción |
|---|---|---|---|
| `familias` | `id` | uuid | PK. |
|  | `nombre` | text | Obligatorio, no vacío. |
|  | `jefe_id` | uuid | FK → perfiles, `SET NULL`. |
|  | `activa` | boolean | Obligatorio, verdadero por defecto. |
|  | `creado_en` | timestamptz | Obligatorio. |
| `integrantes_familia` | `familia_id` | uuid | PK compuesta y FK → familias, `CASCADE`. |
|  | `usuario_id` | uuid | PK compuesta, UNIQUE global y FK → perfiles, `CASCADE`; una familia por usuario. |
|  | `unido_en` | timestamptz | Obligatorio. |
| `limites_credito` | `comprador_id` | uuid | PK y FK → perfiles, `CASCADE`; un límite por comprador. |
|  | `limite` | numeric(12,2) | Obligatorio, >= 0. |
|  | `actualizado_en` | timestamptz | Obligatorio. |

### Chat y archivos

| Tabla | Campo | Tipo | Reglas / descripción |
|---|---|---|---|
| `conversaciones` | `id` | uuid | PK. |
|  | `nombre` | text | Opcional, útil en grupo. |
|  | `tipo` | text | Obligatorio: privada o grupal. |
|  | `creada_por` | uuid | FK → perfiles, `SET NULL`. |
|  | `creada_en` | timestamptz | Obligatorio. |
|  | `activa` | boolean | Obligatorio, verdadero por defecto. |
| `integrantes_conversacion` | `conversacion_id` | uuid | PK compuesta y FK → conversaciones, `CASCADE`. |
|  | `usuario_id` | uuid | PK compuesta y FK → perfiles, `CASCADE`. |
|  | `unido_en` | timestamptz | Obligatorio. |
| `mensajes` | `id` | uuid | PK. |
|  | `conversacion_id` | uuid | FK → conversaciones, obligatorio, `CASCADE`. |
|  | `emisor_id` | uuid | FK → perfiles, obligatorio, `RESTRICT`. |
|  | `contenido` | text | Opcional (máx. 10 000 caracteres); NULL permite mensaje compuesto solo de imagen. |
|  | `creado_en`,`editado_en`,`eliminado_en` | timestamptz | Creación obligatoria; edición y borrado lógico opcionales. |
| `adjuntos_mensaje` | `id` | uuid | PK. |
|  | `mensaje_id` | uuid | FK → mensajes, obligatorio, `CASCADE`. |
|  | `subido_por` | uuid | FK → perfiles, obligatorio, `RESTRICT`. |
|  | `ruta_storage` | text | Obligatoria, única; apunta a bucket privado `chat-images`. |
|  | `nombre_archivo` | text | Obligatorio. |
|  | `mime_type` | text | Obligatorio, solo `image/*`. |
|  | `bytes` | bigint | Obligatorio, 1 byte a 10 MiB. |
|  | `creado_en` | timestamptz | Obligatorio. |

### Operación y auditoría

| Tabla | Campo | Tipo | Reglas / descripción |
|---|---|---|---|
| `recolecciones` | `id` | uuid | PK. |
|  | `agricultor_id` | uuid | FK → perfiles, obligatorio, `RESTRICT`. |
|  | `fecha` | date | Obligatoria. |
|  | `hora_inicio`,`hora_fin` | time | Opcionales; fin posterior a inicio cuando ambos existen. |
|  | `estado` | text | Obligatorio: pendiente, en_ruta, recolectada o cancelada. |
|  | `comentarios` | text | Opcional. |
|  | `creado_en` | timestamptz | Obligatorio. |
| `mermas` | `id` | uuid | PK. |
|  | `producto_publicado_id` | uuid | FK → productos_publicados, obligatorio, `RESTRICT`. |
|  | `registrado_por` | uuid | FK → perfiles, `SET NULL`. |
|  | `decision_id` | smallint | FK → decisiones_merma, obligatorio, `RESTRICT`. |
|  | `cantidad` | numeric(12,3) | Obligatoria, > 0. |
|  | `motivo` | text | Obligatorio. |
|  | `creado_en` | timestamptz | Obligatorio. |
| `cortes_caja` | `id` | uuid | PK. |
|  | `abierto_por`,`cerrado_por` | uuid | FKs → perfiles; apertura obligatoria, cierre opcional. |
|  | `monto_teorico`,`monto_real` | numeric(12,2) | Teórico obligatorio >= 0; real opcional >= 0. |
|  | `estado` | text | Obligatorio: abierto, cerrado o cuadrado; CHECK coherencia con `cerrado_en`. |
|  | `abierto_en`,`cerrado_en` | timestamptz | Apertura obligatoria; cierre opcional. |
| `liquidaciones` | `id` | uuid | PK. |
|  | `agricultor_id` | uuid | FK → perfiles, obligatorio, `RESTRICT`. |
|  | `periodo_inicio`,`periodo_fin` | date | Obligatorios; fin >= inicio. |
|  | `ventas`,`comision` | numeric(12,2) | Obligatorios; >= 0 y comisión <= ventas. |
|  | `monto_liquidar` | numeric(12,2) | Generado: ventas - comisión. |
|  | `estado` | text | Obligatorio: pendiente, pagada o parcial. |
|  | `creado_en` | timestamptz | Obligatorio. |
|  | — | — | UNIQUE agricultor y periodo. |
| `registros_auditoria` | `id` | bigint | PK identity. |
|  | `usuario_id` | uuid | FK → perfiles, `SET NULL`. |
|  | `accion`,`tabla` | text | Obligatorios. |
|  | `registro_id` | uuid | Identificador opcional del registro afectado (sin FK polimórfica). |
|  | `detalles` | jsonb | Obligatorio, `{}` por defecto; no guardar secretos. |
|  | `creado_en` | timestamptz | Obligatorio. |

## Normalización 1FN–3FN

1. **Primera forma normal (1FN):** cada columna contiene un valor atómico. Las fotos no se guardan como listas en productos; cada una es una fila de `imagenes_producto`. Los integrantes de grupos, artículos de pedido y adjuntos también se modelan en tablas separadas.
2. **Segunda forma normal (2FN):** las tablas de intersección (`integrantes_familia`, `integrantes_conversacion`) tienen clave compuesta y atributos dependientes de la relación completa. Los detalles de pedido tienen identidad propia y dependen de un pedido/producto publicado.
3. **Tercera forma normal (3FN):** categorías, unidades, roles y estados se separan como catálogos; en las tablas operativas se almacenan sus claves, no descripciones duplicadas. La dirección geográfica usa municipio/localidad separadas. Los totales se calculan en una vista y el monto de liquidación es generado, evitando dependencias derivadas almacenadas.

Los snapshots de nombre, unidad y precio en `detalles_pedido` son una excepción deliberada a la normalización estricta: preservan lo acordado al comprar aunque cambien el nombre o precio del catálogo después. No representan el valor actual del producto.

## Cambios respecto al esquema original y justificación

| Cambio | Justificación |
|---|---|
| `usuario`/`persona` y contraseña propia se sustituyen por `auth.users` + `perfiles`. | Supabase Auth gestiona credenciales y evita duplicar hashes, login y recuperación de contraseña. El perfil conserva datos de negocio y rol. |
| `SERIAL` de entidades pasa a UUID; catálogos pequeños conservan identity. | UUID facilita IDs del cliente/PWA y reduce exposición de secuencias; los catálogos siguen siendo legibles y compactos. |
| Se elimina la columna `iva`; el total equivale a la suma de líneas. | Requisito explícito: no aplicar IVA. También se elimina subtotal persistido para no tener datos duplicados que puedan quedar inconsistentes. |
| Se omite unidad libra; unidades se administran desde `unidades`. | Requisito explícito: no trabajar con libras. El esquema acepta unidades pertinentes sin imponer una unidad agrícola específica. |
| `cantidad` y stock cambian de entero a `numeric(12,3)`. | Permite fracciones para kg, litros u otras unidades que lo requieran; la unidad siempre se guarda como FK. |
| Se añade control de stock inicial y disponible por producto publicado. | Da un stock consistente por agricultor/publicación, en lugar de stock ambiguo en el producto de catálogo. El checkout debe descontarlo dentro de una transacción. |
| `totales_pedido` es vista y precios de línea son snapshots. | Totales actuales se derivan; el precio histórico comprado no cambia al editar el catálogo. |
| Se reemplazan documentos genéricos por `adjuntos_mensaje` solo imagen y ruta de bucket privado. | El alcance solicitado es enviar imágenes; limita tipos y tamaño, y evita guardar URLs públicas permanentes. |
| Chat se normaliza en conversaciones, integrantes, mensajes y adjuntos. | Un mensaje puede ser texto, imagen o ambos; las relaciones permiten conversaciones privadas/grupales y acceso solo a integrantes. |
| Se agregan RLS y políticas por rol/membresía. | La navegación por rol de React solo mejora UX; la base de datos debe ser la autoridad de acceso para proteger datos. |
| Los campos geográficos, pagos, estados, decisiones y tipos se relacionan por FK a catálogos. | Evita repetir descripciones y mantiene integridad referencial. |
| Se reemplazan URLs sueltas de producto/chat por rutas de Storage. | Supabase Storage puede usar buckets privados y reglas de acceso alineadas con la membresía. |
| No se incluye información de prueba ni contraseñas del SQL fuente. | El esquema debe instalarse vacío y nunca heredar credenciales o datos personales ficticios. |

## Alcance de seguridad y reglas que requieren operación transaccional

- Cada tabla expuesta tiene RLS habilitada en el script. Deben revisarse y probarse las políticas con casos permitidos y denegados antes de producción.
- El script incluye `crear_pedido(jsonb)` como RPC transaccional: valida rol comprador, productos publicados, precio y stock, bloquea inventario, guarda snapshots, descuenta existencia y registra el estado inicial en una única transacción. Se revocan inserciones directas de pedidos y detalles para exigir ese flujo.
- La asignación de vendedor, cambio de estado, registro de pagos y cambio de rol deben ocurrir solo en rutas/políticas autorizadas. La política RLS no reemplaza validaciones de transición del flujo.
- El upload de imágenes usa bucket privado, MIME de imagen y límite 10 MiB. La política de Storage y la escritura de metadatos deben probarse junto con el flujo de chat.
- El script crea el perfil nuevo como comprador. El alta de administradores/agricultores/vendedores debe realizarse por una operación de administración segura.

## Capturas de Supabase

No se incluyen capturas inventadas. Para obtener las capturas reales solicitadas: crear el proyecto Supabase, ejecutar `supabase_rassa.sql` en SQL Editor, y capturar (1) Table Editor con tablas creadas, (2) relaciones del esquema en Database → Schema Visualizer y (3) políticas RLS de tablas y bucket. Las credenciales/URL del proyecto no deben incluirse en las capturas.
