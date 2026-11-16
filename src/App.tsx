import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Activity, Apple, ArrowDownLeft, ArrowRight, BadgeCheck, Banknote, Bell,
  Boxes, CalendarDays, Check, ChevronDown, CircleHelp, ClipboardList,
  Command, CreditCard, Download, Eye, EyeOff, FileBarChart,
  HeartHandshake, Leaf, LogOut, Menu, MessageCircle, Moon, Package,
  Plus, Settings2, ShieldCheck,
  ShoppingBasket, Sun, Truck, UserRound, Users, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { AuditAdmin, ChatAdmin, PaymentsAdmin, PickupsAdmin, SettlementsAdmin, UsersAdmin, WasteAdmin } from './AdminOperations'
import type { AdminSection, Profile, RoleName } from './types'

const navGroups: { label: string; items: { id: AdminSection; label: string; icon: LucideIcon }[] }[] = [
  {
    label: 'GENERAL',
    items: [{ id: 'inicio', label: 'Resumen', icon: Command }],
  },
  {
    label: 'GESTIÓN',
    items: [
      { id: 'usuarios', label: 'Usuarios y roles', icon: Users },
      { id: 'catalogo', label: 'Catálogo', icon: Apple },
      { id: 'publicaciones', label: 'Ciclos semanales', icon: CalendarDays },
      { id: 'pedidos', label: 'Pedidos', icon: ShoppingBasket },
      { id: 'familias', label: 'Familias y crédito', icon: HeartHandshake },
      { id: 'pagos', label: 'Pagos y caja', icon: Banknote },
      { id: 'recolecciones', label: 'Recolecciones', icon: Truck },
      { id: 'mermas', label: 'Mermas', icon: Boxes },
      { id: 'liquidaciones', label: 'Liquidaciones', icon: CreditCard },
      { id: 'chat', label: 'Conversaciones', icon: MessageCircle },
    ],
  },
  {
    label: 'SISTEMA',
    items: [{ id: 'auditoria', label: 'Auditoría y reportes', icon: FileBarChart }],
  },
]

const moduleCopy: Record<Exclude<AdminSection, 'inicio' | 'perfil'>, { title: string; eyebrow: string; description: string; table: string; bullets: string[] }> = {
  usuarios: { title: 'Usuarios y roles', eyebrow: 'Acceso al sistema', description: 'Administra las cuentas, roles y estados de acceso de la comunidad Rassa.', table: 'perfiles', bullets: ['Consultar perfiles y roles', 'Asignar agricultor, vendedor o comprador', 'Activar o suspender cuentas'] },
  catalogo: { title: 'Catálogo', eyebrow: 'Productos y ubicación', description: 'Organiza las categorías, unidades, productos y datos de ubicación.', table: 'productos', bullets: ['Administrar productos y categorías', 'Gestionar unidades de medida', 'Consultar municipios y localidades'] },
  publicaciones: { title: 'Ciclos semanales', eyebrow: 'Oferta agrícola', description: 'Supervisa las publicaciones y la disponibilidad semanal de los agricultores.', table: 'publicaciones_semanales', bullets: ['Revisar borradores y publicaciones activas', 'Consultar stock y precios', 'Cerrar el ciclo semanal'] },
  pedidos: { title: 'Pedidos', eyebrow: 'Operación comercial', description: 'Consulta pedidos, responsables y cambios de estado en un solo lugar.', table: 'pedidos', bullets: ['Buscar pedidos y revisar detalles', 'Supervisar pedidos asignados a vendedores', 'Consultar historial de estados'] },
  familias: { title: 'Familias y crédito', eyebrow: 'Comunidad', description: 'Administra familias, integrantes y límites de crédito por cliente.', table: 'familias', bullets: ['Crear y actualizar familias', 'Administrar integrantes', 'Definir límites de crédito'] },
  pagos: { title: 'Pagos y caja', eyebrow: 'Control financiero', description: 'Registra pagos y supervisa los cortes de caja del equipo vendedor.', table: 'pagos', bullets: ['Consultar pagos y recibos', 'Revisar cortes abiertos y cerrados', 'Comparar montos teóricos y reales'] },
  recolecciones: { title: 'Recolecciones', eyebrow: 'Logística', description: 'Coordina fechas y horarios de recolección con agricultores.', table: 'recolecciones', bullets: ['Programar recolecciones', 'Consultar ubicación del agricultor', 'Dar seguimiento al estado'] },
  mermas: { title: 'Mermas', eyebrow: 'Cierre de ciclo', description: 'Da seguimiento a sobrantes, pérdidas y decisiones sobre su destino.', table: 'mermas', bullets: ['Registrar cantidad y motivo', 'Elegir decisión de destino', 'Consultar resúmenes por periodo'] },
  liquidaciones: { title: 'Liquidaciones', eyebrow: 'Pagos a productores', description: 'Consulta ventas, comisiones y montos pendientes por liquidar.', table: 'liquidaciones', bullets: ['Revisar periodos por agricultor', 'Consultar ventas y comisión', 'Marcar liquidaciones pagadas'] },
  chat: { title: 'Conversaciones', eyebrow: 'Comunicación interna', description: 'Supervisa conversaciones de soporte y grupos familiares autorizados.', table: 'conversaciones', bullets: ['Consultar conversaciones y participantes', 'Abrir conversaciones de soporte', 'Ver estado de actividad'] },
  auditoria: { title: 'Auditoría y reportes', eyebrow: 'Trazabilidad', description: 'Consulta la actividad relevante y los indicadores de operación.', table: 'registros_auditoria', bullets: ['Filtrar actividad por usuario y fecha', 'Consultar eventos administrativos', 'Revisar reportes operativos'] },
}

type CatalogField = { key: string; label: string; kind: 'text' | 'textarea' | 'checkbox' | 'select'; required?: boolean; source?: 'categorias' | 'municipios' }
type CatalogResource = { key: string; title: string; table: string; columns: string[]; fields: CatalogField[]; statusKey?: 'activo' | 'activa' }
const catalogResources: CatalogResource[] = [
  { key: 'productos', title: 'Productos', table: 'productos', columns: ['nombre','categoria_id','descripcion','es_perecedero','activo'], statusKey: 'activo', fields: [
    { key: 'nombre', label: 'Nombre del producto', kind: 'text', required: true },
    { key: 'categoria_id', label: 'Categoría', kind: 'select', source: 'categorias', required: true },
    { key: 'descripcion', label: 'Descripción', kind: 'textarea' },
    { key: 'es_perecedero', label: 'Producto perecedero', kind: 'checkbox' },
  ] },
  { key: 'categorias', title: 'Categorías', table: 'categorias', columns: ['nombre','descripcion','activa'], statusKey: 'activa', fields: [
    { key: 'nombre', label: 'Nombre', kind: 'text', required: true }, { key: 'descripcion', label: 'Descripción', kind: 'textarea' },
  ] },
  { key: 'unidades', title: 'Unidades', table: 'unidades', columns: ['nombre','abreviatura','permite_fraccion','activa'], statusKey: 'activa', fields: [
    { key: 'nombre', label: 'Nombre de unidad', kind: 'text', required: true }, { key: 'abreviatura', label: 'Abreviatura', kind: 'text', required: true },
    { key: 'permite_fraccion', label: 'Permite cantidades fraccionarias', kind: 'checkbox' },
  ] },
  { key: 'municipios', title: 'Municipios', table: 'municipios', columns: ['nombre'], fields: [
    { key: 'nombre', label: 'Nombre', kind: 'text', required: true },
  ] },
  { key: 'localidades', title: 'Localidades', table: 'localidades', columns: ['nombre','municipio_id'], fields: [
    { key: 'municipio_id', label: 'Municipio', kind: 'select', source: 'municipios', required: true }, { key: 'nombre', label: 'Nombre', kind: 'text', required: true },
  ] },
]

const roleLabels: Record<RoleName, string> = {
  administrador: 'Administrador', vendedor: 'Vendedor', agricultor: 'Agricultor', comprador: 'Comprador',
}
const ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000

function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem('rassa-theme') === 'dark')
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('rassa-theme', dark ? 'dark' : 'light')
  }, [dark])
  return { dark, toggle: () => setDark((value) => !value) }
}

function Brand() {
  return <div className="brand-lockup"><div className="brand-mark"><Leaf size={21} strokeWidth={2.5} /></div><div><strong>rassa</strong><span>JALA · ALIMENTACIÓN LOCAL</span></div></div>
}

function App() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [checking, setChecking] = useState(true)
  const [authError, setAuthError] = useState('')
  const invitationFlow = new URLSearchParams(window.location.search).get('flow') === 'invite'
  const [recoveryMode, setRecoveryMode] = useState(invitationFlow)
  const [active, setActive] = useState<AdminSection>('inicio')
  const [mobileNav, setMobileNav] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const { dark, toggle } = useTheme()

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])

  const loadProfile = useCallback(async (userId: string, email = '') => {
    if (!supabase) return
    const client = supabase
    const { data, error } = await client.from('perfiles')
      .select('id,nombres,apellido_paterno,apellido_materno,telefono,domicilio,activo,rol_id,roles(nombre,descripcion)')
      .eq('id', userId).maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Tu cuenta todavía no tiene un perfil Rassa. Pide al administrador que revise tu registro.')
    const roleValue = Array.isArray(data.roles) ? data.roles[0] : data.roles
    const nextProfile = { ...data, email, roles: roleValue } as Profile
    if (!nextProfile.activo) throw new Error('Esta cuenta está desactivada. Contacta al equipo administrador.')
    if (nextProfile.roles?.nombre !== 'administrador') throw new Error('Este acceso es exclusivo para el perfil administrador.')
    setProfile(nextProfile)
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client) { setChecking(false); return }
    void client.auth.getSession().then(async ({ data }) => {
      if (data.session?.user && !invitationFlow) {
        try { await loadProfile(data.session.user.id, data.session.user.email ?? '') } catch (error) {
          await client.auth.signOut()
          setAuthError(error instanceof Error ? error.message : 'No se pudo cargar el perfil.')
        }
      }
      setChecking(false)
    })
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (invitationFlow && event === 'SIGNED_IN')) setRecoveryMode(true)
      if (!session) setProfile(null)
    })
    return () => subscription.unsubscribe()
  }, [invitationFlow, loadProfile])

  const signIn = async (email: string, password: string) => {
    if (!supabase) return
    setAuthError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setAuthError(error.message); return }
    if (!data.user) { setAuthError('No se pudo validar la cuenta.'); return }
    try { await loadProfile(data.user.id, data.user.email ?? '') } catch (cause) {
      await supabase.auth.signOut()
      setAuthError(cause instanceof Error ? cause.message : 'No se pudo cargar el perfil.')
    }
  }

  const resetPassword = async (email: string) => {
    if (!supabase) return
    setAuthError('')
    if (!email.trim()) { setAuthError('Escribe tu correo para enviarte el enlace de recuperación.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` })
    setAuthError(error ? error.message : 'Si el correo pertenece a una cuenta, recibirás un enlace para restablecer la contraseña.')
  }

  const finishPasswordReset = async (password: string) => {
    if (!supabase) return
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setAuthError(error.message); return }
    setRecoveryMode(false)
    setAuthError('Contraseña actualizada. Inicia sesión con tu nueva contraseña.')
    await supabase.auth.signOut()
    if (invitationFlow) window.history.replaceState(null, '', window.location.pathname)
  }

  const signOut = async () => {
    await supabase?.auth.signOut()
    setProfile(null)
    setActive('inicio')
  }

  useEffect(() => {
    if (!profile || !supabase) return
    const client = supabase
    let timer: ReturnType<typeof setTimeout>
    let lastActivity = Date.now()
    let expired = false

    const expireSession = () => {
      if (expired) return
      expired = true
      void client.auth.signOut()
      setProfile(null)
      setActive('inicio')
      setAuthError('Tu sesión se cerró después de 30 minutos sin actividad. Inicia sesión para continuar.')
    }
    const scheduleExpiration = () => {
      clearTimeout(timer)
      const remaining = ADMIN_IDLE_TIMEOUT_MS - (Date.now() - lastActivity)
      if (remaining <= 0) expireSession()
      else timer = setTimeout(expireSession, remaining)
    }
    const markActivity = () => {
      lastActivity = Date.now()
      scheduleExpiration()
    }
    const checkAfterVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleExpiration()
    }

    const activityEvents: (keyof DocumentEventMap)[] = ['pointerdown', 'keydown', 'touchstart', 'scroll']
    activityEvents.forEach((event) => document.addEventListener(event, markActivity, { passive: true }))
    document.addEventListener('visibilitychange', checkAfterVisibilityChange)
    scheduleExpiration()
    return () => {
      clearTimeout(timer)
      activityEvents.forEach((event) => document.removeEventListener(event, markActivity))
      document.removeEventListener('visibilitychange', checkAfterVisibilityChange)
    }
  }, [profile])

  if (checking) return <div className="splash"><div className="splash-logo"><Leaf size={25} /></div><div className="loader" /><span>Preparando tu espacio...</span></div>
  if (!isSupabaseConfigured) return <SetupScreen />
  if (recoveryMode) return <RecoveryScreen onUpdate={finishPasswordReset} error={authError} />
  if (!profile) return <LoginScreen onSignIn={signIn} onForgotPassword={resetPassword} error={authError} dark={dark} toggleTheme={toggle} />

  return <div className="app-shell">
    {mobileNav && <button className="mobile-scrim" aria-label="Cerrar menú" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top"><Brand /><button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Cerrar menú"><X size={19} /></button></div>
      <div className="workspace-switch"><div className="workspace-icon"><Leaf size={16} /></div><div><strong>Rassa JALA</strong><span>Centro de control</span></div><ChevronDown size={15} className="muted" /></div>
      <nav className="primary-nav">
        {navGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-label">{group.label}</span>{group.items.map((item) => {
          const Icon = item.icon
          return <button key={item.id} className={`nav-item ${active === item.id ? 'selected' : ''}`} onClick={() => { setActive(item.id); setMobileNav(false) }}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.id === 'pedidos' && <i className="nav-dot" />}</button>
        })}</div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className={`offline-pill ${online ? '' : 'offline'}`}><span className="online-indicator" /> {online ? 'Conectado' : 'Sin conexión'} <span className="offline-caption">· {online ? 'red disponible' : 'panel requiere internet'}</span></div>
        <button className={`nav-item ${active === 'perfil' ? 'selected' : ''}`} onClick={() => { setActive('perfil'); setMobileNav(false) }}><UserRound size={17} /><span>Mi perfil</span></button>
        <div className="side-user"><div className="avatar avatar-green">{initials(profile)}</div><div className="side-user-text"><strong>{fullName(profile)}</strong><span>Administrador</span></div><button className="icon-button side-logout" title="Cerrar sesión" onClick={signOut}><LogOut size={16} /></button></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Abrir menú" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div className="breadcrumbs"><span>Rassa JALA</span><ArrowRight size={13} /><strong>{activeTitle(active)}</strong></div></div>
        <div className="topbar-actions"><span className="top-date"><span className="today-dot" /> Operación activa</span><button className="icon-button theme-button" title={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} onClick={toggle}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button><button className="icon-button bell-button" aria-label="Notificaciones"><Bell size={18} /><i /></button><button className="top-profile" onClick={() => setActive('perfil')}><div className="avatar avatar-green">{initials(profile)}</div><ChevronDown size={14} /></button></div>
      </header>
      <section className="page-content" key={active}>
        {active === 'inicio' && <Dashboard profile={profile} setActive={setActive} online={online} />}
        {active === 'perfil' && <ProfilePage profile={profile} onProfileChange={setProfile} />}
        {active !== 'inicio' && active !== 'perfil' && <AdminModule section={active} profileId={profile.id} />}
      </section>
      <footer className="page-footer"><span>© 2026 Rassa JALA</span><span><ShieldCheck size={13} /> Datos protegidos por permisos de acceso</span><a href="#ayuda"><CircleHelp size={14} /> Centro de ayuda</a></footer>
    </main>
  </div>
}

function SetupScreen() {
  return <div className="setup-screen"><div className="setup-card"><div className="brand-mark setup-mark"><Leaf size={24} /></div><span className="eyebrow">CONFIGURACIÓN INICIAL</span><h1>Conecta Rassa con Supabase</h1><p>La interfaz está lista para configurarse. Agrega la URL y la clave pública de tu proyecto en el archivo <code>.env.local</code>.</p><div className="setup-code"><span>VITE_SUPABASE_URL=...</span><span>VITE_SUPABASE_PUBLISHABLE_KEY=...</span></div><p className="setup-footnote">Usa únicamente la clave publicable. Nunca coloques la clave <code>service_role</code> en una PWA.</p></div></div>
}

function LoginScreen({ onSignIn, onForgotPassword, error, dark, toggleTheme }: { onSignIn: (email: string, password: string) => Promise<void>; onForgotPassword: (email: string) => Promise<void>; error: string; dark: boolean; toggleTheme: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    await onSignIn(email.trim(), password)
    setLoading(false)
  }
  return <div className="login-shell">
    <div className="login-decoration"><div className="decoration-grid" /><div className="login-brand"><Brand /></div><div className="login-quote"><div className="quote-mark">“</div><h1>Una red que<br /><em>alimenta comunidad.</em></h1><p>Productos locales, relaciones justas y una comunidad que crece en conjunto.</p><div className="quote-line" /><span>RED AGROECOLÓGICA · JALA, NAYARIT</span></div><div className="green-orb orb-one" /><div className="green-orb orb-two" /><div className="leaf-pattern"><Leaf /><Leaf /><Leaf /></div><div className="login-bottom">Cultivamos confianza, cosechamos futuro.</div></div>
    <div className="login-main"><button className="icon-button login-theme" onClick={toggleTheme} title={dark ? 'Tema claro' : 'Tema oscuro'}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button><div className="login-card"><div className="login-icon"><ShieldCheck size={22} /></div><span className="eyebrow">PANEL DE ADMINISTRACIÓN</span><h2>Qué gusto verte</h2><p className="login-subtitle">Inicia sesión para continuar con tu espacio de trabajo.</p>
      <form onSubmit={submit} className="login-form">
        <label htmlFor="email">Correo electrónico</label>
        <div className="input-wrap"><UserRound size={17} /><input id="email" type="email" autoComplete="username" placeholder="nombre@rassa.mx" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="password-label"><label htmlFor="password">Contraseña</label><button type="button" className="text-link" onClick={() => void onForgotPassword(email)}>¿La olvidaste?</button></div>
        <div className="input-wrap"><ShieldCheck size={17} /><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Ingresa tu contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /><button type="button" className="input-action" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
        <div className="form-security-note"><ShieldCheck size={14} /><span>La sesión se mantiene de forma segura en este dispositivo.</span></div>
        {error && <div className={error.startsWith('Si el correo') || error.startsWith('Contraseña actualizada') ? 'form-success' : 'form-error'}>{error}</div>}
        <button className="primary-button login-submit" type="submit" disabled={loading}>{loading ? <><span className="button-spinner" /> Verificando acceso...</> : <>Ingresar al panel <ArrowRight size={17} /></>}</button>
      </form>
      <div className="login-security"><ShieldCheck size={15} /><span>Acceso seguro con autenticación protegida</span></div></div><div className="login-footer"><span>© 2026 Rassa JALA</span><span>Ayuda</span><span>Privacidad</span></div></div>
  </div>
}

function RecoveryScreen({ onUpdate, error }: { onUpdate: (password: string) => Promise<void>; error: string }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password.length < 8) { setLocalError('La contraseña debe tener al menos 8 caracteres.'); return }
    if (password !== confirmation) { setLocalError('Las contraseñas no coinciden.'); return }
    setSaving(true); setLocalError('')
    await onUpdate(password)
    setSaving(false)
  }
  return <div className="recovery-shell"><form className="panel recovery-card" onSubmit={submit}><div className="login-icon"><ShieldCheck size={22} /></div><span className="eyebrow">SEGURIDAD DE LA CUENTA</span><h1>Crear contraseña nueva</h1><p>Elige una contraseña de al menos 8 caracteres para proteger tu cuenta.</p><label>Nueva contraseña<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></label><label>Confirmar contraseña<input type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required minLength={8} /></label>{(localError || error) && <div className="form-error">{localError || error}</div>}<button className="primary-button" type="submit" disabled={saving}>{saving ? 'Actualizando...' : 'Guardar contraseña'}</button></form></div>
}

function Dashboard({ profile, setActive, online }: { profile: Profile; setActive: (id: AdminSection) => void; online: boolean }) {
  const [metrics, setMetrics] = useState<Record<string, number | null>>({ users: null, products: null, orders: null, chats: null })
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const client = supabase
    if (!client) return
    let live = true
    const load = async () => {
      const [users, products, orders, conversations] = await Promise.all([
        client.from('perfiles').select('*', { count: 'exact', head: true }),
        client.from('productos').select('*', { count: 'exact', head: true }),
        client.from('pedidos').select('*', { count: 'exact', head: true }),
        client.from('conversaciones').select('*', { count: 'exact', head: true }),
      ])
      if (live) {
        setMetrics({ users: users.count, products: products.count, orders: orders.count, chats: conversations.count })
        setLoading(false)
      }
    }
    void load()
    return () => { live = false }
  }, [])
  const cards = [
    { label: 'Usuarios registrados', key: 'users', change: 'Perfiles de la comunidad', icon: Users, section: 'usuarios' as AdminSection, tint: 'mint' },
    { label: 'Productos en catálogo', key: 'products', change: 'Catálogo central', icon: Package, section: 'catalogo' as AdminSection, tint: 'lavender' },
    { label: 'Pedidos registrados', key: 'orders', change: 'Seguimiento de ventas', icon: ShoppingBasket, section: 'pedidos' as AdminSection, tint: 'peach' },
    { label: 'Conversaciones', key: 'chats', change: 'Comunicación de la red', icon: MessageCircle, section: 'chat' as AdminSection, tint: 'blue' },
  ]
  const shortcuts = [
    { label: 'Gestionar usuarios', detail: 'Roles y perfiles', icon: Users, section: 'usuarios' as AdminSection },
    { label: 'Revisar publicaciones', detail: 'Oferta semanal', icon: CalendarDays, section: 'publicaciones' as AdminSection },
    { label: 'Ver pedidos', detail: 'Estado y responsables', icon: ClipboardList, section: 'pedidos' as AdminSection },
    { label: 'Abrir cortes de caja', detail: 'Conciliación financiera', icon: Banknote, section: 'pagos' as AdminSection },
  ]
  return <>
    <div className="welcome-row"><div><span className="eyebrow">CENTRO DE CONTROL <span className="eyebrow-leaf">✳</span></span><h1>Buenos días, {profile.nombres}<span className="wave"> ✦</span></h1><p>Esto es lo que está pasando en tu red hoy.</p></div><button className="date-chip"><CalendarDays size={16} /> {new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(new Date())}</button></div>
    <div className="insight-banner"><div className="insight-icon"><Leaf size={21} /></div><div><strong>La red está en movimiento</strong><span>Administra las actividades de Rassa JALA desde un solo lugar.</span></div><button onClick={() => setActive('publicaciones')}>Ver ciclos semanales <ArrowRight size={15} /></button><div className="banner-decoration">✳</div></div>
    <div className="section-heading"><div><h2>Resumen general</h2><p>Indicadores de tu comunidad Rassa.</p></div><span className="live-label"><span /> Datos en vivo</span></div>
    <div className="stats-grid">{cards.map((card) => { const Icon = card.icon; return <button className="stat-card" key={card.key} onClick={() => setActive(card.section)}><div className="stat-top"><span>{card.label}</span><i className={`stat-icon ${card.tint}`}><Icon size={18} /></i></div><div className="stat-number">{loading ? <span className="skeleton-number" /> : metrics[card.key] ?? '—'}</div><div className="stat-foot"><span>{card.change}</span><span className="stat-arrow"><ArrowRight size={15} /></span></div></button> })}</div>
    <div className="dashboard-columns"><section className="panel quick-panel"><div className="panel-heading"><div><h3>Accesos rápidos</h3><p>Atajos a las tareas frecuentes.</p></div><button className="more-button" onClick={() => setActive('usuarios')}>Ver todo <ArrowRight size={14} /></button></div><div className="quick-list">{shortcuts.map((item) => { const Icon = item.icon; return <button className="quick-row" onClick={() => setActive(item.section)} key={item.label}><span className="quick-icon"><Icon size={17} /></span><span className="quick-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><ArrowRight size={15} className="quick-arrow" /></button> })}</div></section>
    <section className="panel operation-panel"><div className="panel-heading"><div><h3>Actividad de la red</h3><p>Estado de los módulos principales.</p></div><Activity size={18} className="heading-icon" /></div><div className="operation-list"><OperationItem icon={CalendarDays} title="Publicaciones semanales" detail="Gestión de ciclos y disponibilidad" tone="green" onClick={() => setActive('publicaciones')} /><OperationItem icon={Truck} title="Pedidos y recolecciones" detail="Seguimiento y coordinación" tone="orange" onClick={() => setActive('pedidos')} /><OperationItem icon={Banknote} title="Pagos y liquidaciones" detail="Cortes y pagos a productores" tone="purple" onClick={() => setActive('pagos')} /></div><div className="operation-footer"><span className={`online-indicator ${online ? '' : 'offline-indicator'}`} /> {online ? 'Conexión disponible' : 'Sin conexión'} <span>·</span> {online ? 'Supabase accesible' : 'Los cambios no se sincronizan'}</div></section></div>
    <div className="bottom-note"><div className="note-symbol"><HeartHandshake size={18} /></div><span><strong>La comunidad primero.</strong> Cada operación fortalece la red alimentaria local.</span><span className="note-flower">✿</span></div>
  </>
}

function OperationItem({ icon: Icon, title, detail, tone, onClick }: { icon: typeof CalendarDays; title: string; detail: string; tone: string; onClick: () => void }) {
  return <button className="operation-row" onClick={onClick}><span className={`operation-icon ${tone}`}><Icon size={17} /></span><span className="operation-copy"><strong>{title}</strong><small>{detail}</small></span><span className="operation-status"><i /> Activo</span></button>
}

function AdminModule({ section, profileId }: { section: Exclude<AdminSection, 'inicio' | 'perfil'>; profileId: string }) {
  const meta = moduleCopy[section]
  const [count, setCount] = useState<number | null>(null)
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [roles, setRoles] = useState<{ id: number; nombre: RoleName }[]>([])
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!supabase) return
    let live = true
    setLoading(true)
    setLoadError('')
    const selection = '*'
    void supabase.from(meta.table).select(selection, { count: 'exact' }).limit(100).then(({ count: result, data, error }) => {
      if (!live) return
      if (error) setLoadError(error.message)
      else { setCount(result); setRows((data ?? []) as Record<string, unknown>[]) }
      setLoading(false)
    })
    return () => { live = false }
  }, [meta.table, refreshKey, section])
  useEffect(() => {
    if (!supabase || section !== 'usuarios') return
    void supabase.from('roles').select('id,nombre').order('id').then(({ data }) => {
      setRoles((data ?? []) as { id: number; nombre: RoleName }[])
    })
  }, [section])
  const Icon = navGroups.flatMap((group) => group.items).find((item) => item.id === section)?.icon ?? Settings2
  const filteredRows = rows.filter((row) => JSON.stringify(row).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const columns = rows[0] ? Object.keys(rows[0]).filter((key) => key !== 'id').slice(0, 5) : []
  const canPublishToday = new Date().getDay() === 1

  const exportCsv = () => {
    if (!filteredRows.length) return
    const headers = columns
    const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const content = [headers.map(csvCell).join(','), ...filteredRows.map((row) => headers.map((key) => csvCell(row[key])).join(','))].join('\r\n')
    const blob = new Blob([`\ufeff${content}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `rassa-${section}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const updateUser = async (id: string, changes: Record<string, unknown>) => {
    if (!supabase || id === profileId) return
    setMessage('')
    const target = rows.find((row) => row.id === id)
    const targetRole = roles.find((role) => role.id === target?.rol_id)?.nombre
    const removingAdmin = targetRole === 'administrador' && target?.activo === true
      && (changes.activo === false || (typeof changes.rol_id === 'number' && roles.find((role) => role.id === changes.rol_id)?.nombre !== 'administrador'))
    if (removingAdmin) {
      const { count: activeAdmins, error: countError } = await supabase.from('perfiles')
        .select('id,roles!inner(nombre)', { count: 'exact', head: true })
        .eq('activo', true).eq('roles.nombre', 'administrador')
      if (countError) { setLoadError(countError.message); return }
      if ((activeAdmins ?? 0) <= 1) { setLoadError('No puedes desactivar ni cambiar el rol del último administrador activo.'); return }
    }
    const { error } = await supabase.from('perfiles').update(changes).eq('id', id)
    if (error) setLoadError(error.message)
    else { setMessage('Usuario actualizado.'); setRefreshKey((value) => value + 1) }
  }

  const updateAdminRow = async (id: string, table: string, changes: Record<string, unknown>) => {
    if (!supabase) return
    setLoadError('')
    const { error } = await supabase.from(table).update(changes).eq('id', id)
    if (error) setLoadError(error.message)
    else { setMessage('Cambio guardado.'); setRefreshKey((value) => value + 1) }
  }

  const renderRowAction = (row: Record<string, unknown>) => {
    if (section === 'usuarios') return <div className="row-actions"><select aria-label="Cambiar rol" value={String(row.rol_id)} disabled={row.id === profileId} onChange={(event) => void updateUser(String(row.id), { rol_id: Number(event.target.value) })}>{roles.map((role) => <option key={role.id} value={role.id}>{roleLabels[role.nombre]}</option>)}</select><button className={`status-toggle ${row.activo ? 'is-active' : ''}`} disabled={row.id === profileId} onClick={() => void updateUser(String(row.id), { activo: !row.activo })}>{row.activo ? 'Activo' : 'Desactivado'}</button></div>
    if (section === 'publicaciones') return row.estado === 'borrador'
      ? <button className="status-toggle is-active" disabled={!canPublishToday} title={canPublishToday ? 'Publicar ciclo' : 'El backend anterior permite publicar los lunes'} onClick={() => void updateAdminRow(String(row.id), meta.table, { estado: 'publicada' })}>Publicar</button>
      : row.estado === 'publicada'
        ? <button className="status-toggle" onClick={() => void updateAdminRow(String(row.id), meta.table, { estado: 'cerrada' })}>Cerrar ciclo</button>
        : <span className="muted">Ciclo cerrado</span>
    if (section === 'recolecciones') {
      const next: Record<string, string> = { pendiente: 'en_ruta', en_ruta: 'recolectada' }
      const nextState = next[String(row.estado)]
      return nextState ? <button className="status-toggle" onClick={() => void updateAdminRow(String(row.id), meta.table, { estado: nextState })}>Marcar {nextState.replace('_', ' ')}</button> : <span className="muted">{displayValue(row.estado)}</span>
    }
    if (section === 'liquidaciones' && row.estado === 'pendiente') return <button className="status-toggle is-active" onClick={() => void updateAdminRow(String(row.id), meta.table, { estado: 'pagada' })}>Marcar pagada</button>
    return null
  }

  if (section === 'catalogo') return <CatalogAdmin profileId={profileId} />
  if (section === 'publicaciones') return <WeeklyCyclesAdmin />
  if (section === 'familias') return <FamiliesAdmin />
  if (section === 'pedidos') return <OrdersAdmin />
  if (section === 'usuarios') return <UsersAdmin profileId={profileId} />
  if (section === 'pagos') return <PaymentsAdmin />
  if (section === 'recolecciones') return <PickupsAdmin />
  if (section === 'mermas') return <WasteAdmin />
  if (section === 'liquidaciones') return <SettlementsAdmin />
  if (section === 'chat') return <ChatAdmin />
  if (section === 'auditoria') return <AuditAdmin />
  return <>
    <div className="module-header"><div><div className="module-eyebrow"><span className="module-mark"><Icon size={14} /></span>{meta.eyebrow}</div><h1>{meta.title}</h1><p>{meta.description}</p></div><div className="module-toolbar"><button className="secondary-button" onClick={() => setRefreshKey((value) => value + 1)}><Activity size={15} /> Actualizar</button><button className="primary-button module-action" onClick={exportCsv} disabled={!filteredRows.length}><Download size={15} /> Exportar CSV</button></div></div>
    {loadError && <div className="inline-notice"><CircleHelp size={16} />{loadError}</div>}
    {message && <div className="form-success">{message}</div>}
    <div className="module-summary-grid"><div className="panel module-count"><div className="stat-top"><span>Registros actuales</span><span className="stat-icon mint"><Icon size={18} /></span></div><strong>{loading ? '…' : count ?? '—'}</strong><small>Actualizado desde Supabase</small></div><div className="panel module-description"><span className="eyebrow">FUNCIONES DEL MÓDULO</span><ul>{meta.bullets.map((bullet) => <li key={bullet}><span><Check size={12} /></span>{bullet}</li>)}</ul></div></div>
    <div className="panel data-preview"><div className="panel-heading"><div><h3>Registros</h3><p>Hasta 100 registros de <code>{meta.table}</code>.</p></div><label className="table-search"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en los registros" /></label></div>{filteredRows.length > 0 ? <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column}>{columnLabel(column)}</th>)}{['usuarios','publicaciones','recolecciones','liquidaciones'].includes(section) && <th>Acciones</th>}</tr></thead><tbody>{filteredRows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map((column) => <td key={column}>{column === 'rol_id' && section === 'usuarios' ? roleLabels[roles.find((role) => role.id === row.rol_id)?.nombre ?? 'comprador'] : displayValue(row[column])}</td>)}{['usuarios','publicaciones','recolecciones','liquidaciones'].includes(section) && <td>{renderRowAction(row)}</td>}</tr>)}</tbody></table></div> : <div className="empty-table"><div className="empty-illustration"><Package size={26} /></div><strong>{loading ? 'Cargando datos…' : search ? 'Sin coincidencias' : 'No hay registros para mostrar'}</strong><span>{loading ? 'Consultando Supabase.' : search ? 'Cambia el texto de búsqueda.' : 'Cuando se agreguen datos a este módulo, aparecerán aquí.'}</span></div>}</div>
  </>
}

function OrdersAdmin() {
  const [orders, setOrders] = useState<Record<string, unknown>[]>([])
  const [totals, setTotals] = useState<Record<string, number>>({})
  const [people, setPeople] = useState<Record<string, string>>({})
  const [sellers, setSellers] = useState<{ id: string; label: string }[]>([])
  const [states, setStates] = useState<Record<number, string>>({})
  const [details, setDetails] = useState<Record<string, unknown>[]>([])
  const [history, setHistory] = useState<Record<string, unknown>[]>([])
  const [selected, setSelected] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let live = true
    setLoading(true); setError('')
    void Promise.all([
      client.from('pedidos').select('*').order('creado_en', { ascending: false }).limit(300),
      client.from('totales_pedido').select('pedido_id,total'),
      client.from('perfiles').select('id,nombres,apellido_paterno,activo,rol_id'),
      client.from('roles').select('id,nombre'),
      client.from('estados_pedido').select('id,nombre'),
    ]).then(([ordersResult, totalResult, profilesResult, rolesResult, statesResult]) => {
      if (!live) return
      if (ordersResult.error) setError(ordersResult.error.message)
      else setOrders((ordersResult.data ?? []) as Record<string, unknown>[])
      if (totalResult.error) setError(totalResult.error.message)
      setTotals(Object.fromEntries((totalResult.data ?? []).map((row) => [row.pedido_id, Number(row.total)])))
      const roleNames = Object.fromEntries((rolesResult.data ?? []).map((role) => [role.id, role.nombre]))
      const profiles = profilesResult.data ?? []
      setPeople(Object.fromEntries(profiles.map((profile) => [profile.id, `${profile.nombres} ${profile.apellido_paterno}`.trim()])))
      setSellers(profiles.filter((profile) => profile.activo && roleNames[profile.rol_id] === 'vendedor').map((profile) => ({ id: profile.id, label: `${profile.nombres} ${profile.apellido_paterno}`.trim() })))
      setStates(Object.fromEntries((statesResult.data ?? []).map((state) => [state.id, state.nombre])))
      setLoading(false)
    })
    return () => { live = false }
  }, [refreshKey])

  useEffect(() => {
    if (!supabase || !selected) { setDetails([]); setHistory([]); return }
    const client = supabase
    let live = true
    void Promise.all([
      client.from('detalles_pedido').select('*').eq('pedido_id', selected).order('creado_en'),
      client.from('historial_pedido').select('*').eq('pedido_id', selected).order('creado_en', { ascending: false }),
    ]).then(([detailResult, historyResult]) => {
      if (!live) return
      if (detailResult.error) setError(detailResult.error.message)
      else setDetails((detailResult.data ?? []) as Record<string, unknown>[])
      if (historyResult.error) setError(historyResult.error.message)
      else setHistory((historyResult.data ?? []) as Record<string, unknown>[])
    })
    return () => { live = false }
  }, [selected, refreshKey])

  const statusFor = (row: Record<string, unknown>) => states[Number(row.estado_id)] ?? 'desconocido'
  const nextState: Record<string, string> = { pendiente: 'confirmado', confirmado: 'en_preparacion', en_preparacion: 'listo_para_retirar', listo_para_retirar: 'entregado' }
  const filtered = orders.filter((order) => `${order.id} ${people[String(order.comprador_id)] ?? ''} ${people[String(order.vendedor_id)] ?? ''} ${statusFor(order)}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))

  const runOrderAction = async (rpc: 'admin_cambiar_estado_pedido' | 'admin_asignar_vendedor', args: Record<string, unknown>, success: string) => {
    if (!supabase || !selected) return
    setSaving(true); setError(''); setMessage('')
    const { error: rpcError } = await supabase.rpc(rpc, args as never)
    if (rpcError) setError(`${rpcError.message}. Confirma que ejecutaste sql/admin_workflows_supabase.sql en Supabase.`)
    else { setMessage(success); setRefreshKey((value) => value + 1) }
    setSaving(false)
  }

  const order = orders.find((item) => item.id === selected)
  const stateName = order ? statusFor(order) : ''
  return <>
    <div className="module-header"><div><div className="module-eyebrow"><span className="module-mark"><ShoppingBasket size={14} /></span>OPERACIÓN COMERCIAL</div><h1>Pedidos</h1><p>Revisa compras, asigna vendedores y da seguimiento al historial.</p></div><button className="secondary-button" onClick={() => setRefreshKey((value) => value + 1)}><Activity size={15} /> Actualizar</button></div>
    {error && <div className="inline-notice"><CircleHelp size={16} />{error}</div>}{message && <div className="form-success">{message}</div>}
    <div className="panel data-preview"><div className="panel-heading"><div><h3>Pedidos recibidos</h3><p>{loading ? 'Cargando…' : `${filtered.length} de ${orders.length} pedidos`}</p></div><label className="table-search"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Comprador, vendedor o estado" /></label></div>
      {filtered.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Pedido</th><th>Comprador</th><th>Vendedor asignado</th><th>Estado</th><th>Total</th><th>Fecha</th><th>Detalle</th></tr></thead><tbody>{filtered.map((item) => <tr key={String(item.id)}><td>{String(item.id).slice(0, 8).toUpperCase()}</td><td>{people[String(item.comprador_id)] ?? '—'}</td><td>{people[String(item.vendedor_id)] ?? 'Sin asignar'}</td><td>{stateForLabel(statusFor(item))}</td><td>{money(totals[String(item.id)] ?? 0)}</td><td>{new Date(String(item.creado_en)).toLocaleDateString('es-MX')}</td><td><button className="secondary-button compact-button" onClick={() => { setSelected(String(item.id)); setError(''); setMessage('') }}>Administrar</button></td></tr>)}</tbody></table></div> : <div className="empty-table"><div className="empty-illustration"><Package size={26} /></div><strong>{loading ? 'Cargando pedidos…' : 'No hay pedidos para mostrar'}</strong><span>{search ? 'Prueba otro texto de búsqueda.' : 'Los pedidos nuevos aparecerán aquí.'}</span></div>}
    </div>
    {order && <section className="panel data-preview order-management"><div className="panel-heading"><div><h3>Pedido {String(order.id).slice(0, 8).toUpperCase()}</h3><p>{people[String(order.comprador_id)] ?? 'Comprador'} · {stateForLabel(stateName)} · {money(totals[selected] ?? 0)}</p></div><button className="secondary-button compact-button" onClick={() => setSelected('')}>Cerrar</button></div>
      <div className="order-actions"><label>Vendedor<select value={String(order.vendedor_id ?? '')} disabled={saving} onChange={(event) => void runOrderAction('admin_asignar_vendedor', { p_pedido_id: selected, p_vendedor_id: event.target.value || null }, 'Asignación actualizada.') }><option value="">Sin asignar</option>{sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.label}</option>)}</select></label><div className="row-actions">{nextState[stateName] && <button className="primary-button" disabled={saving} onClick={() => void runOrderAction('admin_cambiar_estado_pedido', { p_pedido_id: selected, p_nuevo_estado: nextState[stateName] }, 'Estado del pedido actualizado.')}>Avanzar a {stateForLabel(nextState[stateName])}</button>}{!['entregado','cancelado'].includes(stateName) && <button className="status-toggle" disabled={saving} onClick={() => { if (window.confirm('¿Cancelar el pedido y devolver el stock?')) void runOrderAction('admin_cambiar_estado_pedido', { p_pedido_id: selected, p_nuevo_estado: 'cancelado' }, 'Pedido cancelado y stock restaurado.') }}>Cancelar pedido</button>}</div></div>
      <h4>Productos</h4><div className="table-scroll"><table className="data-table"><thead><tr><th>Producto</th><th>Cantidad</th><th>Unidad</th><th>Precio</th><th>Importe</th></tr></thead><tbody>{details.map((line) => <tr key={String(line.id)}><td>{displayValue(line.nombre_producto_snapshot)}</td><td>{displayValue(line.cantidad)}</td><td>{displayValue(line.unidad_snapshot)}</td><td>{money(Number(line.precio_unitario))}</td><td>{money(Number(line.precio_unitario) * Number(line.cantidad))}</td></tr>)}</tbody></table></div>
      <h4>Historial de estados</h4>{history.length ? <ul className="order-history">{history.map((entry) => <li key={String(entry.id)}><strong>{stateForLabel(states[Number(entry.estado_nuevo_id)] ?? 'desconocido')}</strong><span>{displayValue(entry.comentario)}</span><small>{new Date(String(entry.creado_en)).toLocaleString('es-MX')} · {people[String(entry.cambiado_por)] ?? 'Sistema'}</small></li>)}</ul> : <p className="muted">Este pedido todavía no tiene historial.</p>}
    </section>}
  </>
}

function stateForLabel(state: string) { return state.replaceAll('_', ' ').replace(/^\w/, (letter) => letter.toLocaleUpperCase()) }
function money(value: number) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value) }

function FamiliesAdmin() {
  const [families, setFamilies] = useState<Record<string, unknown>[]>([])
  const [buyers, setBuyers] = useState<{ id: string; label: string }[]>([])
  const [members, setMembers] = useState<Record<string, unknown>[]>([])
  const [limits, setLimits] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState('')
  const [newMember, setNewMember] = useState('')
  const [name, setName] = useState('')
  const [headId, setHeadId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let live = true
    setLoading(true)
    void Promise.all([
      client.from('familias').select('*').order('creado_en', { ascending: false }).limit(300),
      client.from('roles').select('id').eq('nombre', 'comprador').maybeSingle(),
    ]).then(async ([familyResult, buyerRole]) => {
      if (!live) return
      if (familyResult.error) setError(familyResult.error.message)
      else setFamilies((familyResult.data ?? []) as Record<string, unknown>[])
      if (buyerRole.data?.id) {
        const { data, error: buyerError } = await client.from('perfiles').select('id,nombres,apellido_paterno,activo').eq('rol_id', buyerRole.data.id).eq('activo', true).order('nombres')
        if (!live) return
        if (buyerError) setError(buyerError.message)
        setBuyers((data ?? []).map((buyer) => ({ id: buyer.id, label: `${buyer.nombres} ${buyer.apellido_paterno}` })))
      }
      setLoading(false)
    })
    return () => { live = false }
  }, [refreshKey])

  useEffect(() => {
    if (!supabase || !selectedId) { setMembers([]); setLimits({}); return }
    const client = supabase
    let live = true
    void client.from('integrantes_familia').select('usuario_id,unido_en').eq('familia_id', selectedId).order('unido_en').then(async ({ data, error: memberError }) => {
      if (!live) return
      if (memberError) { setError(memberError.message); return }
      const ids = (data ?? []).map((row) => row.usuario_id)
      if (!ids.length) { setMembers([]); setLimits({}); return }
      const [{ data: profiles, error: profileError }, { data: credits, error: creditError }] = await Promise.all([
        client.from('perfiles').select('id,nombres,apellido_paterno,telefono').in('id', ids),
        client.from('limites_credito').select('comprador_id,limite').in('comprador_id', ids),
      ])
      if (!live) return
      if (profileError) setError(profileError.message)
      if (creditError) setError(creditError.message)
      setMembers((profiles ?? []) as Record<string, unknown>[])
      setLimits(Object.fromEntries((credits ?? []).map((row) => [row.comprador_id, String(row.limite)])))
    })
    return () => { live = false }
  }, [selectedId, refreshKey])

  const createFamily = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    setSaving(true); setError(''); setMessage('')
    const { data, error: createError } = await supabase.from('familias').insert({ nombre: name.trim(), jefe_id: headId || null }).select('id').single()
    if (createError) { setError(createError.message); setSaving(false); return }
    if (headId) {
      const { error: memberError } = await supabase.from('integrantes_familia').insert({ familia_id: data.id, usuario_id: headId })
      if (memberError) {
        await supabase.from('familias').delete().eq('id', data.id)
        setError(`No se pudo agregar al jefe de familia; se canceló el alta. ${memberError.message}`)
        setSaving(false); return
      }
    }
    setName(''); setHeadId(''); setSelectedId(data.id); setMessage('Familia creada. Agrega integrantes y configura sus límites de crédito.'); setRefreshKey((value) => value + 1); setSaving(false)
  }

  const addMember = async () => {
    if (!supabase || !selectedId || !newMember) return
    setSaving(true); setError('')
    const { error: addError } = await supabase.from('integrantes_familia').insert({ familia_id: selectedId, usuario_id: newMember })
    if (addError) setError(addError.message)
    else { setNewMember(''); setMessage('Integrante agregado.'); setRefreshKey((value) => value + 1) }
    setSaving(false)
  }

  const removeMember = async (memberId: string) => {
    if (!supabase || !selectedId) return
    setError('')
    const { error: removeError } = await supabase.from('integrantes_familia').delete().eq('familia_id', selectedId).eq('usuario_id', memberId)
    if (removeError) setError(removeError.message)
    else { setMessage('Integrante retirado de la familia.'); setRefreshKey((value) => value + 1) }
  }

  const saveCreditLimit = async (buyerId: string) => {
    if (!supabase) return
    const raw = limits[buyerId]
    const amount = Number(raw)
    if (!Number.isFinite(amount) || amount < 0) { setError('El límite debe ser un monto igual o mayor a cero.'); return }
    setError('')
    const { error: limitError } = await supabase.from('limites_credito').upsert({ comprador_id: buyerId, limite: amount }, { onConflict: 'comprador_id' })
    if (limitError) setError(limitError.message)
    else setMessage('Límite de crédito guardado.')
  }

  const setFamilyActive = async (row: Record<string, unknown>) => {
    if (!supabase) return
    const { error: activeError } = await supabase.from('familias').update({ activa: !row.activa }).eq('id', String(row.id))
    if (activeError) setError(activeError.message)
    else { setMessage(row.activa ? 'Familia desactivada.' : 'Familia reactivada.'); setRefreshKey((value) => value + 1) }
  }

  const filtered = families.filter((family) => JSON.stringify(family).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const selectedFamily = families.find((family) => family.id === selectedId)
  const memberIds = new Set(members.map((member) => String(member.id)))
  const availableBuyers = buyers.filter((buyer) => !memberIds.has(buyer.id))

  return <>
    <div className="module-header"><div><div className="module-eyebrow"><span className="module-mark"><HeartHandshake size={14} /></span>COMUNIDAD</div><h1>Familias y crédito</h1><p>Organiza familias, asigna integrantes y administra límites de crédito individuales.</p></div><button className="secondary-button" onClick={() => setRefreshKey((value) => value + 1)}><Activity size={15} /> Actualizar</button></div>
    {error && <div className="inline-notice"><CircleHelp size={16} />{error}</div>}{message && <div className="form-success">{message}</div>}
    <form className="panel family-create-form" onSubmit={(event) => void createFamily(event)}><div><span className="eyebrow">NUEVA FAMILIA</span><h3>Crear grupo familiar</h3></div><label>Nombre de familia<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Familia García" /></label><label>Jefe/a de familia<select value={headId} onChange={(event) => setHeadId(event.target.value)}><option value="">Sin asignar</option>{buyers.map((buyer) => <option value={buyer.id} key={buyer.id}>{buyer.label}</option>)}</select></label><button className="primary-button" type="submit" disabled={saving || !name.trim()}><Plus size={15} /> Crear familia</button></form>
    <div className="panel data-preview"><div className="panel-heading"><div><h3>Familias</h3><p>{loading ? 'Cargando…' : `${filtered.length} de ${families.length} familias`}</p></div><label className="table-search"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar familia" /></label></div>{filtered.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Nombre</th><th>Jefe/a</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map((family) => <tr key={String(family.id)}><td>{displayValue(family.nombre)}</td><td>{buyers.find((buyer) => buyer.id === family.jefe_id)?.label ?? displayValue(family.jefe_id)}</td><td>{family.activa ? 'Activa' : 'Desactivada'}</td><td><div className="row-actions"><button className="secondary-button compact-button" onClick={() => setSelectedId(String(family.id))}>Integrantes y crédito</button><button className={`status-toggle ${family.activa ? 'is-active' : ''}`} onClick={() => void setFamilyActive(family)}>{family.activa ? 'Desactivar' : 'Activar'}</button></div></td></tr>)}</tbody></table></div> : <div className="empty-table"><HeartHandshake size={25} /><strong>{loading ? 'Cargando familias…' : 'No hay familias'}</strong><span>Crea una familia y agrega compradores.</span></div>}</div>
    {selectedFamily && <div className="panel data-preview family-members"><div className="panel-heading"><div><h3>{String(selectedFamily.nombre)}</h3><p>Integrantes y límites de crédito</p></div><button className="secondary-button" onClick={() => setSelectedId('')}>Cerrar detalle</button></div><div className="inline-add-member"><select value={newMember} onChange={(event) => setNewMember(event.target.value)}><option value="">Selecciona comprador…</option>{availableBuyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.label}</option>)}</select><button className="primary-button" disabled={!newMember || saving} onClick={() => void addMember()}><Plus size={14} /> Agregar integrante</button></div>{members.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Integrante</th><th>Teléfono</th><th>Límite de crédito</th><th>Acciones</th></tr></thead><tbody>{members.map((member) => <tr key={String(member.id)}><td>{`${member.nombres} ${member.apellido_paterno}`}</td><td>{displayValue(member.telefono)}</td><td><div className="credit-edit"><span>$</span><input aria-label={`Límite de crédito de ${member.nombres}`} type="number" min="0" step="0.01" value={limits[String(member.id)] ?? ''} onChange={(event) => setLimits((current) => ({ ...current, [String(member.id)]: event.target.value }))} /><button className="secondary-button compact-button" onClick={() => void saveCreditLimit(String(member.id))}>Guardar</button></div></td><td><button className="status-toggle" onClick={() => void removeMember(String(member.id))}>Quitar</button></td></tr>)}</tbody></table></div> : <div className="empty-table"><strong>Esta familia no tiene integrantes</strong><span>Selecciona un comprador para agregarlo.</span></div>}</div>}
  </>
}

function WeeklyCyclesAdmin() {
  const [publications, setPublications] = useState<Record<string, unknown>[]>([])
  const [farmers, setFarmers] = useState<{ id: string; label: string }[]>([])
  const [products, setProducts] = useState<{ id: string; nombre: string }[]>([])
  const [units, setUnits] = useState<{ id: string; nombre: string }[]>([])
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [farmerId, setFarmerId] = useState('')
  const [newItem, setNewItem] = useState({ producto_id: '', unidad_id: '', precio: '', stock: '' })
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const monday = new Date().getDay() === 1

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let live = true
    setLoading(true)
    void Promise.all([
      client.from('publicaciones_semanales').select('*').order('fecha_publicacion', { ascending: false }).limit(200),
      client.from('roles').select('id').eq('nombre', 'agricultor').maybeSingle(),
      client.from('productos').select('id,nombre').eq('activo', true).order('nombre'),
      client.from('unidades').select('id,nombre').eq('activa', true).order('nombre'),
    ]).then(async ([pubResult, farmerRole, productResult, unitResult]) => {
      if (!live) return
      if (pubResult.error) setError(pubResult.error.message)
      else setPublications((pubResult.data ?? []) as Record<string, unknown>[])
      setProducts((productResult.data ?? []) as { id: string; nombre: string }[])
      setUnits((unitResult.data ?? []) as { id: string; nombre: string }[])
      if (farmerRole.data?.id) {
        const { data, error: farmerError } = await client.from('perfiles').select('id,nombres,apellido_paterno').eq('rol_id', farmerRole.data.id).eq('activo', true).order('nombres')
        if (!live) return
        if (farmerError) setError(farmerError.message)
        setFarmers((data ?? []).map((farmer) => ({ id: farmer.id, label: `${farmer.nombres} ${farmer.apellido_paterno}` })))
      }
      setLoading(false)
    })
    return () => { live = false }
  }, [refreshKey])

  useEffect(() => {
    if (!supabase || !selectedId) { setItems([]); return }
    let live = true
    void supabase.from('productos_publicados').select('*').eq('publicacion_id', selectedId).order('creado_en').then(({ data, error: itemError }) => {
      if (!live) return
      if (itemError) setError(itemError.message)
      else setItems((data ?? []) as Record<string, unknown>[])
    })
    return () => { live = false }
  }, [selectedId, refreshKey])

  const filtered = publications.filter((row) => JSON.stringify(row).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const nextMonday = () => {
    const date = new Date()
    const offset = ((8 - date.getDay()) % 7) || 7
    date.setDate(date.getDate() + offset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  const createPublication = async () => {
    if (!supabase || !farmerId) { setError('Selecciona el agricultor responsable.'); return }
    if (!monday) { setError('El backend anterior permite crear publicaciones únicamente los lunes.'); return }
    setSaving(true); setError(''); setMessage('')
    const { data, error: createError } = await supabase.from('publicaciones_semanales')
      .insert({ agricultor_id: farmerId, fecha_publicacion: nextMonday(), estado: 'borrador' }).select('id').single()
    if (createError) setError(createError.message)
    else {
      setMessage('Ciclo creado como borrador. Agrega sus productos antes de publicarlo.')
      setSelectedId(data.id)
      setRefreshKey((value) => value + 1)
    }
    setSaving(false)
  }

  const changePublication = async (id: string, estado: 'publicada' | 'cerrada') => {
    if (!supabase) return
    if (estado === 'publicada' && !monday) { setError('Las publicaciones solo pueden publicarse los lunes.'); return }
    setError(''); setMessage('')
    const { error: updateError } = await supabase.from('publicaciones_semanales').update({ estado }).eq('id', id)
    if (updateError) setError(updateError.message)
    else { setMessage(estado === 'publicada' ? 'Publicación activa.' : 'Ciclo cerrado.'); setRefreshKey((value) => value + 1) }
  }

  const addWeeklyProduct = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase || !selectedId) return
    const publication = publications.find((row) => row.id === selectedId)
    if (publication?.estado !== 'borrador') { setError('Solo puedes modificar los productos de un ciclo en borrador.'); return }
    setSaving(true); setError(''); setMessage('')
    const { error: insertError } = await supabase.from('productos_publicados').insert({
      publicacion_id: selectedId, producto_id: newItem.producto_id, unidad_id: newItem.unidad_id,
      precio: Number(newItem.precio), stock_inicial: Number(newItem.stock), stock_disponible: Number(newItem.stock), activo: true,
    })
    if (insertError) setError(insertError.message)
    else { setMessage('Producto agregado al ciclo.'); setNewItem({ producto_id: '', unidad_id: '', precio: '', stock: '' }); setRefreshKey((value) => value + 1) }
    setSaving(false)
  }

  const selectedPublication = publications.find((row) => row.id === selectedId)
  const productName = (id: unknown) => products.find((item) => item.id === id)?.nombre ?? displayValue(id)
  const unitName = (id: unknown) => units.find((item) => item.id === id)?.nombre ?? displayValue(id)

  return <>
    <div className="module-header"><div><div className="module-eyebrow"><span className="module-mark"><CalendarDays size={14} /></span>OFERTA AGRÍCOLA</div><h1>Ciclos semanales</h1><p>Crea borradores, prepara productos y publica la oferta semanal de cada agricultor.</p></div><div className="module-toolbar"><select className="inline-select" aria-label="Agricultor responsable" value={farmerId} onChange={(event) => setFarmerId(event.target.value)}><option value="">Selecciona agricultor…</option>{farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.label}</option>)}</select><button className="primary-button" disabled={!monday || saving || farmers.length === 0 || !farmerId} title={!monday ? 'Solo se crean publicaciones los lunes' : ''} onClick={() => void createPublication()}><Plus size={15} /> Crear ciclo</button></div></div>
    {error && <div className="inline-notice"><CircleHelp size={16} />{error}</div>}{message && <div className="form-success">{message}</div>}
    <div className="panel data-preview"><div className="panel-heading"><div><h3>Ciclos registrados</h3><p>{loading ? 'Cargando…' : `${publications.length} ciclos`}</p></div><label className="table-search"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filtrar por agricultor, fecha o estado" /></label></div>
      {filtered.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Fecha</th><th>Agricultor</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map((row) => <tr key={String(row.id)}><td>{displayValue(row.fecha_publicacion)}</td><td>{farmers.find((farmer) => farmer.id === row.agricultor_id)?.label ?? displayValue(row.agricultor_id)}</td><td>{displayValue(row.estado)}</td><td><div className="row-actions"><button className="secondary-button compact-button" onClick={() => setSelectedId(String(row.id))}>Productos</button>{row.estado === 'borrador' && <button className="status-toggle is-active" disabled={!monday} onClick={() => void changePublication(String(row.id), 'publicada')}>Publicar</button>}{row.estado === 'publicada' && <button className="status-toggle" onClick={() => void changePublication(String(row.id), 'cerrada')}>Cerrar</button>}</div></td></tr>)}</tbody></table></div> : <div className="empty-table"><div className="empty-illustration"><CalendarDays size={26} /></div><strong>{loading ? 'Cargando ciclos…' : 'No hay ciclos para mostrar'}</strong><span>{!monday ? 'La creación y publicación se habilitan los lunes.' : 'Crea un ciclo para comenzar a preparar la oferta.'}</span></div>}
    </div>
    {selectedPublication && <div className="panel data-preview cycle-products"><div className="panel-heading"><div><h3>Productos del ciclo</h3><p>{displayValue(selectedPublication.fecha_publicacion)} · {displayValue(selectedPublication.estado)}</p></div><button className="secondary-button" onClick={() => setSelectedId('')}>Cerrar detalle</button></div>
      {selectedPublication.estado === 'borrador' && <form className="cycle-product-form" onSubmit={(event) => void addWeeklyProduct(event)}><label>Producto<select value={newItem.producto_id} required onChange={(event) => setNewItem((value) => ({ ...value, producto_id: event.target.value }))}><option value="">Selecciona…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.nombre}</option>)}</select></label><label>Unidad<select value={newItem.unidad_id} required onChange={(event) => setNewItem((value) => ({ ...value, unidad_id: event.target.value }))}><option value="">Selecciona…</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.nombre}</option>)}</select></label><label>Precio<input type="number" min="0" step="0.01" required value={newItem.precio} onChange={(event) => setNewItem((value) => ({ ...value, precio: event.target.value }))} /></label><label>Stock<input type="number" min="0" step="0.001" required value={newItem.stock} onChange={(event) => setNewItem((value) => ({ ...value, stock: event.target.value }))} /></label><button type="submit" className="primary-button" disabled={saving}><Plus size={14} /> Agregar</button></form>}
      {items.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Producto</th><th>Unidad</th><th>Precio</th><th>Stock inicial</th><th>Disponible</th><th>Activo</th></tr></thead><tbody>{items.map((item) => <tr key={String(item.id)}><td>{productName(item.producto_id)}</td><td>{unitName(item.unidad_id)}</td><td>${displayValue(item.precio)}</td><td>{displayValue(item.stock_inicial)}</td><td>{displayValue(item.stock_disponible)}</td><td>{displayValue(item.activo)}</td></tr>)}</tbody></table></div> : <div className="empty-table"><strong>Aún no hay productos</strong><span>Agrega productos al borrador y después publica el ciclo.</span></div>}
    </div>}
  </>
}

function CatalogAdmin({ profileId }: { profileId: string }) {
  const [resourceKey, setResourceKey] = useState('productos')
  const resource = catalogResources.find((item) => item.key === resourceKey) ?? catalogResources[0]
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [options, setOptions] = useState<Record<string, { id: string; nombre: string }[]>>({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})

  useEffect(() => {
    if (!supabase) return
    let live = true
    setLoading(true)
    setLoadError('')
    void supabase.from(resource.table).select('*', { count: 'exact' }).limit(500).then(({ data, error }) => {
      if (!live) return
      if (error) setLoadError(error.message)
      else setRows((data ?? []) as Record<string, unknown>[])
      setLoading(false)
    })
    return () => { live = false }
  }, [resource.table, refreshKey])

  useEffect(() => {
    if (!supabase) return
    void Promise.all([
      supabase.from('categorias').select('id,nombre').order('nombre'),
      supabase.from('municipios').select('id,nombre').order('nombre'),
    ]).then(([categories, municipalities]) => {
      setOptions({
        categorias: (categories.data ?? []) as { id: string; nombre: string }[],
        municipios: (municipalities.data ?? []) as { id: string; nombre: string }[],
      })
    })
  }, [refreshKey])

  const filtered = rows.filter((row) => JSON.stringify(row).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const closeForm = () => { setEditing(null); setDraft({}); setLoadError('') }
  const openCreate = () => { setEditing({}); setDraft({ es_perecedero: false, permite_fraccion: false }); setLoadError('') }
  const openEdit = (row: Record<string, unknown>) => {
    setEditing(row)
    setDraft(Object.fromEntries(resource.fields.map((field) => [field.key, row[field.key] ?? (field.kind === 'checkbox' ? false : '')])))
    setLoadError('')
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    setSaving(true)
    setLoadError('')
    setMessage('')
    const payload: Record<string, unknown> = {}
    for (const field of resource.fields) {
      const value = draft[field.key]
      payload[field.key] = field.kind === 'checkbox' ? Boolean(value) : typeof value === 'string' ? value.trim() || null : value
    }
    if (resource.key === 'productos' && !editing?.id) payload.creado_por = profileId
    if (resource.statusKey && !editing?.id) payload[resource.statusKey] = true
    const result = editing?.id
      ? await supabase.from(resource.table).update(payload).eq('id', String(editing.id))
      : await supabase.from(resource.table).insert(payload)
    if (result.error) setLoadError(result.error.message)
    else {
      setMessage(editing?.id ? 'Registro actualizado.' : 'Registro creado.')
      closeForm()
      setRefreshKey((value) => value + 1)
    }
    setSaving(false)
  }

  const toggleStatus = async (row: Record<string, unknown>) => {
    if (!supabase || !resource.statusKey) return
    const key = resource.statusKey
    const { error } = await supabase.from(resource.table).update({ [key]: !row[key] }).eq('id', String(row.id))
    if (error) setLoadError(error.message)
    else { setMessage(row[key] ? 'Registro desactivado.' : 'Registro restaurado.'); setRefreshKey((value) => value + 1) }
  }

  const labelFor = (column: string, value: unknown) => {
    if (column === 'categoria_id') return options.categorias?.find((item) => item.id === value)?.nombre ?? displayValue(value)
    if (column === 'municipio_id') return options.municipios?.find((item) => item.id === value)?.nombre ?? displayValue(value)
    return displayValue(value)
  }

  return <>
    <div className="module-header"><div><div className="module-eyebrow"><span className="module-mark"><Apple size={14} /></span>PRODUCTOS Y UBICACIÓN</div><h1>Catálogo</h1><p>Administra productos, categorías, unidades y ubicaciones de la red.</p></div><div className="module-toolbar"><button className="secondary-button" onClick={() => setRefreshKey((value) => value + 1)}><Activity size={15} /> Actualizar</button><button className="primary-button" onClick={openCreate}><Plus size={15} /> Nuevo {resource.title.toLocaleLowerCase()}</button></div></div>
    <div className="management-tabs" role="tablist" aria-label="Secciones del catálogo">{catalogResources.map((item) => <button key={item.key} role="tab" aria-selected={resourceKey === item.key} className={resourceKey === item.key ? 'active' : ''} onClick={() => { setResourceKey(item.key); setSearch(''); closeForm() }}>{item.title}</button>)}</div>
    {loadError && !editing && <div className="inline-notice"><CircleHelp size={16} />{loadError}</div>}
    {message && <div className="form-success">{message}</div>}
    <div className="panel data-preview"><div className="panel-heading"><div><h3>{resource.title}</h3><p>{loading ? 'Cargando…' : `${filtered.length} de ${rows.length} registros`}</p></div><label className="table-search"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Buscar ${resource.title.toLocaleLowerCase()}`} /></label></div>
      {filtered.length ? <div className="table-scroll"><table className="data-table"><thead><tr>{resource.columns.map((column) => <th key={column}>{columnLabel(column)}</th>)}<th>Acciones</th></tr></thead><tbody>{filtered.map((row) => <tr key={String(row.id)}>{resource.columns.map((column) => <td key={column}>{labelFor(column, row[column])}</td>)}<td><div className="row-actions"><button className="secondary-button compact-button" onClick={() => openEdit(row)}>Editar</button>{resource.statusKey && <button className={`status-toggle ${row[resource.statusKey] ? 'is-active' : ''}`} onClick={() => void toggleStatus(row)}>{row[resource.statusKey] ? 'Activo' : 'Restaurar'}</button>}</div></td></tr>)}</tbody></table></div> : <div className="empty-table"><div className="empty-illustration"><Package size={26} /></div><strong>{loading ? 'Cargando catálogo…' : search ? 'Sin coincidencias' : `No hay ${resource.title.toLocaleLowerCase()}`}</strong><span>{search ? 'Prueba otro texto.' : 'Agrega el primer registro para este catálogo.'}</span></div>}
    </div>
    {editing !== null && <div className="form-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm() }}><form className="panel form-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-form-title" onSubmit={(event) => void save(event)}><div className="panel-heading"><div><h3 id="catalog-form-title">{editing.id ? 'Editar' : 'Nuevo'} {resource.title.toLocaleLowerCase()}</h3><p>Los cambios se guardan en Supabase.</p></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={closeForm}><X size={17} /></button></div><div className="module-form">{resource.fields.map((field) => <label key={field.key} className={field.kind === 'textarea' ? 'form-wide' : ''}>{field.kind === 'checkbox' ? <span className="checkbox-field"><input type="checkbox" checked={Boolean(draft[field.key])} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.checked }))} />{field.label}</span> : <>{field.label}{field.kind === 'select' ? <select value={String(draft[field.key] ?? '')} required={field.required} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">Selecciona…</option>{(options[field.source ?? ''] ?? []).map((option) => <option key={option.id} value={option.id}>{option.nombre}</option>)}</select> : field.kind === 'textarea' ? <textarea value={String(draft[field.key] ?? '')} rows={3} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))} /> : <input value={String(draft[field.key] ?? '')} required={field.required} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))} />}</>}</label>)}</div>{loadError && <div className="form-error">{loadError}</div>}<div className="form-actions"><button type="button" className="secondary-button" onClick={closeForm}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div></form></div>}
  </>
}

function columnLabel(value: string) {
  return value.replaceAll('_id', ' ID').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  const text = String(value)
  return text.length > 48 ? `${text.slice(0, 45)}…` : text
}

function ProfilePage({ profile, onProfileChange }: { profile: Profile; onProfileChange: (profile: Profile) => void }) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setSaving(true); setMessage('')
    const form = new FormData(event.currentTarget)
    const updates = { nombres: String(form.get('nombres')).trim(), apellido_paterno: String(form.get('apellido_paterno')).trim(), apellido_materno: String(form.get('apellido_materno')).trim() || null, telefono: String(form.get('telefono')).trim() || null, domicilio: String(form.get('domicilio')).trim() || null }
    const { data, error } = await supabase.from('perfiles').update(updates).eq('id', profile.id).select('id,nombres,apellido_paterno,apellido_materno,telefono,domicilio,activo,rol_id,roles(nombre,descripcion)').single()
    if (error) setMessage(error.message)
    else {
      const roles = Array.isArray(data.roles) ? data.roles[0] : data.roles
      onProfileChange({ ...data, email: profile.email, roles } as Profile)
      setMessage('Perfil guardado correctamente.')
    }
    setSaving(false)
  }
  return <>
    <div className="module-header profile-header"><div><div className="module-eyebrow"><span className="module-mark"><UserRound size={14} /></span>CUENTA ADMINISTRADORA</div><h1>Mi perfil</h1><p>Actualiza tus datos de contacto e información personal.</p></div></div>
    <form className="profile-layout" onSubmit={submit}><div className="panel profile-card"><div className="profile-hero"><div className="avatar avatar-large avatar-green">{initials(profile)}</div><div><strong>{fullName(profile)}</strong><span>{roleLabels[profile.roles?.nombre ?? 'administrador']}</span><small><BadgeCheck size={14} /> Cuenta activa</small></div><div className="profile-flower">✿</div></div><div className="profile-fields"><label>Nombre(s)<input name="nombres" defaultValue={profile.nombres} required maxLength={100} /></label><div className="two-fields"><label>Apellido paterno<input name="apellido_paterno" defaultValue={profile.apellido_paterno} required maxLength={100} /></label><label>Apellido materno<input name="apellido_materno" defaultValue={profile.apellido_materno ?? ''} maxLength={100} /></label></div><label>Correo electrónico<span className="readonly-field">{profile.email}</span></label><div className="two-fields"><label>Teléfono<input name="telefono" defaultValue={profile.telefono ?? ''} placeholder="+52 311 000 0000" maxLength={20} /></label><label>Domicilio<input name="domicilio" defaultValue={profile.domicilio ?? ''} placeholder="Calle, número, localidad" /></label></div></div><div className="profile-actions"><span>{message && <span className={message.includes('correctamente') ? 'success-text' : 'error-text'}>{message}</span>}</span><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button></div></div><aside className="profile-aside"><div className="panel role-card"><span className="eyebrow">PERMISOS DE CUENTA</span><div className="role-badge"><ShieldCheck size={18} /><span><strong>Administrador</strong><small>Acceso de supervisión</small></span></div><div className="role-divider" /><p>Tu perfil administra usuarios, catálogos, ciclos semanales, pedidos, cortes de caja y reportes de auditoría.</p><div className="role-detail"><Check size={14} /> Acceso activo</div></div><div className="profile-hint"><div><CircleHelp size={17} /></div><span><strong>¿Necesitas ayuda?</strong><small>Contacta al equipo de soporte de Rassa JALA.</small></span><ArrowDownLeft size={15} /></div></aside></form>
  </>
}

function initials(profile: Profile) { return `${profile.nombres?.[0] ?? 'R'}${profile.apellido_paterno?.[0] ?? 'J'}`.toUpperCase() }
function fullName(profile: Profile) { return `${profile.nombres} ${profile.apellido_paterno}`.trim() }
function activeTitle(section: AdminSection) { if (section === 'inicio') return 'Resumen'; if (section === 'perfil') return 'Mi perfil'; return moduleCopy[section].title }

export default App
