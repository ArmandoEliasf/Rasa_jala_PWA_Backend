import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Activity, ArrowRight, CalendarDays, CircleHelp, CreditCard, Download, Package, Plus, X } from 'lucide-react'
import { supabase } from './lib/supabase'

type Row = Record<string, any>
type Person = { id: string; label: string }
const money = (value: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value || 0)
const dateTime = (value: unknown) => value ? new Date(String(value)).toLocaleString('es-MX') : '—'
const dateText = (value: unknown) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX') : '—'
const title = (value: string) => value.replaceAll('_', ' ').replace(/^\w/, (c) => c.toLocaleUpperCase())

function ModuleHeader({ eyebrow, heading, description, onRefresh }: { eyebrow: string; heading: string; description: string; onRefresh: () => void }) {
  return <div className="module-header"><div><div className="module-eyebrow">{eyebrow}</div><h1>{heading}</h1><p>{description}</p></div><button className="secondary-button" onClick={onRefresh}><Activity size={15} /> Actualizar</button></div>
}
function Notice({ error, message }: { error: string; message: string }) {
  return <>{error && <div className="inline-notice"><CircleHelp size={16} />{error}</div>}{message && <div className="form-success">{message}</div>}</>
}
function Empty({ children = 'No hay registros para mostrar' }: { children?: ReactNode }) {
  return <div className="empty-table"><div className="empty-illustration"><Package size={26} /></div><strong>{children}</strong></div>
}
function useReload() {
  const [reload, setReload] = useState(0)
  return [reload, () => setReload((n) => n + 1)] as const
}

const roleLabels: Record<string, string> = {
  administrador: 'Administrador', vendedor: 'Vendedor', agricultor: 'Agricultor', comprador: 'Comprador',
}

export function UsersAdmin({ profileId }: { profileId: string }) {
  const [reload, refresh] = useReload()
  const [users, setUsers] = useState<Row[]>([])
  const [roles, setRoles] = useState<string[]>([])
  const [email, setEmail] = useState('')
  const [nombres, setNombres] = useState('')
  const [apellidoPaterno, setApellidoPaterno] = useState('')
  const [apellidoMaterno, setApellidoMaterno] = useState('')
  const [telefono, setTelefono] = useState('')
  const [rol, setRol] = useState('comprador')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let live = true
    setError('')
    void Promise.all([
      supabase.functions.invoke('admin-users', { body: { action: 'list' } }),
      supabase.from('roles').select('nombre').order('id'),
    ]).then(([result, roleResult]) => {
      if (!live) return
      if (result.error || result.data?.error) setError(result.data?.error ?? result.error?.message ?? 'No se pudieron cargar las cuentas')
      else setUsers((result.data?.users ?? []) as Row[])
      setRoles((roleResult.data ?? []).map((item) => item.nombre))
    })
    return () => { live = false }
  }, [reload])

  const invite = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    setSaving(true); setError(''); setMessage('')
    const { data, error: invokeError } = await supabase.functions.invoke('admin-users', {
      body: { action: 'invite', email, nombres, apellido_paterno: apellidoPaterno, apellido_materno: apellidoMaterno, telefono, rol },
    })
    if (invokeError || data?.error) setError(data?.error ?? invokeError?.message ?? 'No se pudo enviar la invitación')
    else {
      setMessage(data.message ?? 'Invitación enviada. La persona recibirá un enlace para crear su contraseña.')
      setEmail(''); setNombres(''); setApellidoPaterno(''); setApellidoMaterno(''); setTelefono('')
      refresh()
    }
    setSaving(false)
  }

  const update = async (user: Row, changes: { rol?: string; activo?: boolean }) => {
    if (!supabase || user.id === profileId) return
    const nextRole = changes.rol ?? user.rol
    const nextActive = changes.activo ?? user.activo
    const roleId = Number(user.rol_id)
    const selectedRole = roles.includes(nextRole) ? nextRole : 'comprador'
    const { data: roleRow, error: roleError } = await supabase.from('roles').select('id').eq('nombre', selectedRole).single()
    if (roleError || !roleRow) { setError(roleError?.message ?? 'No se encontró el rol'); return }
    setSaving(true); setError(''); setMessage('')
    const { error: rpcError } = await supabase.rpc('admin_actualizar_usuario', {
      p_usuario_id: user.id, p_rol_id: roleRow.id ?? roleId, p_activo: nextActive,
    })
    if (rpcError) setError(rpcError.message)
    else {
      if (changes.activo !== undefined) {
        const { data, error: authError } = await supabase.functions.invoke('admin-users', {
          body: { action: 'set-access', user_id: user.id, active: nextActive },
        })
        if (authError || data?.error) setError(`El perfil cambió, pero no se pudo actualizar el bloqueo de Supabase Auth: ${data?.error ?? authError?.message}`)
        else setMessage('Cuenta actualizada y acceso de autenticación sincronizado.')
      } else setMessage('Rol actualizado.')
      refresh()
    }
    setSaving(false)
  }

  const filtered = users.filter((user) => `${user.nombres} ${user.apellido_paterno} ${user.apellido_materno ?? ''} ${user.email} ${user.rol}`.toLowerCase().includes(search.trim().toLowerCase()))
  return <>
    <ModuleHeader eyebrow="ACCESO AL SISTEMA" heading="Usuarios y roles" description="Invita personas por correo y administra roles y acceso." onRefresh={refresh} />
    <Notice error={error} message={message} />
    <div className="panel data-preview"><div className="panel-heading"><div><h3>Invitar usuario</h3><p>La persona recibirá un enlace para definir su contraseña; nunca se captura aquí.</p></div></div>
      <form className="module-form" onSubmit={(event) => void invite(event)}>
        <label>Correo electrónico<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Rol inicial<select value={rol} onChange={(event) => setRol(event.target.value)}>{roles.map((item) => <option key={item} value={item}>{roleLabels[item] ?? item}</option>)}</select></label>
        <label>Nombre(s)<input required value={nombres} onChange={(event) => setNombres(event.target.value)} /></label>
        <label>Apellido paterno<input required value={apellidoPaterno} onChange={(event) => setApellidoPaterno(event.target.value)} /></label>
        <label>Apellido materno<input value={apellidoMaterno} onChange={(event) => setApellidoMaterno(event.target.value)} /></label>
        <label>Teléfono<input type="tel" value={telefono} onChange={(event) => setTelefono(event.target.value)} /></label>
        <button className="primary-button" disabled={saving}><Plus size={15} /> Enviar invitación</button>
      </form>
    </div>
    <div className="panel data-preview"><div className="panel-heading"><div><h3>Cuentas</h3><p>{filtered.length} de {users.length} perfiles</p></div><label className="table-search"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, correo o rol" /></label></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Acceso</th><th>Acciones</th></tr></thead><tbody>{filtered.map((user) => <tr key={user.id}><td>{`${user.nombres} ${user.apellido_paterno} ${user.apellido_materno ?? ''}`}</td><td>{user.email || '—'}</td><td><select aria-label={`Rol de ${user.email}`} value={user.rol} disabled={saving || user.id === profileId} onChange={(event) => void update(user, { rol: event.target.value })}>{roles.map((item) => <option key={item} value={item}>{roleLabels[item] ?? item}</option>)}</select></td><td>{user.activo ? 'Activo' : 'Desactivado'}</td><td><button className={`status-toggle ${user.activo ? 'is-active' : ''}`} disabled={saving || user.id === profileId} onClick={() => void update(user, { activo: !user.activo })}>{user.activo ? 'Desactivar' : 'Activar'}</button></td></tr>)}</tbody></table>{!filtered.length && <Empty>{search ? 'No hay coincidencias' : 'No hay perfiles para mostrar'}</Empty>}</div>
    </div>
  </>
}

export function PaymentsAdmin() {
  const [reload, refresh] = useReload()
  const [payments, setPayments] = useState<Row[]>([])
  const [receipts, setReceipts] = useState<Record<string, string>>({})
  const [orders, setOrders] = useState<Row[]>([])
  const [types, setTypes] = useState<Row[]>([])
  const [people, setPeople] = useState<Record<string, string>>({})
  const [totals, setTotals] = useState<Record<string, number>>({})
  const [states, setStates] = useState<Record<number, string>>({})
  const [cuts, setCuts] = useState<Row[]>([])
  const [orderId, setOrderId] = useState('')
  const [typeId, setTypeId] = useState('')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [actual, setActual] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState('')
  useEffect(() => {
    if (!supabase) return
    let live = true
    void Promise.all([
      supabase.from('pagos').select('*').order('creado_en', { ascending: false }).limit(300),
      supabase.from('recibos').select('pago_id,folio'),
      supabase.from('pedidos').select('id,comprador_id,estado_id,creado_en').order('creado_en', { ascending: false }).limit(300),
      supabase.from('tipos_pago').select('*').eq('activo', true).order('id'),
      supabase.from('perfiles').select('id,nombres,apellido_paterno'),
      supabase.from('totales_pedido').select('pedido_id,total'),
      supabase.from('cortes_caja').select('*').order('abierto_en', { ascending: false }).limit(100),
      supabase.from('estados_pedido').select('id,nombre'),
      supabase.auth.getUser(),
    ]).then(([p, receiptResult, o, t, peopleResult, totalResult, c, stateResult, auth]) => {
      if (!live) return
      if (p.error || o.error || t.error || c.error) setError((p.error || o.error || t.error || c.error)?.message ?? '')
      setPayments((p.data ?? []) as Row[]); setOrders((o.data ?? []) as Row[]); setTypes((t.data ?? []) as Row[]); setCuts((c.data ?? []) as Row[])
      setReceipts(Object.fromEntries((receiptResult.data ?? []).map((r) => [r.pago_id, r.folio])))
      setPeople(Object.fromEntries((peopleResult.data ?? []).map((x) => [x.id, `${x.nombres} ${x.apellido_paterno}`])))
      setTotals(Object.fromEntries((totalResult.data ?? []).map((x) => [x.pedido_id, Number(x.total)])))
      setStates(Object.fromEntries((stateResult.data ?? []).map((x) => [x.id, x.nombre])))
      setUserId(auth.data.user?.id ?? '')
      if (!typeId && t.data?.[0]) setTypeId(String(t.data[0].id))
    })
    return () => { live = false }
  }, [reload])
  const orderOptions: Row[] = orders.map((o: Row): Row => ({ ...o, paid: payments.filter((p) => p.pedido_id === o.id && p.estado === 'registrado').reduce((s, p) => s + Number(p.monto), 0) })).filter((o: Row) => (totals[o.id] ?? 0) > o.paid && states[Number(o.estado_id)] !== 'cancelado')
  const savePayment = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase || !orderId) return
    setSaving(true); setError(''); setMessage('')
    const { error: e } = await supabase.rpc('admin_registrar_pago', { p_pedido_id: orderId, p_tipo_pago_id: Number(typeId), p_monto: Number(amount), p_referencia: reference || null })
    if (e) setError(`${e.message}. Ejecuta sql/admin_operations_supabase.sql en Supabase.`)
    else { setMessage('Pago registrado y recibo generado.'); setAmount(''); setReference(''); refresh() }
    setSaving(false)
  }
  const openCut = async () => {
    if (!supabase) return; setSaving(true); setError(''); setMessage('')
    const { error: e } = await supabase.rpc('admin_abrir_corte_caja')
    if (e) setError(`${e.message}. Ejecuta sql/admin_operations_supabase.sql en Supabase.`)
    else { setMessage('Corte de caja abierto con el total de efectivo registrado hoy.'); refresh() }
    setSaving(false)
  }
  const closeCut = async (id: string) => {
    if (!supabase) return; setSaving(true); setError('')
    const { error: e } = await supabase.rpc('admin_cerrar_corte_caja', { p_corte_id: id, p_monto_real: Number(actual[id]) })
    if (e) setError(e.message); else { setMessage('Corte cerrado y diferencia calculada.'); refresh() }
    setSaving(false)
  }
  const saldo = (o: Row) => Math.max(0, (totals[o.id] ?? 0) - payments.filter((p) => p.pedido_id === o.id && p.estado === 'registrado').reduce((s, p) => s + Number(p.monto), 0))
  return <>
    <ModuleHeader eyebrow="CONTROL FINANCIERO" heading="Pagos y caja" description="Registra abonos con recibo y concilia el efectivo mediante cortes." onRefresh={refresh} />
    <Notice error={error} message={message} />
    <div className="panel data-preview"><div className="panel-heading"><div><h3>Registrar pago</h3><p>Los abonos se validan contra el saldo y generan folio de recibo.</p></div></div>
      <form className="module-form" onSubmit={(e) => void savePayment(e)}><label className="form-wide">Pedido con saldo<select required value={orderId} onChange={(e) => setOrderId(e.target.value)}><option value="">Selecciona un pedido</option>{orderOptions.map((o) => <option key={o.id} value={o.id}>{String(o.id).slice(0, 8).toUpperCase()} · {people[o.comprador_id] ?? 'Comprador'} · saldo {money(saldo(o))}</option>)}</select></label><label>Método de pago<select value={typeId} onChange={(e) => setTypeId(e.target.value)}>{types.map((t) => <option key={t.id} value={t.id}>{title(t.nombre)}</option>)}</select></label><label>Monto (MXN)<input type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></label><label className="form-wide">Referencia opcional<input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Folio de transferencia o nota" /></label><button className="primary-button" disabled={saving || !orderId}><Plus size={15} /> Registrar pago</button></form>
    </div>
    <div className="panel data-preview"><div className="panel-heading"><div><h3>Cortes de caja</h3><p>El corte teórico suma los pagos en efectivo que registraste hoy.</p></div><button className="primary-button" onClick={() => void openCut()} disabled={saving}><Plus size={15} /> Abrir corte</button></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Apertura</th><th>Responsable</th><th>Teórico</th><th>Real</th><th>Diferencia</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{cuts.map((c) => <tr key={c.id}><td>{dateTime(c.abierto_en)}</td><td>{people[c.abierto_por] ?? c.abierto_por}</td><td>{money(Number(c.monto_teorico))}</td><td>{c.monto_real == null ? '—' : money(Number(c.monto_real))}</td><td>{c.monto_real == null ? '—' : money(Number(c.monto_real) - Number(c.monto_teorico))}</td><td>{title(c.estado)}</td><td>{c.estado === 'abierto' && c.abierto_por === userId ? <div className="row-actions"><input className="table-number-input" type="number" min="0" step="0.01" aria-label="Monto real del corte" placeholder="Monto real" value={actual[c.id] ?? ''} onChange={(e) => setActual({ ...actual, [c.id]: e.target.value })} /><button className="status-toggle is-active" disabled={saving || actual[c.id] === undefined || actual[c.id] === ''} onClick={() => void closeCut(c.id)}>Cerrar</button></div> : '—'}</td></tr>)}</tbody></table></div>
    </div>
    <div className="panel data-preview"><div className="panel-heading"><div><h3>Pagos registrados</h3><p>{payments.length} movimientos recientes</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Fecha</th><th>Pedido</th><th>Comprador</th><th>Método</th><th>Monto</th><th>Recibo</th><th>Referencia</th><th>Estado</th></tr></thead><tbody>{payments.map((p) => <tr key={p.id}><td>{dateTime(p.creado_en)}</td><td>{String(p.pedido_id).slice(0, 8).toUpperCase()}</td><td>{people[orders.find((o) => o.id === p.pedido_id)?.comprador_id] ?? '—'}</td><td>{title(types.find((t) => t.id === p.tipo_pago_id)?.nombre ?? '—')}</td><td>{money(Number(p.monto))}</td><td>{receipts[p.id] ?? '—'}</td><td>{p.referencia ?? '—'}</td><td>{title(p.estado)}</td></tr>)}</tbody></table>{!payments.length && <Empty />}</div></div>
  </>
}

export function PickupsAdmin() {
  const [reload, refresh] = useReload(); const [rows, setRows] = useState<Row[]>([]); const [farmers, setFarmers] = useState<Person[]>([]); const [search, setSearch] = useState(''); const [farmer, setFarmer] = useState(''); const [date, setDate] = useState(''); const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [comment, setComment] = useState(''); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [saving, setSaving] = useState(false); const [people, setPeople] = useState<Record<string,string>>({})
  useEffect(() => { if (!supabase) return; let live = true; void Promise.all([supabase.from('recolecciones').select('*').order('fecha', { ascending: false }).limit(300),supabase.from('perfiles').select('id,nombres,apellido_paterno,rol_id'),supabase.from('roles').select('id').eq('nombre','agricultor').maybeSingle()]).then(([r,p,role]) => { if(!live)return; if(r.error)setError(r.error.message); setRows((r.data??[]) as Row[]); const profile=p.data??[]; const names=Object.fromEntries(profile.map(x=>[x.id,`${x.nombres} ${x.apellido_paterno}`])); setPeople(names); setFarmers(profile.filter(x=>x.rol_id===role.data?.id).map(x=>({id:x.id,label:names[x.id]}))) }); return()=>{live=false} },[reload])
  const create = async (event: FormEvent) => { event.preventDefault(); if(!supabase)return; setSaving(true);setError('');setMessage('');const {error:insertError}=await supabase.from('recolecciones').insert({agricultor_id:farmer,fecha:date,hora_inicio:start||null,hora_fin:end||null,comentarios:comment||null});if(insertError)setError(insertError.message);else{setMessage('Recolección programada.');setFarmer('');setDate('');setStart('');setEnd('');setComment('');refresh()}setSaving(false) }
  const change = async (r: Row, estado: string) => { if(!supabase)return; setSaving(true);const {error:e}=await supabase.from('recolecciones').update({estado}).eq('id',r.id);if(e)setError(e.message);else{setMessage(`Recolección ${title(estado).toLocaleLowerCase()}.`);refresh()}setSaving(false) }
  const filtered=rows.filter(r=>`${people[r.agricultor_id]??''} ${r.estado} ${r.fecha} ${r.comentarios??''}`.toLowerCase().includes(search.toLowerCase()))
  return <><ModuleHeader eyebrow="LOGÍSTICA" heading="Recolecciones" description="Programa visitas a agricultores y sigue su avance." onRefresh={refresh}/><Notice error={error} message={message}/><div className="panel data-preview"><div className="panel-heading"><div><h3>Programar recolección</h3><p>Define agricultor, fecha y ventana de visita.</p></div></div><form className="module-form" onSubmit={e=>void create(e)}><label>Agricultor<select required value={farmer} onChange={e=>setFarmer(e.target.value)}><option value="">Selecciona agricultor</option>{farmers.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label><label>Fecha<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label><label>Hora inicial<input type="time" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Hora final<input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></label><label className="form-wide">Notas<textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Dirección o indicaciones para la visita"/></label><button className="primary-button" disabled={saving}><CalendarDays size={15}/> Programar</button></form></div><div className="panel data-preview"><div className="panel-heading"><div><h3>Agenda</h3><p>{filtered.length} visitas</p></div><label className="table-search"><span>Buscar</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Agricultor o fecha"/></label></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Fecha</th><th>Horario</th><th>Agricultor</th><th>Notas</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td>{dateText(r.fecha)}</td><td>{r.hora_inicio?.slice(0,5)??'—'}{r.hora_fin?`–${r.hora_fin.slice(0,5)}`:''}</td><td>{people[r.agricultor_id]??'—'}</td><td>{r.comentarios??'—'}</td><td>{title(r.estado)}</td><td><div className="row-actions">{r.estado==='pendiente'&&<><button className="status-toggle" disabled={saving} onClick={()=>void change(r,'en_ruta')}>Iniciar ruta</button><button className="status-toggle" disabled={saving} onClick={()=>void change(r,'cancelada')}>Cancelar</button></>}{r.estado==='en_ruta'&&<button className="status-toggle is-active" disabled={saving} onClick={()=>void change(r,'recolectada')}>Marcar recolectada</button>}</div></td></tr>)}</tbody></table>{!filtered.length&&<Empty/>}</div></div></>
}

export function WasteAdmin() {
  const [reload, refresh] = useReload(); const [products, setProducts] = useState<Row[]>([]); const [decisions, setDecisions] = useState<Row[]>([]); const [rows, setRows] = useState<Row[]>([]); const [labels, setLabels] = useState<Record<string,string>>({}); const [productId, setProductId] = useState(''); const [decision, setDecision] = useState(''); const [quantity, setQuantity] = useState(''); const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [saving,setSaving]=useState(false)
  useEffect(()=>{if(!supabase)return;let live=true;void Promise.all([supabase.from('productos_publicados').select('*').eq('activo',true).order('creado_en',{ascending:false}).limit(500),supabase.from('decisiones_merma').select('*').order('id'),supabase.from('mermas').select('*').order('creado_en',{ascending:false}).limit(300),supabase.from('productos').select('id,nombre'),supabase.from('unidades').select('id,abreviatura')]).then(([p,d,m,pr,u])=>{if(!live)return;if(p.error||d.error||m.error)setError((p.error||d.error||m.error)?.message??'');const ps=p.data??[];setProducts(ps as Row[]);setDecisions((d.data??[]) as Row[]);setRows((m.data??[]) as Row[]);const prods=Object.fromEntries((pr.data??[]).map(x=>[x.id,x.nombre]));const units=Object.fromEntries((u.data??[]).map(x=>[x.id,x.abreviatura]));setLabels(Object.fromEntries(ps.map(x=>[x.id,`${prods[x.producto_id]??'Producto'} · ${units[x.unidad_id]??'unidad'} · stock ${x.stock_disponible}`])))});return()=>{live=false}},[reload])
  const submit=async(event:FormEvent)=>{event.preventDefault();if(!supabase)return;setSaving(true);setError('');setMessage('');const{error:rpcError}=await supabase.rpc('admin_registrar_merma',{p_producto_publicado_id:productId,p_decision_id:Number(decision),p_cantidad:Number(quantity),p_motivo:reason});if(rpcError)setError(`${rpcError.message}. Ejecuta sql/admin_operations_supabase.sql en Supabase.`);else{setMessage('Merma registrada y stock actualizado.');setQuantity('');setReason('');refresh()}setSaving(false)}
  return <><ModuleHeader eyebrow="CIERRE DE CICLO" heading="Mermas" description="Registra pérdidas o sobrantes y descuéntalos del stock disponible." onRefresh={refresh}/><Notice error={error} message={message}/><div className="panel data-preview"><div className="panel-heading"><div><h3>Registrar merma</h3><p>El stock se bloquea y actualiza en una operación atómica.</p></div></div><form className="module-form" onSubmit={e=>void submit(e)}><label className="form-wide">Producto publicado<select required value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Selecciona producto</option>{products.map(p=><option key={p.id} value={p.id}>{labels[p.id]}</option>)}</select></label><label>Decisión<select required value={decision} onChange={e=>setDecision(e.target.value)}><option value="">Selecciona decisión</option>{decisions.map(d=><option key={d.id} value={d.id}>{title(d.nombre)}</option>)}</select></label><label>Cantidad<input type="number" min="0.001" step="0.001" required value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label className="form-wide">Motivo<textarea required value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label><button className="primary-button" disabled={saving}><Plus size={15}/> Registrar merma</button></form></div><div className="panel data-preview"><div className="panel-heading"><div><h3>Registro de mermas</h3><p>{rows.length} movimientos recientes</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Fecha</th><th>Producto publicado</th><th>Cantidad</th><th>Decisión</th><th>Motivo</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{dateTime(r.creado_en)}</td><td>{labels[r.producto_publicado_id]??r.producto_publicado_id}</td><td>{r.cantidad}</td><td>{title(decisions.find(d=>d.id===r.decision_id)?.nombre??'—')}</td><td>{r.motivo}</td></tr>)}</tbody></table>{!rows.length&&<Empty/>}</div></div></>
}

export function SettlementsAdmin() {
  const [reload, refresh] = useReload()
  const [rows, setRows] = useState<Row[]>([])
  const [people, setPeople] = useState<Record<string, string>>({})
  const [paymentTypes, setPaymentTypes] = useState<Row[]>([])
  const [paymentDetails, setPaymentDetails] = useState<Record<string, Row>>({})
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [search, setSearch] = useState('')
  const [payingId, setPayingId] = useState('')
  const [paymentType, setPaymentType] = useState('')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let live = true
    void Promise.all([
      supabase.from('liquidaciones').select('*').order('periodo_inicio', { ascending: false }).limit(300),
      supabase.from('perfiles').select('id,nombres,apellido_paterno'),
      supabase.from('tipos_pago').select('*').eq('activo', true).order('id'),
      supabase.from('pagos_liquidacion').select('*').order('creado_en', { ascending: false }),
    ]).then(([settlements, profiles, types, payments]) => {
      if (!live) return
      if (settlements.error || types.error || payments.error) setError((settlements.error || types.error || payments.error)?.message ?? '')
      setRows((settlements.data ?? []) as Row[])
      setPeople(Object.fromEntries((profiles.data ?? []).map((person) => [person.id, `${person.nombres} ${person.apellido_paterno}`])))
      setPaymentTypes((types.data ?? []) as Row[])
      setPaymentDetails(Object.fromEntries((payments.data ?? []).map((payment) => [payment.liquidacion_id, payment])))
      if (!paymentType && types.data?.[0]) setPaymentType(String(types.data[0].id))
    })
    return () => { live = false }
  }, [reload])

  const generate = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return
    setSaving(true); setError(''); setMessage('')
    const { data, error: rpcError } = await supabase.rpc('admin_generar_liquidaciones', { p_inicio: start, p_fin: end })
    if (rpcError) setError(`${rpcError.message}. Ejecuta sql/admin_operations_supabase.sql en Supabase.`)
    else { setMessage(`${data} liquidación(es) generada(s) con ventas entregadas y comisión del 10%.`); refresh() }
    setSaving(false)
  }

  const pay = async (id: string) => {
    if (!supabase) return
    setSaving(true); setError(''); setMessage('')
    const { error: rpcError } = await supabase.rpc('admin_pagar_liquidacion', {
      p_liquidacion_id: id, p_tipo_pago_id: Number(paymentType), p_referencia: reference || null,
    })
    if (rpcError) setError(`${rpcError.message}. Ejecuta sql/admin_security_accounting.sql en Supabase.`)
    else { setMessage('Pago registrado con método y referencia.'); setPayingId(''); setReference(''); refresh() }
    setSaving(false)
  }

  const filtered = rows.filter((row) => (people[row.agricultor_id] ?? '').toLowerCase().includes(search.toLowerCase()))
  return <>
    <ModuleHeader eyebrow="PAGOS A PRODUCTORES" heading="Liquidaciones" description="Calcula liquidaciones y registra el pago al agricultor." onRefresh={refresh} />
    <Notice error={error} message={message} />
    <div className="panel data-preview"><div className="panel-heading"><div><h3>Calcular periodo</h3><p>Ventas entregadas; comisión vigente del 10%. Las líneas liquidadas no se repiten.</p></div></div>
      <form className="module-form" onSubmit={(event) => void generate(event)}><label>Desde<input type="date" required value={start} onChange={(event) => setStart(event.target.value)} /></label><label>Hasta<input type="date" required value={end} onChange={(event) => setEnd(event.target.value)} /></label><button className="primary-button" disabled={saving}><CreditCard size={15} /> Generar liquidaciones</button></form>
    </div>
    <div className="panel data-preview"><div className="panel-heading"><div><h3>Liquidaciones</h3><p>{filtered.length} registros</p></div><label className="table-search"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Agricultor" /></label></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Agricultor</th><th>Periodo</th><th>Ventas</th><th>Comisión</th><th>A liquidar</th><th>Estado</th><th>Pago</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td>{people[row.agricultor_id] ?? '—'}</td><td>{dateText(row.periodo_inicio)} – {dateText(row.periodo_fin)}</td><td>{money(Number(row.ventas))}</td><td>{money(Number(row.comision))}</td><td>{money(Number(row.monto_liquidar))}</td><td>{title(row.estado)}</td><td>{['pendiente', 'parcial'].includes(row.estado) ? payingId === row.id ? <div className="settlement-payment"><select aria-label="Método de pago" value={paymentType} onChange={(event) => setPaymentType(event.target.value)}>{paymentTypes.map((type) => <option key={type.id} value={type.id}>{title(type.nombre)}</option>)}</select><input aria-label="Referencia de pago" placeholder="Referencia" value={reference} onChange={(event) => setReference(event.target.value)} /><button className="status-toggle is-active" disabled={saving} onClick={() => void pay(row.id)}>Confirmar</button><button className="status-toggle" onClick={() => setPayingId('')}>Cancelar</button></div> : <button className="status-toggle is-active" disabled={saving || !paymentTypes.length} onClick={() => setPayingId(row.id)}>Registrar pago</button> : paymentDetails[row.id] ? `${title(paymentTypes.find((type) => type.id === paymentDetails[row.id].tipo_pago_id)?.nombre ?? 'pago')} · ${money(Number(paymentDetails[row.id].monto))}` : '—'}</td></tr>)}</tbody></table>{!filtered.length && <Empty />}</div>
    </div>
  </>
}

export function AuditAdmin() {
  const [reload,refresh]=useReload();const[rows,setRows]=useState<Row[]>([]);const[people,setPeople]=useState<Record<string,string>>({});const[search,setSearch]=useState('');const[error,setError]=useState('')
  useEffect(()=>{if(!supabase)return;let live=true;void Promise.all([supabase.from('registros_auditoria').select('*').order('creado_en',{ascending:false}).limit(500),supabase.from('perfiles').select('id,nombres,apellido_paterno')]).then(([r,p])=>{if(!live)return;if(r.error)setError(r.error.message);setRows((r.data??[]) as Row[]);setPeople(Object.fromEntries((p.data??[]).map(x=>[x.id,`${x.nombres} ${x.apellido_paterno}`]))) });return()=>{live=false}},[reload])
  const filtered=rows.filter(r=>`${people[r.usuario_id]??''} ${r.accion} ${r.tabla} ${JSON.stringify(r.detalles)}`.toLowerCase().includes(search.toLowerCase()))
  const csv=()=>{const content=['fecha,usuario,accion,tabla,registro,detalles',...filtered.map(r=>[r.creado_en,people[r.usuario_id]??r.usuario_id,r.accion,r.tabla,r.registro_id,JSON.stringify(r.detalles)].map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(','))].join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+content],{type:'text/csv;charset=utf-8'}));a.download=`rassa-auditoria-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href)}
  return <><ModuleHeader eyebrow="TRAZABILIDAD" heading="Auditoría y reportes" description="Consulta los eventos administrativos y exporta el registro para análisis." onRefresh={refresh}/><Notice error={error} message=""/><div className="panel data-preview"><div className="panel-heading"><div><h3>Eventos recientes</h3><p>{filtered.length} de {rows.length} eventos (máximo 500)</p></div><div className="module-toolbar"><label className="table-search"><span>Buscar</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Usuario, acción o tabla"/></label><button className="secondary-button" onClick={csv}><Download size={15}/> Exportar CSV</button></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Tabla</th><th>Registro</th><th>Detalles</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td>{dateTime(r.creado_en)}</td><td>{people[r.usuario_id]??'Sistema'}</td><td>{title(r.accion)}</td><td>{r.tabla}</td><td>{r.registro_id?String(r.registro_id).slice(0,8):'—'}</td><td><code>{JSON.stringify(r.detalles)}</code></td></tr>)}</tbody></table>{!filtered.length&&<Empty/>}</div></div></>
}

export function ChatAdmin() {
  const [reload,refresh]=useReload();const[conversations,setConversations]=useState<Row[]>([]);const[profiles,setProfiles]=useState<Person[]>([]);const[names,setNames]=useState<Record<string,string>>({});const[participants,setParticipants]=useState<Record<string,string[]>>({});const[selected,setSelected]=useState('');const[messages,setMessages]=useState<Row[]>([]);const[attachments,setAttachments]=useState<Record<string,string[]>>({});const[text,setText]=useState('');const[file,setFile]=useState<File|null>(null);const[newName,setNewName]=useState('');const[newType,setNewType]=useState('privada');const[selectedUsers,setSelectedUsers]=useState<string[]>([]);const[error,setError]=useState('');const[message,setMessage]=useState('');const[saving,setSaving]=useState(false);const[myId,setMyId]=useState('')
  useEffect(()=>{if(!supabase)return;const client=supabase;let live=true;void Promise.all([client.from('conversaciones').select('*').order('creada_en',{ascending:false}).limit(300),client.from('perfiles').select('id,nombres,apellido_paterno'),client.auth.getUser()]).then(async([c,p,a])=>{if(!live)return;if(c.error)setError(c.error.message);const conv=c.data??[];setConversations(conv as Row[]);const profilesData=p.data??[];const profileNames=Object.fromEntries(profilesData.map(x=>[x.id,`${x.nombres} ${x.apellido_paterno}`]));setNames(profileNames);setProfiles(profilesData.filter(x=>x.id!==a.data.user?.id).map(x=>({id:x.id,label:profileNames[x.id]})));setMyId(a.data.user?.id??'');if(conv.length){const{data:i}=await client.from('integrantes_conversacion').select('conversacion_id,usuario_id').in('conversacion_id',conv.map(x=>x.id));if(!live)return;const grouped:Record<string,string[]>={};(i??[]).forEach(x=>(grouped[x.conversacion_id]??=[]).push(x.usuario_id));setParticipants(grouped)}});return()=>{live=false}},[reload])
  useEffect(()=>{if(!supabase||!selected)return;const client=supabase;let live=true;void (async()=>{const{error:joinError}=await client.from('integrantes_conversacion').upsert({conversacion_id:selected,usuario_id:myId},{onConflict:'conversacion_id,usuario_id',ignoreDuplicates:true});if(joinError){setError(joinError.message);return}const{data,error:e}=await client.from('mensajes').select('*').eq('conversacion_id',selected).order('creado_en',{ascending:true}).limit(300);if(!live)return;if(e){setError(e.message);return}const msgs=(data??[]) as Row[];setMessages(msgs);const{data:files}=await client.from('adjuntos_mensaje').select('*').in('mensaje_id',msgs.map(m=>m.id));if(!live)return;const urls:Record<string,string[]>={};for(const a of files??[]){const{data:signed}=await client.storage.from('chat-images').createSignedUrl(a.ruta_storage,3600);if(signed?.signedUrl)(urls[a.mensaje_id]??=[]).push(signed.signedUrl)}setAttachments(urls)})();return()=>{live=false}},[selected,myId,reload])
  const create=async(event:FormEvent)=>{event.preventDefault();if(!supabase||!selectedUsers.length)return;if(newType==='privada'&&selectedUsers.length!==1){setError('Una conversación privada debe tener un solo participante.');return}setSaving(true);setError('');setMessage('');const{data:c,error:createError}=await supabase.from('conversaciones').insert({nombre:newName||null,tipo:newType,creada_por:myId}).select('id').single();if(createError||!c){setError(createError?.message??'No se pudo crear el chat');setSaving(false);return}const ids=[myId,...selectedUsers];const{error:memberError}=await supabase.from('integrantes_conversacion').insert(ids.map(usuario_id=>({conversacion_id:c.id,usuario_id})));if(memberError){await supabase.from('conversaciones').delete().eq('id',c.id);setError(memberError.message);setSaving(false);return}setNewName('');setSelectedUsers([]);setMessage('Conversación creada.');setSelected(c.id);refresh();setSaving(false)}
  const send=async(event:FormEvent)=>{event.preventDefault();if(!supabase||!selected||(!text.trim()&&!file))return;setSaving(true);setError('');let path='';if(file){if(file.size>10485760){setError('La imagen no puede superar 10 MiB.');setSaving(false);return}const ext=file.name.split('.').pop()?.toLowerCase()||'img';path=`${myId}/${selected}/${crypto.randomUUID()}.${ext}`;const{error:uploadError}=await supabase.storage.from('chat-images').upload(path,file,{contentType:file.type,upsert:false});if(uploadError){setError(uploadError.message);setSaving(false);return}}const{data:m,error:insertError}=await supabase.from('mensajes').insert({conversacion_id:selected,emisor_id:myId,contenido:text.trim()||null}).select('id').single();if(insertError||!m){if(path)await supabase.storage.from('chat-images').remove([path]);setError(insertError?.message??'No se pudo guardar el mensaje');setSaving(false);return}if(path&&file){const{error:attachmentError}=await supabase.from('adjuntos_mensaje').insert({mensaje_id:m.id,subido_por:myId,ruta_storage:path,nombre_archivo:file.name,mime_type:file.type,bytes:file.size});if(attachmentError){await supabase.storage.from('chat-images').remove([path]);await supabase.from('mensajes').delete().eq('id',m.id);setError(attachmentError.message);setSaving(false);return}}setText('');setFile(null);await refresh();setSaving(false)}
  return <><ModuleHeader eyebrow="COMUNICACIÓN INTERNA" heading="Conversaciones" description="Consulta chats autorizados y envía mensajes o imágenes como administrador." onRefresh={refresh}/><Notice error={error} message={message}/><div className="admin-chat-layout"><aside className="panel data-preview admin-chat-list"><h3>Nueva conversación</h3><form className="module-form" onSubmit={e=>void create(e)}><label className="form-wide">Nombre opcional<input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Soporte / Familia"/></label><label>Tipo<select value={newType} onChange={e=>setNewType(e.target.value)}><option value="privada">Privada</option><option value="grupal">Grupal</option></select></label><label className="form-wide">Participantes<select multiple value={selectedUsers} onChange={e=>setSelectedUsers(Array.from(e.target.selectedOptions,o=>o.value))}>{profiles.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label><button className="secondary-button" disabled={saving||!selectedUsers.length}><Plus size={14}/> Crear chat</button></form><hr/>{conversations.map(c=><button className={`admin-chat-item ${selected===c.id?'is-selected':''}`} key={c.id} onClick={()=>{setSelected(c.id);setError('')}}><strong>{c.nombre??((participants[c.id]??[]).map(id=>names[id]).filter(Boolean).join(', ')||'Chat privado')}</strong><small>{title(c.tipo)} · {(participants[c.id]??[]).length} integrantes</small></button>)}</aside><section className="panel data-preview admin-chat-window"><h3>{conversations.find(c=>c.id===selected)?.nombre??'Selecciona una conversación'}</h3><div className="admin-chat-messages">{messages.map(m=><article className={`admin-chat-message ${m.emisor_id===myId?'mine':''}`} key={m.id}><strong>{names[m.emisor_id]??'Usuario'}</strong>{m.contenido&&<p>{m.contenido}</p>}{(attachments[m.id]??[]).map(src=><img key={src} src={src} alt="Imagen adjunta al chat"/>)}<small>{dateTime(m.creado_en)}</small></article>)}{selected&&!messages.length&&<Empty>No hay mensajes en esta conversación</Empty>}</div>{selected&&<form className="admin-chat-compose" onSubmit={e=>void send(e)}><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Escribe un mensaje…" maxLength={10000}/><label className="secondary-button file-button"><Package size={15}/> Imagen<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e=>setFile(e.target.files?.[0]??null)}/></label>{file&&<span>{file.name} <button type="button" aria-label="Quitar imagen" onClick={()=>setFile(null)}><X size={14}/></button></span>}<button className="primary-button" disabled={saving||(!text.trim()&&!file)}><ArrowRight size={15}/> Enviar</button></form>}</section></div></>
}
