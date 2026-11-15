# Arquitectura propuesta para la PWA de Rassa

## Tecnologías

- **React** organiza la interfaz en componentes reutilizables y pantallas. La misma aplicación presenta navegación distinta según el rol autenticado: administrador, vendedor, comprador y, si se incluye, agricultor.
- **TypeScript** añade tipos a usuarios, productos, pedidos, mensajes y respuestas de Supabase. Ayuda a detectar errores durante el desarrollo; no sustituye validaciones ni controles de acceso.
- **Supabase** aporta PostgreSQL, Auth, Storage y Realtime. La PWA se conecta usando el SDK oficial. Las tablas expuestas deben protegerse con RLS; las claves secretas nunca deben incluirse en el navegador.

## Diagrama 1: organización de la PWA en React

```mermaid
flowchart TD
    U[Usuario: admin / vendedor / comprador / agricultor] --> APP[Aplicación React]
    APP --> AUTH[Estado de sesión y rol]
    AUTH --> ROUTE[Rutas protegidas]
    ROUTE --> A[Panel de administración]
    ROUTE --> V[Panel de vendedor]
    ROUTE --> C[Catálogo, carrito y pedidos del comprador]
    ROUTE --> F[Publicaciones del agricultor]
    A --> UI[Componentes compartidos: navegación, formularios, tablas, chat]
    V --> UI
    C --> UI
    F --> UI
    UI --> TS[TypeScript: tipos y validación de datos en la app]
```

### Proceso

1. React inicia la aplicación y comprueba si hay una sesión válida.
2. La app obtiene el perfil y rol del usuario.
3. El enrutador muestra el panel que corresponda y protege las pantallas que requieren sesión.
4. Componentes compartidos presentan datos y formularios; TypeScript comprueba sus formas mientras se desarrolla.
5. Las reglas de permisos no se confían a la interfaz: Supabase vuelve a comprobarlas en la base de datos.

## Diagrama 2: servicios de Supabase

```mermaid
flowchart LR
    PWA[PWA React + TypeScript] -->|Inicio de sesión / JWT| AUTH[Supabase Auth]
    PWA -->|Consultas con sesión| API[API de datos de Supabase]
    API --> RLS{Políticas RLS}
    RLS -->|Acceso permitido| PG[(PostgreSQL)]
    RLS -->|Denegado| DENY[Respuesta sin acceso]
    PWA -->|Subir / mostrar imágenes| STORAGE[Supabase Storage]
    PWA <-->|Eventos en vivo| RT[Supabase Realtime]
    RT <--> PG
    EDGE[Funciones de servidor / RPC] -->|Operaciones sensibles| PG
    PWA -->|Confirmar pedido| EDGE
```

### Proceso

1. **Auth** valida credenciales y entrega una sesión/JWT.
2. La PWA usa la sesión para consultar datos; PostgreSQL evalúa las políticas RLS para cada operación y fila.
3. El catálogo, perfiles, publicaciones, pedidos, pagos, conversaciones y mensajes se guardan en PostgreSQL. Las imágenes y adjuntos se guardan en Storage.
4. Realtime notifica cambios a clientes autorizados, por ejemplo mensajes nuevos o cambios de estado del pedido.
5. Las operaciones críticas (por ejemplo, validar stock y crear pedido en una sola transacción) se ejecutan mediante una función de servidor o función SQL/RPC, no mediante una secuencia de escrituras independientes desde el navegador.

## Diagrama 3: recorrido de un pedido

```mermaid
sequenceDiagram
    actor Comprador
    participant UI as PWA React
    participant Auth as Supabase Auth
    participant Sec as RLS / API
    participant Fn as Función transaccional
    participant DB as PostgreSQL
    participant RT as Realtime
    Comprador->>UI: Inicia sesión y arma carrito
    UI->>Auth: Valida credenciales
    Auth-->>UI: Sesión JWT
    UI->>Sec: Lee catálogo con JWT
    Sec->>DB: Aplica permisos RLS y consulta
    DB-->>UI: Productos permitidos
    Comprador->>UI: Confirma pedido
    UI->>Fn: Solicita checkout
    Fn->>DB: Verifica stock, crea pedido y descuenta stock
    DB-->>Fn: Resultado confirmado o error
    Fn-->>UI: Estado del checkout
    DB-->>RT: Cambio de pedido
    RT-->>UI: Actualiza comprador y panel vendedor
```

### Proceso

El comprador arma el carrito con productos que puede consultar. Al confirmar, la función de servidor vuelve a validar precio y disponibilidad, crea el pedido y descuenta existencias como una operación atómica. Si algo falla, no se deja un pedido a medias. Después, Realtime avisa a las pantallas autorizadas para que comprador y vendedor vean el estado actualizado.

## Diagrama 4: chat en tiempo real

```mermaid
sequenceDiagram
    actor A as Usuario A
    participant P as PWA
    participant R as RLS
    participant D as PostgreSQL: conversaciones / integrantes / mensajes
    participant RT as Realtime
    actor B as Usuario B
    A->>P: Abre una conversación
    P->>R: Solicita historial con JWT
    R->>D: Comprueba que A pertenece a la conversación
    D-->>P: Devuelve mensajes permitidos
    A->>P: Envía mensaje
    P->>R: Inserta mensaje autenticado
    R->>D: Verifica membresía y guarda
    D-->>RT: Notifica nuevo mensaje
    RT-->>B: Entrega evento al canal privado autorizado
    B->>P: Carga mensaje y responde
```

### Proceso

Cada conversación tiene integrantes registrados. Las políticas de base de datos permiten consultar e insertar mensajes solo a esos integrantes. Realtime distribuye la actualización a quienes tengan permiso sobre esa conversación. El historial queda persistido en PostgreSQL; el canal en vivo solo comunica novedades.

## Diagrama separado: vista general de la arquitectura

La imagen independiente [arquitectura-rassa.svg](./arquitectura-rassa.svg) resume los actores, la PWA, el control de acceso y los servicios de Supabase en una sola vista.

## Organización inicial sugerida

```text
src/
  app/              # rutas, sesión y composición general
  components/       # componentes reutilizables
  features/
    auth/
    catalog/
    orders/
    chat/
    admin/
    seller/
    buyer/
  lib/supabase.ts   # cliente Supabase
  types/            # tipos compartidos
supabase/
  migrations/       # esquema, índices y políticas RLS versionadas
  functions/        # operaciones de servidor cuando se requieran
```

## Decisiones y límites

- Una sola PWA con rutas y vistas por rol reduce duplicación; el rol de la interfaz es solo una ayuda visual, mientras que RLS y funciones validan autorización real.
- Para chat de texto básico, PostgreSQL + Realtime evita añadir otro proveedor. Adjuntos se guardarían en Storage con permisos por conversación.
- Supabase simplifica infraestructura, pero no elimina el diseño de permisos. Cada tabla expuesta necesita políticas concretas; nunca se debe poner la clave `service_role` en React.
- La PWA puede cachear recursos estáticos para abrir rápido y ofrecer parte de la interfaz sin conexión. Pedidos, pagos y chat requieren conexión para confirmar el estado del servidor.
