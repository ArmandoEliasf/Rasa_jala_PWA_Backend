import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return reply({ error: 'Método no permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const appUrl = Deno.env.get('APP_URL')
  if (!url || !serviceKey || !appUrl) return reply({ error: 'Faltan secretos de configuración de la función' }, 500)

  const authorization = request.headers.get('Authorization') ?? ''
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return reply({ error: 'Se requiere una sesión autenticada' }, 401)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  if (authError || !authData.user) return reply({ error: 'La sesión no es válida' }, 401)

  const { data: caller, error: callerError } = await admin.from('perfiles')
    .select('activo,roles!inner(nombre)').eq('id', authData.user.id).maybeSingle()
  const callerRole = Array.isArray(caller?.roles) ? caller.roles[0]?.nombre : caller?.roles?.nombre
  if (callerError || !caller?.activo || callerRole !== 'administrador') {
    return reply({ error: 'Solo un administrador activo puede gestionar cuentas' }, 403)
  }

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reply({ error: 'El cuerpo debe ser un objeto JSON' }, 400)
    body = parsed as Record<string, unknown>
  } catch { return reply({ error: 'El cuerpo debe ser JSON válido' }, 400) }

  if (body.action === 'list') {
    const [{ data: profiles, error: profileError }, { data: authUsers, error: usersError }, { data: roles }] = await Promise.all([
      admin.from('perfiles').select('id,rol_id,nombres,apellido_paterno,apellido_materno,telefono,activo,creado_en').order('nombres').limit(1000),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin.from('roles').select('id,nombre'),
    ])
    if (profileError || usersError) return reply({ error: profileError?.message ?? usersError?.message ?? 'No se pudieron consultar las cuentas' }, 500)
    const roleNames = Object.fromEntries((roles ?? []).map((role) => [role.id, role.nombre]))
    const emails = Object.fromEntries((authUsers?.users ?? []).map((user) => [user.id, user.email ?? '']))
    return reply({ users: (profiles ?? []).map((profile) => ({ ...profile, rol: roleNames[profile.rol_id] ?? 'desconocido', email: emails[profile.id] ?? '' })) })
  }

  if (body.action === 'set-access') {
    const userId = typeof body.user_id === 'string' ? body.user_id : ''
    const active = body.active === true
    if (!userId) return reply({ error: 'Falta el identificador de cuenta' }, 400)
    if (typeof body.active !== 'boolean') return reply({ error: 'El estado de acceso debe ser booleano' }, 400)
    if (userId === authData.user.id && !active) return reply({ error: 'No puedes desactivar tu propia cuenta' }, 400)
    const { data: target, error: targetError } = await admin.from('perfiles').select('activo').eq('id', userId).maybeSingle()
    if (targetError || !target) return reply({ error: targetError?.message ?? 'La cuenta no existe' }, 404)
    if (target.activo !== active) return reply({ error: 'Actualiza primero el estado mediante el panel administrativo' }, 409)
    const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: active ? 'none' : '876000h' })
    if (error) return reply({ error: error.message }, 400)
    return reply({ message: active ? 'Acceso de autenticación reactivado' : 'Acceso de autenticación suspendido' })
  }

  if (body.action !== 'invite') return reply({ error: 'Acción no válida' }, 400)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const nombres = typeof body.nombres === 'string' ? body.nombres.trim() : ''
  const apellidoPaterno = typeof body.apellido_paterno === 'string' ? body.apellido_paterno.trim() : ''
  const apellidoMaterno = typeof body.apellido_materno === 'string' ? body.apellido_materno.trim() : ''
  const telefono = typeof body.telefono === 'string' ? body.telefono.trim() : ''
  const role = typeof body.rol === 'string' ? body.rol : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: 'Escribe un correo válido' }, 400)
  if (!nombres || !apellidoPaterno) return reply({ error: 'Nombre y apellido paterno son obligatorios' }, 400)
  if (!['administrador', 'vendedor', 'agricultor', 'comprador'].includes(role)) return reply({ error: 'El rol seleccionado no es válido' }, 400)
  if (telefono && !/^[+0-9() -]{7,20}$/.test(telefono)) return reply({ error: 'El teléfono no tiene un formato válido' }, 400)

  const { data: roleRow, error: roleError } = await admin.from('roles').select('id').eq('nombre', role).single()
  if (roleError || !roleRow) return reply({ error: 'No se encontró el rol seleccionado' }, 400)
  const redirectTo = `${appUrl.replace(/\/$/, '')}/?flow=invite`
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { nombres, apellido_paterno: apellidoPaterno, apellido_materno: apellidoMaterno || null },
    redirectTo,
  })
  if (inviteError || !invited.user) return reply({ error: inviteError?.message ?? 'No se pudo enviar la invitación' }, 400)

  const { error: profileError } = await admin.from('perfiles').update({
    rol_id: roleRow.id,
    nombres,
    apellido_paterno: apellidoPaterno,
    apellido_materno: apellidoMaterno || null,
    telefono: telefono || null,
    activo: true,
  }).eq('id', invited.user.id)
  if (profileError) {
    await admin.auth.admin.deleteUser(invited.user.id)
    return reply({ error: `No se pudo preparar el perfil y se canceló la invitación: ${profileError.message}` }, 500)
  }

  const { error: auditError } = await admin.from('registros_auditoria').insert({
    usuario_id: authData.user.id,
    accion: 'invitar_usuario',
    tabla: 'perfiles',
    registro_id: invited.user.id,
    detalles: { rol: role },
  })
  if (auditError) console.error('No se pudo registrar la auditoría de invitación:', auditError.message)
  return reply({ id: invited.user.id, message: `Invitación enviada a ${email}` }, 201)
})
