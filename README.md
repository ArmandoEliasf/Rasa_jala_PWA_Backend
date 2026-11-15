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

1. Instala [Supabase CLI](https://supabase.com/docs/guides/cli) y autentícate con `supabase login`.
2. Vincula el repositorio al proyecto con `supabase link --project-ref <project-ref>`.
3. Define la URL que usarán los enlaces de invitación. Para probar localmente:

   ```powershell
   supabase secrets set APP_URL=http://localhost:5174
   ```

   Para invitaciones de producción, establece la URL pública de Netlify en `APP_URL`.
4. Despliega la función:

   ```powershell
   supabase functions deploy admin-users
   ```

5. En Supabase **Authentication → URL Configuration**, añade la URL local (`http://localhost:5174/**`) y la URL pública de Netlify (`https://<sitio>.netlify.app/**`) a **Redirect URLs**.
6. Configura SMTP en **Authentication → SMTP Settings** para la entrega confiable de invitaciones. La función autentica al administrador que llama, y solo utiliza la clave de servicio dentro del entorno Edge Function.

Para preparar cuentas de prueba, sigue [`README_USUARIOS_DE_PRUEBA.md`](README_USUARIOS_DE_PRUEBA.md) y ejecuta [`usuarios_prueba_supabase.sql`](usuarios_prueba_supabase.sql) después de crear primero las cuentas en Supabase Auth.

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
- Solo permite entrar a perfiles activos con rol administrador.
- Edición del perfil personal (nombre, apellidos, teléfono y domicilio); el correo se muestra desde Auth y se cambia desde un flujo separado de Auth.
- Resumen con conteos de perfiles, productos, pedidos y conversaciones.
- Panel adaptable con navegación para usuarios, catálogo, ciclos, pedidos, familias/crédito, pagos/caja, recolecciones, mermas, liquidaciones, conversaciones y auditoría.
- Invitaciones por correo desde el panel, con creación de usuario protegida en Edge Function y enlace para establecer contraseña.
- Cambios de rol/estado con protección atómica del último administrador activo; desactivar una cuenta también suspende su acceso de Supabase Auth.
- Auditoría automática de cambios en cuentas y operaciones, sin almacenar valores personales modificados.
- Pagos de liquidación asociados al método, monto y referencia antes de cambiar su estado a pagada.
- Tema claro y oscuro, recordado en el dispositivo.
- Manifiesto y service worker PWA; cachea los recursos de la interfaz y las imágenes públicas. La edición de perfil y los datos administrativos requieren conexión en esta primera entrega.

La PWA sigue requiriendo conexión para las operaciones administrativas; la cola offline de cambios y mensajes queda para una fase posterior.

## Modo sin conexión previsto

El service worker actual permite volver a abrir el shell de la PWA y sus recursos cacheados. Aún no implementa una cola local de pedidos o mensajes. En fases posteriores, los pedidos y mensajes redactados sin conexión se guardarán localmente, mostrarán estado pendiente y se validarán/sincronizarán al volver la conexión; el stock no se reservará offline.
