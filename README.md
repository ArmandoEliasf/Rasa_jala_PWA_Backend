# Rassa JALA · PWA

PWA administrativa construida con React, TypeScript y Vite. Supabase proporciona Auth, PostgreSQL y Storage. La interfaz incluye inicio de sesión de administradora, perfil editable, tema claro/oscuro, resumen y navegación a las áreas indicadas en el documento técnico.

## Requisitos

- Node.js 20.19+ o 22.12+.
- Un proyecto Supabase con el esquema de `supabase_rassa.sql` instalado.
- Una cuenta creada en Supabase Auth cuyo perfil tenga rol `administrador`.

## Preparar la base de datos

Usa un proyecto Supabase vacío y ejecuta `supabase_rassa.sql` en SQL Editor. Ese SQL crea el perfil nuevo con rol `comprador`; para habilitar la primera cuenta administradora, después de crearla en Auth, cambia su `rol_id` a la fila `administrador` desde SQL Editor. El trigger de protección permite ese cambio administrativo desde SQL Editor y no deja que una persona eleve su propio rol desde la app.

El documento de diccionario asociado explica el esquema y sus reglas. La clave `service_role` no se utiliza en el frontend.

### Actualizar la base de datos del panel

En una base que ya contiene datos, **no vuelvas a ejecutar** `supabase_rassa.sql`: crea el esquema inicial. Aplica en SQL Editor, en este orden, las migraciones que aún no estén instaladas:

1. `sql/admin_workflows_supabase.sql`
2. `sql/admin_operations_supabase.sql`
3. `sql/admin_security_accounting.sql`

La última migración protege en la base de datos al último administrador activo, registra cambios administrativos sin guardar valores personales en auditoría y crea `pagos_liquidacion`.

### Invitaciones de usuarios

La creación segura de usuarios vive en una Supabase Edge Function. Nunca se expone la clave de servicio en React.

1. El CLI ya está fijado como dependencia de desarrollo en `package.json`; ejecuta `npx supabase login` para autenticarte.
2. Vincula el repositorio al proyecto con `npx supabase link --project-ref <project-ref>`.
3. `APP_URL` en el proyecto vinculado está configurada con `https://rassajala.netlify.app` para enviar las invitaciones de producción al sitio publicado. Para cambiar temporalmente las invitaciones al entorno local:

   ```powershell
   npx supabase secrets set APP_URL=http://localhost:5174
   ```

4. La función `admin-users` está desplegada y activa en el proyecto vinculado. Para volver a desplegar cambios:

   ```powershell
   npx supabase functions deploy admin-users --use-api
   ```

5. En el proyecto vinculado ya están permitidos `http://localhost:5174/` y `https://rassajala.netlify.app/` como redirects de autenticación. Revisa en Supabase **Authentication → URL Configuration** que **Site URL** use `https://rassajala.netlify.app` para los enlaces de autenticación que no especifican destino.
6. Configura SMTP en **Authentication → SMTP Settings** para la entrega confiable de invitaciones. Esta configuración necesita credenciales de un proveedor de correo y se realiza en el panel de Supabase. La función autentica al administrador que llama, y solo utiliza la clave de servicio dentro del entorno Edge Function.

### Probar una invitación real

Haz esta prueba con una dirección de correo a la que tengas acceso y que todavía no exista como usuario en Supabase Auth.

1. Comprueba que SMTP esté habilitado en Supabase y que el remitente/dominio estén verificados con tu proveedor. Para una prueba local, asegúrate de que `APP_URL` sea `http://localhost:5174`; para la PWA publicada, usa `https://rassajala.netlify.app`.
2. Abre la aplicación en el entorno correspondiente e inicia sesión con una cuenta cuyo perfil tenga rol **administrador** y esté activo.
3. En el menú, abre **Usuarios y roles**. Completa **Correo electrónico**, **Rol inicial**, **Nombre(s)** y **Apellido paterno**; el apellido materno y el teléfono son opcionales. Pulsa **Enviar invitación**.
4. Verifica el mensaje de confirmación en la aplicación y revisa la bandeja de entrada del correo invitado, incluida la carpeta de spam. El correo debe llegar desde el remitente configurado.
5. Abre el enlace de invitación. La aplicación mostrará el formulario para establecer una contraseña. Guárdala y después inicia sesión desde la pantalla principal con ese correo y contraseña.
6. Comprueba que la cuenta aparezca en **Usuarios y roles** con el rol elegido y acceso activo. Las cuentas vendedoras activas pueden iniciar sesión en el módulo de pedidos; el panel de administración sigue reservado al rol administrador. Comprador y agricultor todavía no tienen su espacio de usuario en la PWA.

**Si no llega o falla el enlace:** confirma que la dirección no estuviera registrada previamente; revisa el estado del envío en los logs de Auth/proveedor SMTP; verifica que el `APP_URL` corresponda al sitio que abriste y que esa URL esté permitida en **Authentication → URL Configuration → Redirect URLs**. Para errores de acceso de la función, confirma que `admin-users` esté activa y desplegada. No compartas ni incluyas en capturas la contraseña SMTP, la API key del proveedor ni claves de Supabase.

Para preparar cuentas de prueba, sigue [`README_USUARIOS_DE_PRUEBA.md`](README_USUARIOS_DE_PRUEBA.md) y ejecuta [`usuarios_prueba_supabase.sql`](usuarios_prueba_supabase.sql) después de crear primero las cuentas en Supabase Auth.

### Registro público

La pantalla **Crear una cuenta** permite registrarse como comprador o vendedor. No permite crear administradores ni agricultores. Las cuentas de vendedor quedan limitadas a los pedidos que el administrador les asigne.

1. Ejecuta [`sql/public_registration_supabase.sql`](sql/public_registration_supabase.sql) en Supabase SQL Editor.
2. En **Authentication → Settings**, permite nuevos registros y conserva **Confirm email** habilitado para uso real.
3. En **Authentication → URL Configuration**, agrega la URL de desarrollo (`http://localhost:5174/**`) y la URL Netlify del sitio a **Redirect URLs**.
4. Abre **Crear una cuenta**, completa los datos y confirma el correo si Auth lo solicita. Tras confirmar, inicia sesión con la cuenta.

El formulario no necesita un dominio propio. Para que personas fuera del equipo puedan confirmar su correo, sí necesitas configurar un SMTP que pueda enviarles mensajes: el remitente predeterminado de Supabase solo entrega a direcciones del equipo de la organización y tiene un límite de 2 correos por hora. Para probarlo sin dominio puedes desactivar temporalmente **Confirm email**, pero no lo dejes así en un sitio público porque Auth aceptará correos sin verificar. Supabase también documenta una configuración de SMTP de Google con contraseña de aplicación; consulta los requisitos de seguridad de Google antes de elegirla.

## Configuración local

```powershell
npm install
Copy-Item .env.example .env.local
```

En `.env.local`, establece la URL y la clave publicable de Supabase:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

## Desplegar en Netlify

El repositorio incluye `netlify.toml` con el comando `npm run build`, la carpeta de publicación `dist`, Node.js 22 y una regla de fallback para que las rutas de la PWA funcionen al recargar. También se incluye `public/_redirects` como respaldo para el enrutamiento SPA.

1. Sube este proyecto a un repositorio Git y, desde el equipo de Netlify, crea un sitio importándolo desde ese repositorio.
2. Conserva los valores de build detectados o establece **Build command** `npm run build` y **Publish directory** `dist`.
3. En **Site configuration → Environment variables**, añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` con los valores de tu proyecto Supabase. Usa la clave publicable (`publishable`/`anon`), nunca `service_role` ni una clave secreta.
4. Ejecuta el deploy. Cada cambio que subas a la rama conectada iniciará un nuevo deploy.

Vite incorpora las variables `VITE_*` durante la compilación, por lo que, después de cambiarlas en Netlify, hay que volver a desplegar el sitio. Para probar solo el diseño sin Supabase configurado, la app puede abrirse, pero el login y los datos administrativos requieren un proyecto y credenciales válidos.

Inicia la aplicación con:

```powershell
npm run dev
```

## Alcance actual

- Inicio de sesión con correo y contraseña mediante Supabase Auth.
- Recuperación de contraseña por correo.
- Solo permite entrar a perfiles activos con rol administrador o vendedor; el módulo de compras todavía está pendiente.
- Registro público con Supabase Auth para comprador y vendedor; los roles administrador y agricultor permanecen protegidos.
- Los perfiles vendedor activos entran a un espacio separado con sus pedidos asignados, detalle, historial y avance seguro de estados.
- La sesión de autenticación se guarda en `sessionStorage` y el panel cierra la sesión después de 30 minutos sin actividad. La opción del navegador para restaurar pestañas puede restaurar también su sesión; la expiración por inactividad se aplica al volver a abrirla.
- Edición del perfil personal (nombre, apellidos, teléfono y domicilio); el correo se muestra desde Auth y se cambia desde un flujo separado de Auth.
- Resumen con conteos de perfiles, productos, pedidos y conversaciones.
- Panel adaptable con navegación para usuarios, catálogo, ciclos, pedidos, familias/crédito, pagos/caja, recolecciones, mermas, liquidaciones, conversaciones y auditoría.
- Invitaciones por correo desde el panel, con creación de usuario protegida en Edge Function y enlace para establecer contraseña.
- Cambios de rol/estado con protección atómica del último administrador activo; desactivar una cuenta también suspende su acceso de Supabase Auth.
- Auditoría automática de cambios en cuentas y operaciones, sin almacenar valores personales modificados.
- Pagos de liquidación asociados al método, monto y referencia antes de cambiar su estado a pagada.
- Tema claro y oscuro, recordado en el dispositivo.
- Manifiesto y service worker PWA; cachea los recursos de la interfaz y las imágenes públicas. La edición de perfil y los datos administrativos requieren conexión en esta primera entrega.

La PWA sigue requiriendo conexión para las operaciones administrativas y el módulo vendedor; la cola offline de cambios y mensajes queda para una fase posterior.

### Módulo vendedor

Después de actualizar el esquema base y `sql/admin_workflows_supabase.sql`, ejecuta [`sql/seller_workflows_supabase.sql`](sql/seller_workflows_supabase.sql) en Supabase SQL Editor. La función `vendedor_avanzar_pedido` valida en la base de datos que el usuario tenga rol vendedor activo, que el pedido esté asignado a su cuenta y que el cambio siga la secuencia permitida. El módulo solo muestra pedidos asignados y permite avanzar su estado; no permite reasignar ni cancelar pedidos.

El backend anterior documenta un endpoint público `POST /api/auth/register/` para comprador y vendedor. Agricultor se creaba mediante un endpoint protegido por rol administrador, y admin no era una opción del registro público. La PWA actual aún no incluye pantalla de registro público: las cuentas se crean por invitación administrativa. Antes de habilitar registro abierto de vendedores, conviene definir cómo revisará administración las nuevas cuentas y las asignaciones de pedidos.

## Modo sin conexión previsto

El service worker actual permite volver a abrir el shell de la PWA y sus recursos cacheados. Aún no implementa una cola local de pedidos o mensajes. En fases posteriores, los pedidos y mensajes redactados sin conexión se guardarán localmente, mostrarán estado pendiente y se validarán/sincronizarán al volver la conexión; el stock no se reservará offline.
