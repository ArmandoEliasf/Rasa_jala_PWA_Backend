export type RoleName = 'administrador' | 'vendedor' | 'agricultor' | 'comprador'

export type Profile = {
  id: string
  email: string
  nombres: string
  apellido_paterno: string
  apellido_materno: string | null
  telefono: string | null
  domicilio: string | null
  activo: boolean
  rol_id: number
  roles: { nombre: RoleName; descripcion?: string } | null
}

export type AdminSection =
  | 'inicio'
  | 'usuarios'
  | 'catalogo'
  | 'publicaciones'
  | 'pedidos'
  | 'familias'
  | 'pagos'
  | 'recolecciones'
  | 'mermas'
  | 'liquidaciones'
  | 'chat'
  | 'auditoria'
  | 'perfil'
