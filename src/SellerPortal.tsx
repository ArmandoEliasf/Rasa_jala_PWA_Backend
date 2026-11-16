import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowRight, BadgeCheck, ChevronDown, CircleHelp, Leaf, LogOut, Moon, Package, ShieldCheck, ShoppingBasket, Sun, UserRound } from 'lucide-react'
import { supabase } from './lib/supabase'
import type { Profile } from './types'

type Row = Record<string, unknown>
const NEXT: Record<string, string> = { pendiente: 'confirmado', confirmado: 'en_preparacion', en_preparacion: 'listo_para_retirar', listo_para_retirar: 'entregado' }

export function SellerPortal({ profile, dark, toggleTheme, onSignOut }: { profile: Profile; dark: boolean; toggleTheme: () => void; onSignOut: () => Promise<void> }) {
  const [orders, setOrders] = useState<Row[]>([])
  const [totals, setTotals] = useState<Record<string, number>>({})
  const [people, setPeople] = useState<Record<string, string>>({})
  const [states, setStates] = useState<Record<number, string>>({})
  const [details, setDetails] = useState<Row[]>([])
  const [history, setHistory] = useState<Row[]>([])
  const [selected, setSelected] = useState('')
  const [filter, setFilter] = useState('todos')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let live = true
    setLoading(true); setError('')
    void Promise.all([
      supabase.from('pedidos').select('*').eq('vendedor_id', profile.id).order('creado_en', { ascending: false }).limit(300),
      supabase.from('totales_pedido').select('pedido_id,total'),
      supabase.from('perfiles').select('id,nombres,apellido_paterno'),
      supabase.from('estados_pedido').select('id,nombre'),
    ]).then(([ordersResult, totalsResult, profilesResult, statesResult]) => {
      if (!live) return
      if (ordersResult.error) setError(ordersResult.error.message)
      else setOrders((ordersResult.data ?? []) as Row[])
      if (totalsResult.error) setError(totalsResult.error.message)
      setTotals(Object.fromEntries((totalsResult.data ?? []).map((item) => [item.pedido_id, Number(item.total)])))
      setPeople(Object.fromEntries((profilesResult.data ?? []).map((person) => [person.id, `${person.nombres} ${person.apellido_paterno}`.trim()])))
      setStates(Object.fromEntries((statesResult.data ?? []).map((state) => [state.id, state.nombre])))
      setLoading(false)
    })
    return () => { live = false }
  }, [profile.id, reload])

  useEffect(() => {
    if (!supabase || !selected) { setDetails([]); setHistory([]); return }
    let live = true
    void Promise.all([
      supabase.from('detalles_pedido').select('*').eq('pedido_id', selected).order('creado_en'),
      supabase.from('historial_pedido').select('*').eq('pedido_id', selected).order('creado_en', { ascending: false }),
    ]).then(([lineResult, historyResult]) => {
      if (!live) return
      if (lineResult.error) setError(lineResult.error.message)
      setDetails((lineResult.data ?? []) as Row[])
      if (historyResult.error) setError(historyResult.error.message)
      setHistory((historyResult.data ?? []) as Row[])
    })
    return () => { live = false }
  }, [selected, reload])

  const status = (order: Row) => states[Number(order.estado_id)] ?? 'desconocido'
  const filtered = useMemo(() => orders.filter((order) => {
    const state = status(order)
    const matchesFilter = filter === 'todos' || (filter === 'activos' ? !['entregado', 'cancelado'].includes(state) : state === filter)
    const matchesSearch = `${order.id} ${people[String(order.comprador_id)] ?? ''} ${state}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    return matchesFilter && matchesSearch
  }), [orders, states, people, filter, search])
  const counts = useMemo<{ total: number; active: number; ready: number }>(() => orders.reduce<{ total: number; active: number; ready: number }>((acc, order) => { const current = status(order); acc.total++; if (!['entregado', 'cancelado'].includes(current)) acc.active++; if (current === 'listo_para_retirar') acc.ready++; return acc }, { total: 0, active: 0, ready: 0 }), [orders, states])
  const order = orders.find((item) => item.id === selected)
  const stateName = order ? status(order) : ''
  const advance = async () => {
    if (!supabase || !order) return
    setSaving(true); setError(''); setMessage('')
    const next = NEXT[stateName]
    const { error: rpcError } = await supabase.rpc('vendedor_avanzar_pedido', { p_pedido_id: selected, p_nuevo_estado: next })
    if (rpcError) setError(`${rpcError.message}. Revisa que esté aplicada la migración sql/seller_workflows_supabase.sql.`)
    else { setMessage(`Pedido actualizado a ${label(next)}.`); setReload((value) => value + 1) }
    setSaving(false)
  }

  return <div className="app-shell">
    <aside className="sidebar"><div className="sidebar-top"><div className="brand-lockup"><div className="brand-mark"><Leaf size={21}/></div><div><strong>rassa</strong><span>JALA · ALIMENTACIÓN LOCAL</span></div></div></div>
      <div className="workspace-switch"><div className="workspace-icon"><Leaf size={16}/></div><div><strong>Rassa JALA</strong><span>Espacio de ventas</span></div><ChevronDown size={15} className="muted"/></div>
      <nav className="primary-nav"><div className="nav-group"><span className="nav-label">VENTAS</span><button className="nav-item selected"><ShoppingBasket size={17}/><span>Mis pedidos</span></button></div></nav>
      <div className="sidebar-bottom"><div className="offline-pill"><span className="online-indicator"/>Conectado<span className="offline-caption">· Supabase</span></div><div className="side-user"><div className="avatar avatar-green">{initials(profile)}</div><div className="side-user-text"><strong>{fullName(profile)}</strong><span>Vendedor</span></div><button className="icon-button side-logout" title="Cerrar sesión" onClick={() => void onSignOut()}><LogOut size={16}/></button></div></div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumbs"><span>Rassa JALA</span><ArrowRight size={13}/><strong>Mis pedidos</strong></div><div className="topbar-actions"><span className="top-date"><span className="today-dot"/> Operación activa</span><button className="icon-button" title={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} onClick={toggleTheme}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</button><button className="top-profile"><div className="avatar avatar-green">{initials(profile)}</div></button></div></header>
      <section className="page-content"><div className="module-header"><div><div className="module-eyebrow"><span className="module-mark"><ShoppingBasket size={14}/></span>OPERACIÓN COMERCIAL</div><h1>Mis pedidos</h1><p>Consulta tus pedidos asignados, revisa sus productos y actualiza su avance.</p></div><button className="secondary-button" onClick={() => setReload((value) => value + 1)} disabled={loading}><Activity size={15}/> Actualizar</button></div>
        {error && <div className="inline-notice"><CircleHelp size={16}/>{error}</div>}{message && <div className="form-success">{message}</div>}
        <div className="stats-grid"><div className="stat-card"><div className="stat-top"><span>Pedidos asignados</span><i className="stat-icon mint"><Package size={18}/></i></div><div className="stat-number">{loading ? '…' : counts.total}</div><div className="stat-foot"><span>En total</span></div></div><div className="stat-card"><div className="stat-top"><span>En proceso</span><i className="stat-icon peach"><Activity size={18}/></i></div><div className="stat-number">{loading ? '…' : counts.active}</div><div className="stat-foot"><span>Requieren seguimiento</span></div></div><div className="stat-card"><div className="stat-top"><span>Listos para retirar</span><i className="stat-icon lavender"><BadgeCheck size={18}/></i></div><div className="stat-number">{loading ? '…' : counts.ready}</div><div className="stat-foot"><span>Pendientes de entrega</span></div></div></div>
        <div className="panel data-preview"><div className="panel-heading"><div><h3>Pedidos asignados</h3><p>{loading ? 'Cargando…' : `${filtered.length} de ${orders.length} pedidos`}</p></div><div className="seller-order-filters"><select aria-label="Filtrar pedidos" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="todos">Todos los estados</option><option value="activos">Activos</option><option value="pendiente">Pendientes</option><option value="confirmado">Confirmados</option><option value="en_preparacion">En preparación</option><option value="listo_para_retirar">Listos para retirar</option><option value="entregado">Entregados</option></select><label className="table-search"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Comprador o pedido"/></label></div></div>
          {filtered.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Pedido</th><th>Comprador</th><th>Estado</th><th>Total</th><th>Fecha</th><th>Detalle</th></tr></thead><tbody>{filtered.map((item) => <tr key={String(item.id)}><td>{String(item.id).slice(0,8).toUpperCase()}</td><td>{people[String(item.comprador_id)] ?? '—'}</td><td>{label(status(item))}</td><td>{money(totals[String(item.id)] ?? 0)}</td><td>{date(item.creado_en)}</td><td><button className="secondary-button compact-button" onClick={() => { setSelected(String(item.id)); setError(''); setMessage('') }}>Ver pedido</button></td></tr>)}</tbody></table></div> : <div className="empty-table"><div className="empty-illustration"><Package size={26}/></div><strong>{loading ? 'Cargando pedidos…' : 'No hay pedidos para mostrar'}</strong><span>{search ? 'Prueba otro criterio de búsqueda.' : 'Cuando administración te asigne pedidos, aparecerán aquí.'}</span></div>}
        </div>
        {order && <section className="panel data-preview order-management"><div className="panel-heading"><div><h3>Pedido {String(order.id).slice(0,8).toUpperCase()}</h3><p>{people[String(order.comprador_id)] ?? 'Comprador'} · {label(stateName)} · {money(totals[selected] ?? 0)}</p></div><button className="secondary-button compact-button" onClick={() => setSelected('')}>Cerrar</button></div>
          <h4>Productos</h4><div className="table-scroll"><table className="data-table"><thead><tr><th>Producto</th><th>Cantidad</th><th>Unidad</th><th>Precio</th><th>Importe</th></tr></thead><tbody>{details.map((line) => <tr key={String(line.id)}><td>{String(line.nombre_producto_snapshot ?? 'Producto')}</td><td>{String(line.cantidad)}</td><td>{String(line.unidad_snapshot ?? '—')}</td><td>{money(Number(line.precio_unitario))}</td><td>{money(Number(line.precio_unitario) * Number(line.cantidad))}</td></tr>)}</tbody></table></div>
          <div className="seller-order-action">{NEXT[stateName] ? <button className="primary-button" disabled={saving} onClick={() => void advance()}>{saving ? 'Guardando…' : `Avanzar a ${label(NEXT[stateName])}`} <ArrowRight size={15}/></button> : <span className="muted">Este pedido ya está en un estado final.</span>}</div>
          <h4>Historial de estados</h4>{history.length ? <ul className="order-history">{history.map((entry) => <li key={String(entry.id)}><strong>{label(states[Number(entry.estado_nuevo_id)] ?? 'desconocido')}</strong><span>{String(entry.comentario ?? 'Actualización de pedido')}</span><small>{dateTime(entry.creado_en)} · {people[String(entry.cambiado_por)] ?? 'Sistema'}</small></li>)}</ul> : <p className="muted">Este pedido todavía no tiene historial.</p>}
        </section>}
      </section><footer className="page-footer"><span>© 2026 Rassa JALA</span><span><ShieldCheck size={13}/> Tus pedidos están protegidos por permisos de acceso</span><span><UserRound size={14}/> Vendedor</span></footer>
    </main>
  </div>
}

function label(value: string) { return value.replaceAll('_', ' ').replace(/^\w/, (letter) => letter.toLocaleUpperCase()) }
function money(value: number) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value) }
function date(value: unknown) { return value ? new Date(String(value)).toLocaleDateString('es-MX') : '—' }
function dateTime(value: unknown) { return value ? new Date(String(value)).toLocaleString('es-MX') : '—' }
function initials(profile: Profile) { return `${profile.nombres?.[0] ?? 'R'}${profile.apellido_paterno?.[0] ?? 'J'}`.toUpperCase() }
function fullName(profile: Profile) { return `${profile.nombres} ${profile.apellido_paterno}`.trim() }
