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

const roleLabels: Record<RoleName, string> = {
  administrador: 'Administrador', vendedor: 'Vendedor', agricultor: 'Agricultor', comprador: 'Comprador',
}

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
  const [recoveryMode, setRecoveryMode] = useState(false)
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
      if (data.session?.user) {
        try { await loadProfile(data.session.user.id, data.session.user.email ?? '') } catch (error) {
          await client.auth.signOut()
          setAuthError(error instanceof Error ? error.message : 'No se pudo cargar el perfil.')
        }
      }
      setChecking(false)
    })
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      if (!session) setProfile(null)
    })
    return () => subscription.unsubscribe()
  }, [loadProfile])

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
  }

  const signOut = async () => {
    await supabase?.auth.signOut()
    setProfile(null)
    setActive('inicio')
  }

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
    const selection = section === 'usuarios' ? '*,roles(nombre)' : '*'
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
  const columns = rows[0] ? Object.keys(rows[0]).filter((key) => key !== 'id' && key !== 'roles').slice(0, 5) : []
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

  return <>
    <div className="module-header"><div><div className="module-eyebrow"><span className="module-mark"><Icon size={14} /></span>{meta.eyebrow}</div><h1>{meta.title}</h1><p>{meta.description}</p></div><div className="module-toolbar"><button className="secondary-button" onClick={() => setRefreshKey((value) => value + 1)}><Activity size={15} /> Actualizar</button><button className="primary-button module-action" onClick={exportCsv} disabled={!filteredRows.length}><Download size={15} /> Exportar CSV</button></div></div>
    {loadError && <div className="inline-notice"><CircleHelp size={16} />{loadError}</div>}
    {message && <div className="form-success">{message}</div>}
    <div className="module-summary-grid"><div className="panel module-count"><div className="stat-top"><span>Registros actuales</span><span className="stat-icon mint"><Icon size={18} /></span></div><strong>{loading ? '…' : count ?? '—'}</strong><small>Actualizado desde Supabase</small></div><div className="panel module-description"><span className="eyebrow">FUNCIONES DEL MÓDULO</span><ul>{meta.bullets.map((bullet) => <li key={bullet}><span><Check size={12} /></span>{bullet}</li>)}</ul></div></div>
    <div className="panel data-preview"><div className="panel-heading"><div><h3>Registros</h3><p>Hasta 100 registros de <code>{meta.table}</code>.</p></div><label className="table-search"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en los registros" /></label></div>{filteredRows.length > 0 ? <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column}>{columnLabel(column)}</th>)}{['usuarios','publicaciones','recolecciones','liquidaciones'].includes(section) && <th>Acciones</th>}</tr></thead><tbody>{filteredRows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map((column) => <td key={column}>{column === 'rol_id' && section === 'usuarios' ? displayValue((row.roles as { nombre?: string } | null)?.nombre ?? row[column]) : displayValue(row[column])}</td>)}{['usuarios','publicaciones','recolecciones','liquidaciones'].includes(section) && <td>{renderRowAction(row)}</td>}</tr>)}</tbody></table></div> : <div className="empty-table"><div className="empty-illustration"><Package size={26} /></div><strong>{loading ? 'Cargando datos…' : search ? 'Sin coincidencias' : 'No hay registros para mostrar'}</strong><span>{loading ? 'Consultando Supabase.' : search ? 'Cambia el texto de búsqueda.' : 'Cuando se agreguen datos a este módulo, aparecerán aquí.'}</span></div>}</div>
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
