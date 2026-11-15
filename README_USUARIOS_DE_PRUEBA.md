# Usuarios de prueba · Rassa JALA PWA

## Estado actual

El proyecto **no incluye cuentas de prueba creadas en Supabase Auth**. `supabase_rassa.sql` crea los cuatro roles (`administrador`, `vendedor`, `agricultor` y `comprador`), pero no crea usuarios ni contraseñas. Cuando se crea una cuenta en Supabase Auth, el trigger crea automáticamente su perfil con rol `comprador`.

El archivo legado `sql/rassa_jala.sql` contiene usuarios de ejemplo para otra versión del sistema. Esos usuarios pertenecen a una tabla y un modelo de contraseñas distintos; **no funcionan para iniciar sesión en esta PWA y no se deben reutilizar**.

## Cuentas necesarias para probar

Las siguientes son cuentas sugeridas, no cuentas ya creadas. Sustituye los correos por direcciones de prueba controladas por el equipo y crea una contraseña distinta y segura para cada una desde Supabase Auth. No guardes contraseñas reales en este repositorio.

| Cuenta sugerida | Rol en Rassa | Módulos previstos | Estado |
|---|---|---|---|
| `admin-demo@<dominio-del-equipo>` | `administrador` | Resumen, usuarios y roles, catálogo, ciclos semanales, pedidos, familias y crédito, pagos/caja, recolecciones, mermas, liquidaciones, conversaciones y auditoría | Pendiente de crear |
| `vendedor-demo@<dominio-del-equipo>` | `vendedor` | Pedidos asignados, pagos/cortes y recolecciones asignadas | Pendiente de crear; la PWA actual no permite acceso vendedor |
| `agricultor-demo@<dominio-del-equipo>` | `agricultor` | Productos, publicaciones semanales y conversaciones | Pendiente de crear; la PWA actual no permite acceso agricultor |
| `comprador-demo@<dominio-del-equipo>` | `comprador` | Catálogo, pedidos propios y conversaciones | Pendiente de crear; la PWA actual no permite acceso comprador |

**Para probar ahora mismo el panel desplegado**, solo hace falta una cuenta activa con rol `administrador`. Aunque el menú contiene las áreas anteriores, algunas vistas siguen siendo iniciales y no tienen todavía formularios CRUD completos.

## Crear las cuentas y asignar roles

1. En Supabase, abre **Authentication → Users → Add user** y crea cada cuenta. Usa correos controlados por el equipo y define las contraseñas en el panel. Confirma los correos desde Supabase si se solicita.
2. El trigger `auth_user_crear_perfil` creará cada perfil con rol `comprador`.
3. Abre [`usuarios_prueba_supabase.sql`](usuarios_prueba_supabase.sql), reemplaza los cuatro correos de ejemplo por los correos exactos creados en Auth y ejecuta el archivo desde **SQL Editor**. El script valida que las cuentas, perfiles y roles existan antes de asignar los roles. Si falta alguna cuenta, cancela y muestra cuáles debes crear.
4. Inicia sesión en la PWA con el correo y contraseña que definiste en Supabase.

Las cuentas vendedor, agricultor y comprador son datos de preparación para fases posteriores. Actualmente `src/App.tsx` solo autoriza el rol `administrador`; las otras cuentas serán rechazadas al iniciar sesión hasta que se implementen sus perfiles y pantallas.

## Seguridad

- Usa estas cuentas solo en un proyecto Supabase de pruebas.
- No uses datos personales reales ni contraseñas repetidas.
- No incluyas contraseñas, claves `service_role` ni secretos en el repositorio, la PWA o capturas de pantalla.
- Cambia o elimina las cuentas de prueba antes de usar el entorno con información real.
