import { useState, useMemo, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  upsertIngreso, deleteIngreso as deleteIngresoDB,
  insertCobro, deleteCobro as deleteCobro_DB,
  upsertInvoiceIngreso, deleteInvoiceIngreso as deleteInvoiceIngresoDB,
  upsertCategoriaIngreso, deleteCategoriaIngreso as deleteCategoriaIngresoDB,
} from "./db.js";

/* ── Palette (same as CxpApp) ──────────────────────────────────────────── */
const C = {
  navy:"#0F2D4A", blue:"#1565C0", sky:"#2196F3", teal:"#00897B",
  cream:"#FAFBFC", surface:"#FFFFFF", border:"#E2E8F0", muted:"#64748B",
  text:"#1A2332", danger:"#E53935", warn:"#F59E0B", ok:"#43A047",
  mxn:"#1565C0", usd:"#2E7D32", eur:"#6A1B9A",
  green:"#1B5E20",
};

/* ── Styles ────────────────────────────────────────────────────────────── */
const inputStyle = { padding:"8px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:14, outline:"none", background:"#FAFBFC", width:"100%", fontFamily:"inherit", color:"#1A2332", boxSizing:"border-box" };
const selectStyle = { ...inputStyle, cursor:"pointer" };
const btnStyle = { padding:"9px 20px", borderRadius:10, border:"none", background:"#1565C0", color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" };
const iconBtn = { background:"none", border:"none", cursor:"pointer", fontSize:16, padding:"4px 6px" };

/* ── Helpers ───────────────────────────────────────────────────────────── */
const fmt = n => isNaN(n)||n===""||n===null ? "—" : new Intl.NumberFormat("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2}).format(+n);
const today = () => new Date().toISOString().split("T")[0];
const uid = () => Math.random().toString(36).slice(2,10);

const DEFAULT_CATS = ["Circuito","Reprotección","Excursión","Venta Individual","Otro"];
const CAT_COLORS = {
  "Circuito": { bg:"#E3F2FD", border:"#90CAF9", text:"#1565C0" },
  "Reprotección": { bg:"#FFEBEE", border:"#EF9A9A", text:"#C62828" },
  "Excursión": { bg:"#E8F5E9", border:"#A5D6A7", text:"#2E7D32" },
  "Venta Individual": { bg:"#FFF8E1", border:"#FFE082", text:"#F57F17" },
  "Otro": { bg:"#F3F4F6", border:"#D1D5DB", text:"#374151" },
};
const getCatStyle = (cat) => CAT_COLORS[cat] || { bg:"#F3F4F6", border:"#D1D5DB", text:"#374151" };
const monedaSym = (m) => m === "EUR" ? "€" : "$";

/* ── Reusable small components ──────────────────────────────────────────── */
const Field = ({label, children}) => (
  <div style={{marginBottom:16}}>
    <label style={{display:"block",fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.4,marginBottom:6}}>{label}</label>
    {children}
  </div>
);

const ModalShell = ({title,onClose,wide,extraWide,children}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(15,45,74,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:20}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.surface,borderRadius:20,padding:32,width:"100%",maxWidth:extraWide?1200:wide?860:600,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.25)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <h2 style={{fontSize:20,fontWeight:800,color:C.navy,margin:0}}>{title}</h2>
        <button onClick={onClose} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:36,height:36,cursor:"pointer",fontSize:18}}>×</button>
      </div>
      {children}
    </div>
  </div>
);

const KpiCard = ({label,value,sub,color=C.navy,icon,bg}) => (
  <div style={{background:bg||C.surface,borderRadius:16,padding:"18px 22px",border:`1px solid ${C.border}`,boxShadow:"0 2px 8px rgba(0,0,0,.05)",flex:1,minWidth:150}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div>
        <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>{label}</div>
        <div style={{fontSize:22,fontWeight:800,color,marginTop:4}}>{value}</div>
        {sub && <div style={{fontSize:11,color:C.muted,marginTop:2}}>{sub}</div>}
      </div>
      <div style={{fontSize:26}}>{icon}</div>
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════════════════════════
   MAIN CxC VIEW COMPONENT
   ══════════════════════════════════════════════════════════════════════════ */
export default function CxcView({
  invoices, payments,
  ingresos, setIngresos,
  cobros, setCobros,
  invoiceIngresos, setInvoiceIngresos,
  categorias, setCategorias,
}) {
  /* ── Filters ───────────────────────────────────────────────── */
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroMoneda, setFiltroMoneda] = useState("");
  const [filtroFechaFrom, setFiltroFechaFrom] = useState("");
  const [filtroFechaTo, setFiltroFechaTo] = useState("");
  const [filtroSearch, setFiltroSearch] = useState("");
  const [filtroCobro, setFiltroCobro] = useState(""); // "" | "cobrado" | "porCobrar"

  /* ── Modals ────────────────────────────────────────────────── */
  const [modalIngreso, setModalIngreso] = useState(null);
  const [detailIngreso, setDetailIngreso] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [configCats, setConfigCats] = useState(false);
  const [newCatInput, setNewCatInput] = useState("");
  const [proyeccionView, setProyeccionView] = useState(false);
  const [calDayDetail, setCalDayDetail] = useState(null);
  const [kpiModal, setKpiModal] = useState(null); // { titulo, tipo, moneda }

  /* ── Derived data ──────────────────────────────────────────── */
  const allInvoices = useMemo(() => [
    ...invoices.MXN.map(i=>({...i,moneda:"MXN"})),
    ...invoices.USD.map(i=>({...i,moneda:"USD"})),
    ...invoices.EUR.map(i=>({...i,moneda:"EUR"})),
  ], [invoices]);

  const catList = categorias.length > 0 ? categorias.map(c=>c.nombre) : DEFAULT_CATS;
  const clientesList = [...new Set(ingresos.map(i=>i.cliente))].filter(Boolean).sort();

  /* TC conversion: everything to ingreso's currency
     TC in ingresos = "cuántos MXN vale 1 USD/EUR"
     e.g. ingreso USD at TC=20.5 → 1 USD = 20.5 MXN
  */
  const convertToMonedaIngreso = (monto, monedaFactura, ingreso) => {
    if (!monto || monto === 0) return 0;
    const mi = ingreso.moneda;
    const mf = monedaFactura;
    const tc = ingreso.tipoCambio || 1;
    if (mi === mf) return monto;
    // To MXN from foreign: monto * tc
    if (mi === "MXN" && (mf === "USD" || mf === "EUR")) return monto * tc;
    // To foreign from MXN: monto / tc
    if ((mi === "USD" || mi === "EUR") && mf === "MXN") return monto / tc;
    // USD <-> EUR: use tc as best approximation
    return monto;
  };

  /* Per-ingreso computed metrics */
  const metrics = useMemo(() => {
    const result = {};
    ingresos.forEach(ing => {
      const ingCobros         = cobros.filter(c => c.ingresoId === ing.id);
      const cobrosRealizados  = ingCobros.filter(c => c.tipo !== 'proyectado');
      const cobrosProyectados = ingCobros.filter(c => c.tipo === 'proyectado');
      const totalCobrado      = cobrosRealizados.reduce((s,c) => s+c.monto, 0);
      const totalProyectado   = cobrosProyectados.reduce((s,c) => s+c.monto, 0);
      const porCobrar         = Math.max(0, ing.monto - totalCobrado);

      const vincs = invoiceIngresos.filter(v => v.ingresoId === ing.id);
      let consumido = 0;
      let porPagar  = 0;
      let comprometido = 0;

      vincs.forEach(v => {
        const inv = allInvoices.find(i => i.id === v.invoiceId);
        if (!inv) return;
        const converted = convertToMonedaIngreso(v.montoAsignado, inv.moneda, ing);
        comprometido += converted;
        if (inv.estatus === "Pagado") {
          consumido += converted;
        } else if (inv.estatus === "Parcial") {
          const ratio = (+inv.total||0) > 0 ? (+inv.montoPagado||0)/(+inv.total||0) : 0;
          consumido += converted * ratio;
          porPagar  += converted * (1 - ratio);
        } else {
          porPagar += converted;
        }
      });

      const disponible = totalCobrado - consumido;
      result[ing.id] = {
        totalCobrado,
        totalProyectado,
        porCobrar,
        consumido,
        porPagar,
        comprometido,
        disponible,
        disponibleNeto: disponible - porPagar,
        vinculaciones: vincs.length,
      };
    });
    return result;
  }, [ingresos, cobros, invoiceIngresos, allInvoices]);

  /* KPIs globales */
  const kpis = useMemo(() => {
    const byMon = {
      MXN:{monto:0,cobrado:0,porCobrar:0,consumido:0,porPagar:0,disponible:0,disponibleNeto:0},
      USD:{monto:0,cobrado:0,porCobrar:0,consumido:0,porPagar:0,disponible:0,disponibleNeto:0},
      EUR:{monto:0,cobrado:0,porCobrar:0,consumido:0,porPagar:0,disponible:0,disponibleNeto:0},
    };
    ingresos.forEach(ing => {
      const m = metrics[ing.id] || {};
      const k = byMon[ing.moneda] || byMon.MXN;
      k.monto         += ing.monto;
      k.cobrado       += m.totalCobrado||0;
      k.porCobrar     += m.porCobrar||0;
      k.consumido     += m.consumido||0;
      k.porPagar      += m.porPagar||0;
      k.disponible    += m.disponible||0;
      k.disponibleNeto+= m.disponibleNeto||0;
    });
    return byMon;
  }, [ingresos, metrics]);

  /* Filtered ingresos */
  const filtered = useMemo(() => {
    return ingresos.filter(ing => {
      if (filtroSearch) {
        const q = filtroSearch.toLowerCase();
        if (!(ing.cliente+ing.concepto+ing.categoria).toLowerCase().includes(q)) return false;
      }
      if (filtroCliente && ing.cliente !== filtroCliente) return false;
      if (filtroCategoria && ing.categoria !== filtroCategoria) return false;
      if (filtroMoneda && ing.moneda !== filtroMoneda) return false;
      if (filtroFechaFrom && ing.fecha && ing.fecha < filtroFechaFrom) return false;
      if (filtroFechaTo && ing.fecha && ing.fecha > filtroFechaTo) return false;
      if (filtroCobro === "cobrado") {
        const m = metrics[ing.id] || {};
        if ((m.totalCobrado||0) <= 0) return false;
      }
      if (filtroCobro === "porCobrar") {
        const m = metrics[ing.id] || {};
        if ((m.porCobrar||0) <= 0) return false;
      }
      return true;
    });
  }, [ingresos, filtroSearch, filtroCliente, filtroCategoria, filtroMoneda, filtroFechaFrom, filtroFechaTo, filtroCobro, metrics]);

  /* ── CRUD Handlers ─────────────────────────────────────────── */
  const saveIngreso = async (data) => {
    const saved = await upsertIngreso(data);
    setIngresos(prev => {
      const exists = prev.find(i => i.id === saved.id);
      if (exists) return prev.map(i => i.id === saved.id ? saved : i);
      return [saved, ...prev];
    });
    setModalIngreso(null);
  };

  const handleDeleteIngreso = async () => {
    if (!deleteConfirm) return;
    await deleteIngresoDB(deleteConfirm.id);
    setIngresos(prev => prev.filter(i => i.id !== deleteConfirm.id));
    setInvoiceIngresos(prev => prev.filter(v => v.ingresoId !== deleteConfirm.id));
    setCobros(prev => prev.filter(c => c.ingresoId !== deleteConfirm.id));
    setDeleteConfirm(null);
    if (detailIngreso === deleteConfirm.id) setDetailIngreso(null);
  };

  const addCobro = async (ingresoId, monto, fechaCobro, notas, tipo = 'realizado') => {
    const saved = await insertCobro({ ingresoId, monto:+monto, fechaCobro, notas, tipo });
    setCobros(prev => [saved, ...prev]);
  };

  const removeCobro = async (id) => {
    await deleteCobro_DB(id);
    setCobros(prev => prev.filter(c => c.id !== id));
  };

  const addCategoria = async () => {
    const nombre = newCatInput.trim();
    if (!nombre || catList.includes(nombre)) return;
    const saved = await upsertCategoriaIngreso(nombre);
    if (saved) setCategorias(prev => [...prev, saved]);
    else setCategorias(prev => [...prev, { id: uid(), nombre }]);
    setNewCatInput("");
  };

  const removeCategoria = async (cat) => {
    const found = categorias.find(c => c.nombre === cat);
    if (found) await deleteCategoriaIngresoDB(found.id);
    setCategorias(prev => prev.filter(c => c.nombre !== cat));
  };

  /* ── Ingreso Form Modal ─────────────────────────────────────── */
  const IngresoModal = () => {
    const [form, setForm] = useState({
      id: modalIngreso.id || "",
      cliente: modalIngreso.cliente || "",
      concepto: modalIngreso.concepto || "",
      categoria: modalIngreso.categoria || catList[0] || "Circuito",
      monto: modalIngreso.monto || "",
      moneda: modalIngreso.moneda || "MXN",
      tipoCambio: modalIngreso.tipoCambio || 1,
      fecha: modalIngreso.fecha || today(),
      notas: modalIngreso.notas || "",
    });
    const set = (k,v) => setForm(f=>({...f,[k]:v}));
    const needsTC = form.moneda !== "MXN";

    return (
      <ModalShell title={form.id ? "Editar Ingreso" : "Nuevo Ingreso"} onClose={()=>setModalIngreso(null)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <Field label="Cliente *">
            <input list="cxc-clientes" value={form.cliente} onChange={e=>set("cliente",e.target.value)} placeholder="Nombre del cliente…" style={inputStyle}/>
            <datalist id="cxc-clientes">{clientesList.map(c=><option key={c} value={c}/>)}</datalist>
          </Field>
          <Field label="Categoría">
            <select value={form.categoria} onChange={e=>set("categoria",e.target.value)} style={selectStyle}>
              {catList.map(c=><option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Concepto / Servicio">
            <input value={form.concepto} onChange={e=>set("concepto",e.target.value)} placeholder="Ej: Circuito Europa 2026…" style={inputStyle}/>
          </Field>
          <Field label="Fecha">
            <input type="date" value={form.fecha} onChange={e=>set("fecha",e.target.value)} style={inputStyle}/>
          </Field>
          <Field label="Monto Total *">
            <input type="number" value={form.monto} onChange={e=>set("monto",e.target.value)} placeholder="0.00" style={inputStyle} step="0.01"/>
          </Field>
          <Field label="Moneda">
            <select value={form.moneda} onChange={e=>set("moneda",e.target.value)} style={selectStyle}>
              <option value="MXN">🇲🇽 MXN</option>
              <option value="USD">🇺🇸 USD</option>
              <option value="EUR">🇪🇺 EUR</option>
            </select>
          </Field>
          {needsTC && (
            <Field label="Tipo de Cambio (TC)">
              <input type="number" value={form.tipoCambio} onChange={e=>set("tipoCambio",e.target.value)} placeholder="20.50" style={inputStyle} step="0.0001"/>
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>1 {form.moneda} = {form.tipoCambio} MXN. Se usa para convertir facturas MXN vinculadas.</div>
            </Field>
          )}
        </div>
        <Field label="Notas">
          <textarea value={form.notas} onChange={e=>set("notas",e.target.value)} rows={2} style={{...inputStyle,resize:"vertical"}} placeholder="Observaciones…"/>
        </Field>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
          <button onClick={()=>setModalIngreso(null)} style={{...btnStyle,background:"#F1F5F9",color:C.text}}>Cancelar</button>
          <button onClick={()=>{if(!form.cliente||!form.monto) return; saveIngreso(form);}} style={btnStyle} disabled={!form.cliente||!form.monto}>
            Guardar Ingreso
          </button>
        </div>
      </ModalShell>
    );
  };

  /* ── Ingreso Detail Modal ────────────────────────────────────── */
  const DetailModal = () => {
    // ── Hooks SIEMPRE primero (regla de React) ──
    const [cobroMonto, setCobroMonto] = useState("");
    const [cobroFecha, setCobroFecha] = useState(today());
    const [cobroNotas, setCobroNotas] = useState("");
    const [invDetail, setInvDetail] = useState(null);

    const ing = ingresos.find(i => i.id === detailIngreso);
    if (!ing) return null;

    const m = metrics[ing.id] || {};
    const ingCobros = cobros.filter(c => c.ingresoId === ing.id).sort((a,b)=>b.fechaCobro.localeCompare(a.fechaCobro));
    const vincs = invoiceIngresos.filter(v => v.ingresoId === ing.id);
    const vincsWithInv = vincs.map(v => {
      const inv = allInvoices.find(i => i.id === v.invoiceId);
      return { ...v, inv };
    }).filter(v => v.inv);
    const catStyle = getCatStyle(ing.categoria);
    const sym = monedaSym(ing.moneda);

    const chartData = [
      { name:"Monto Total", value:ing.monto, fill:"#90CAF9" },
      { name:"Cobrado", value:m.totalCobrado||0, fill:C.ok },
      { name:"Consumido", value:m.consumido||0, fill:C.danger },
      { name:"Disponible", value:Math.max(0,m.disponible||0), fill:C.teal },
    ];

    return (
      <ModalShell title={`Detalle — ${ing.cliente}`} onClose={()=>setDetailIngreso(null)} extraWide>
        {/* Header */}
        <div style={{display:"flex",gap:16,marginBottom:20,flexWrap:"wrap",alignItems:"flex-start"}}>
          <div style={{flex:1,minWidth:240}}>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
              <span style={{background:catStyle.bg,color:catStyle.text,border:`1px solid ${catStyle.border}`,padding:"3px 12px",borderRadius:20,fontSize:12,fontWeight:700}}>{ing.categoria}</span>
              <span style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[ing.moneda],color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[ing.moneda],padding:"3px 10px",borderRadius:20,fontSize:12,fontWeight:700}}>{ing.moneda}</span>
              {ing.moneda !== "MXN" && <span style={{fontSize:11,color:C.muted}}>TC: {fmt(ing.tipoCambio)}</span>}
            </div>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:4}}>{ing.concepto||"—"}</div>
            <div style={{fontSize:12,color:C.muted}}>📅 {ing.fecha}</div>
            {ing.notas && <div style={{fontSize:12,color:C.muted,marginTop:4,fontStyle:"italic"}}>📝 {ing.notas}</div>}
          </div>
          {/* KPI mini row */}
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {[
              {l:"Monto Total",     v:`${sym}${fmt(ing.monto)}`,        c:C.navy},
              {l:"Cobrado",         v:`${sym}${fmt(m.totalCobrado)}`,    c:C.ok},
              {l:"Por Cobrar",      v:`${sym}${fmt(m.porCobrar)}`,       c:C.warn},
              {l:"Consumido",       v:`${sym}${fmt(m.consumido)}`,       c:C.danger},
              {l:"Por Pagar",       v:`${sym}${fmt(m.porPagar)}`,        c:"#E65100", bg:"#FFF3E0"},
              {l:"Disponible",      v:`${sym}${fmt(m.disponible)}`,      c:C.teal},
              {l:"Disponible Neto", v:`${sym}${fmt(m.disponibleNeto)}`,  c:(m.disponibleNeto||0)>=0?C.green:C.danger, bg:(m.disponibleNeto||0)>=0?"#E8F5E9":"#FFEBEE"},
            ].map(k=>(
              <div key={k.l} style={{background:k.bg||"#F8FAFC",borderRadius:10,padding:"10px 14px",textAlign:"center",minWidth:110}}>
                <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",marginBottom:2}}>{k.l}</div>
                <div style={{fontSize:16,fontWeight:800,color:k.c}}>{k.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Progress bar */}
        {ing.monto > 0 && (
          <div style={{marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,marginBottom:4}}>
              <span>Cobrado: {fmt((m.totalCobrado/ing.monto)*100)}%</span>
              <span>Consumido: {fmt((m.consumido/ing.monto)*100)}%</span>
            </div>
            <div style={{height:12,borderRadius:20,background:"#E2E8F0",overflow:"hidden",position:"relative"}}>
              <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${Math.min(100,(m.consumido/ing.monto)*100)}%`,background:C.danger,borderRadius:20,transition:"width .4s"}}/>
              <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${Math.min(100,(m.totalCobrado/ing.monto)*100)}%`,background:`${C.ok}88`,borderRadius:20,transition:"width .4s"}}/>
            </div>
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
          {/* LEFT: Cobros — realizados arriba, proyectados abajo */}
          <div>
            {/* REALIZADOS */}
            <h3 style={{fontSize:14,fontWeight:800,color:C.ok,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
              💵 Cobros Realizados
              <span style={{fontSize:11,fontWeight:500,color:C.muted}}>({ingCobros.filter(c=>c.tipo!=='proyectado').length})</span>
            </h3>
            <div style={{background:"#F0FFF4",border:"1px solid #A5D6A7",borderRadius:10,padding:12,marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:C.ok,marginBottom:8}}>+ Registrar cobro recibido</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div>
                  <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Monto</div>
                  <input type="number" value={cobroMonto} onChange={e=>setCobroMonto(e.target.value)} placeholder="0.00" style={{...inputStyle,width:110}} step="0.01"/>
                </div>
                <div>
                  <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Fecha</div>
                  <input type="date" value={cobroFecha} onChange={e=>setCobroFecha(e.target.value)} style={{...inputStyle,width:140}}/>
                </div>
                <div style={{flex:1,minWidth:80}}>
                  <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Notas</div>
                  <input value={cobroNotas} onChange={e=>setCobroNotas(e.target.value)} placeholder="Anticipo, liq…" style={{...inputStyle}}/>
                </div>
                <button onClick={()=>{if(!cobroMonto||+cobroMonto<=0||!cobroFecha) return; addCobro(ing.id,cobroMonto,cobroFecha,cobroNotas,'realizado'); setCobroMonto(""); setCobroNotas("");}}
                  style={{...btnStyle,padding:"7px 14px",fontSize:12,background:C.ok}}>+ Agregar</button>
              </div>
            </div>
            {ingCobros.filter(c=>c.tipo!=='proyectado').length === 0
              ? <div style={{textAlign:"center",color:C.muted,fontSize:12,padding:12}}>Sin cobros realizados</div>
              : ingCobros.filter(c=>c.tipo!=='proyectado').map(c=>(
                <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 11px",borderRadius:8,border:`1px solid ${C.border}`,marginBottom:5,background:C.surface}}>
                  <div>
                    <div style={{fontWeight:700,color:C.ok,fontSize:13}}>{sym}{fmt(c.monto)}</div>
                    <div style={{fontSize:11,color:C.muted}}>📅 {c.fechaCobro||"—"}</div>
                    {c.notas && <div style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>{c.notas}</div>}
                  </div>
                  <button onClick={()=>removeCobro(c.id)} style={{...iconBtn,color:C.danger}}>🗑️</button>
                </div>
              ))
            }
            {(m.totalCobrado||0) > 0 && (
              <div style={{padding:"7px 11px",background:"#E8F5E9",borderRadius:8,fontWeight:800,color:C.ok,fontSize:12,marginTop:4}}>
                Total cobrado: {sym}{fmt(m.totalCobrado)}
              </div>
            )}

            {/* PROYECTADOS */}
            <h3 style={{fontSize:14,fontWeight:800,color:"#7B1FA2",marginBottom:10,marginTop:18,display:"flex",alignItems:"center",gap:6}}>
              📆 Cobros Proyectados
              <span style={{fontSize:11,fontWeight:500,color:C.muted}}>({ingCobros.filter(c=>c.tipo==='proyectado').length})</span>
            </h3>
            <div style={{background:"#F3E5F5",border:"1px solid #CE93D8",borderRadius:10,padding:12,marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#7B1FA2",marginBottom:8}}>+ Proyectar cobro futuro</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div>
                  <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Monto</div>
                  <input id="proy-monto" type="number" placeholder="0.00" style={{...inputStyle,width:110}} step="0.01"/>
                </div>
                <div>
                  <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Fecha estimada</div>
                  <input id="proy-fecha" type="date" defaultValue={today()} style={{...inputStyle,width:140}}/>
                </div>
                <div style={{flex:1,minWidth:80}}>
                  <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Notas</div>
                  <input id="proy-notas" type="text" placeholder="2do anticipo…" style={{...inputStyle}}/>
                </div>
                <button onClick={()=>{
                  const m2 = +document.getElementById('proy-monto').value;
                  const f2 = document.getElementById('proy-fecha').value;
                  const n2 = document.getElementById('proy-notas').value;
                  if(!m2||m2<=0||!f2) return;
                  addCobro(ing.id, m2, f2, n2, 'proyectado');
                  document.getElementById('proy-monto').value='';
                  document.getElementById('proy-notas').value='';
                }} style={{...btnStyle,padding:"7px 14px",fontSize:12,background:"#7B1FA2"}}>+ Proyectar</button>
              </div>
            </div>
            {ingCobros.filter(c=>c.tipo==='proyectado').length === 0
              ? <div style={{textAlign:"center",color:C.muted,fontSize:12,padding:12}}>Sin cobros proyectados.<br/><span style={{fontSize:10}}>Aparecerán en el calendario de proyección.</span></div>
              : ingCobros.filter(c=>c.tipo==='proyectado').map(c=>(
                <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 11px",borderRadius:8,border:"1px solid #CE93D8",marginBottom:5,background:"#FAF0FF"}}>
                  <div>
                    <div style={{fontWeight:700,color:"#7B1FA2",fontSize:13}}>{sym}{fmt(c.monto)}</div>
                    <div style={{fontSize:11,color:C.muted}}>📅 {c.fechaCobro||"—"}</div>
                    {c.notas && <div style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>{c.notas}</div>}
                  </div>
                  <button onClick={()=>removeCobro(c.id)} style={{...iconBtn,color:C.danger}}>🗑️</button>
                </div>
              ))
            }
            {(m.totalProyectado||0) > 0 && (
              <div style={{padding:"7px 11px",background:"#F3E5F5",border:"1px solid #CE93D8",borderRadius:8,fontWeight:800,color:"#7B1FA2",fontSize:12,marginTop:4}}>
                Total proyectado: {sym}{fmt(m.totalProyectado)}
              </div>
            )}
          </div>

          {/* RIGHT: Facturas vinculadas */}
          <div>
            <h3 style={{fontSize:15,fontWeight:800,color:C.navy,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
              🔗 Facturas Vinculadas
              <span style={{fontSize:12,fontWeight:500,color:C.muted}}>({vincsWithInv.length})</span>
            </h3>
            {vincsWithInv.length === 0 && <div style={{textAlign:"center",color:C.muted,fontSize:13,padding:20}}>Sin facturas vinculadas.<br/><span style={{fontSize:11}}>Vincula desde la sección Cartera.</span></div>}
            {vincsWithInv.map(v=>{
              const inv = v.inv;
              const montoConv = convertToMonedaIngreso(v.montoAsignado, inv.moneda, ing);
              const sameMoneda = inv.moneda === ing.moneda;
              const statusBg = {Pagado:"#E8F5E9",Parcial:"#FFF3E0",Pendiente:"#EEF2FF",Vencido:"#FFEBEE"}[inv.estatus]||"#F8FAFC";
              const statusColor = {Pagado:C.ok,Parcial:C.warn,Pendiente:C.sky,Vencido:C.danger}[inv.estatus]||C.muted;
              return (
                <div key={v.id} onClick={()=>setInvDetail(inv)}
                  style={{padding:"10px 12px",borderRadius:8,border:`1px solid ${C.border}`,marginBottom:6,background:statusBg,cursor:"pointer",transition:"box-shadow .15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 2px 12px rgba(0,0,0,.12)";}}
                  onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13}}>{inv.proveedor}</div>
                      <div style={{fontSize:11,color:C.muted}}>Folio: {inv.serie}{inv.folio} · {inv.fecha}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{color:statusColor,fontWeight:700,fontSize:11}}>{inv.estatus}</span>
                      <span style={{fontSize:11,color:C.muted,background:"#fff",padding:"1px 6px",borderRadius:6,border:`1px solid ${C.border}`}}>ver detalle →</span>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:12,marginTop:6,fontSize:12}}>
                    <span><span style={{color:C.muted}}>Asignado: </span><b>{inv.moneda==="EUR"?"€":"$"}{fmt(v.montoAsignado)} {inv.moneda}</b></span>
                    {!sameMoneda && <span style={{color:C.muted}}>→ <b>{sym}{fmt(montoConv)} {ing.moneda}</b></span>}
                  </div>
                </div>
              );
            })}
            {vincsWithInv.length > 0 && (
              <div style={{padding:"8px 12px",background:"#FFEBEE",borderRadius:8,fontWeight:800,color:C.danger,fontSize:13,marginTop:4}}>
                Total comprometido: {sym}{fmt(m.comprometido)} | Consumido: {sym}{fmt(m.consumido)}
              </div>
            )}
          </div>
        </div>

        {/* Chart */}
        <div style={{marginTop:24,background:"#F8FAFC",borderRadius:14,padding:18}}>
          <h3 style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:14}}>📊 Resumen del Ingreso</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3"/>
              <XAxis type="number" tickFormatter={v=>`${sym}${fmt(v)}`} fontSize={10}/>
              <YAxis type="category" dataKey="name" fontSize={11} width={80}/>
              <Tooltip formatter={v=>`${sym}${fmt(v)}`}/>
              <Bar dataKey="value" radius={[0,4,4,0]}>
                {chartData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Actions */}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
          <button onClick={()=>{setDetailIngreso(null); setModalIngreso({...ing});}} style={{...btnStyle,background:"#F1F5F9",color:C.text}}>✏️ Editar</button>
          <button onClick={()=>{setDetailIngreso(null); setDeleteConfirm({id:ing.id,label:`${ing.cliente} — ${ing.concepto||ing.categoria}`});}} style={{...btnStyle,background:C.danger}}>🗑️ Eliminar</button>
          <button onClick={()=>setDetailIngreso(null)} style={btnStyle}>Cerrar</button>
        </div>

        {/* ── Popup detalle de factura vinculada ── */}
        {invDetail && (()=>{
          const i = invDetail;
          const sym2 = i.moneda==="EUR"?"€":"$";
          const saldo = (+i.total||0)-(+i.montoPagado||0);
          const statusColor = {Pagado:C.ok,Parcial:C.warn,Pendiente:C.sky,Vencido:C.danger}[i.estatus]||C.muted;
          const statusBg   = {Pagado:"#E8F5E9",Parcial:"#FFF3E0",Pendiente:"#EEF2FF",Vencido:"#FFEBEE"}[i.estatus]||"#F8FAFC";
          const monedaColor= {MXN:C.mxn,USD:C.usd,EUR:C.eur}[i.moneda]||C.navy;
          const monedaBg   = {MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[i.moneda]||"#F8FAFC";
          const Row = ({label,value,bold,color}) => (
            <div style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontSize:13,color:C.muted}}>{label}</span>
              <span style={{fontSize:13,fontWeight:bold?700:500,color:color||C.text}}>{value||"—"}</span>
            </div>
          );
          return (
            <div style={{position:"fixed",inset:0,background:"rgba(15,45,74,.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:3000,padding:20}}
              onClick={()=>setInvDetail(null)}>
              <div onClick={e=>e.stopPropagation()}
                style={{background:C.surface,borderRadius:20,padding:32,width:"100%",maxWidth:560,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
                {/* Header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
                  <div>
                    <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Detalle de Factura</div>
                    <div style={{fontSize:22,fontWeight:900,color:C.navy}}>{i.serie}{i.folio}</div>
                    <div style={{fontSize:14,color:C.muted,marginTop:2}}>{i.proveedor}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    <span style={{background:statusBg,color:statusColor,fontWeight:800,fontSize:13,padding:"4px 14px",borderRadius:20,border:`1px solid ${statusColor}44`}}>
                      {i.estatus}
                    </span>
                    <span style={{background:monedaBg,color:monedaColor,fontWeight:700,fontSize:11,padding:"3px 10px",borderRadius:20}}>
                      {i.moneda}
                    </span>
                    <button onClick={()=>setInvDetail(null)}
                      style={{background:"#F1F5F9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:16,marginTop:4}}>×</button>
                  </div>
                </div>

                {/* Importes destacados */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
                  {[
                    {l:"Total",    v:`${sym2}${fmt(i.total)}`,      c:C.navy,   bg:"#F8FAFC"},
                    {l:"Pagado",   v:`${sym2}${fmt(i.montoPagado)}`,c:C.ok,     bg:"#E8F5E9"},
                    {l:"Saldo",    v:`${sym2}${fmt(saldo)}`,         c:saldo>0?C.warn:C.ok, bg:saldo>0?"#FFF3E0":"#E8F5E9"},
                  ].map(k=>(
                    <div key={k.l} style={{background:k.bg,borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",marginBottom:3}}>{k.l}</div>
                      <div style={{fontSize:18,fontWeight:800,color:k.c}}>{k.v}</div>
                    </div>
                  ))}
                </div>

                {/* Desglose */}
                <div style={{marginBottom:16}}>
                  <Row label="Tipo"               value={i.tipo}/>
                  <Row label="Fecha emisión"       value={i.fecha}/>
                  <Row label="UUID"                value={i.uuid ? i.uuid.slice(0,24)+"…" : "—"}/>
                  <Row label="Clasificación"       value={i.clasificacion}/>
                  {i.concepto && <Row label="Concepto" value={i.concepto}/>}
                  <Row label="Subtotal"            value={`${sym2}${fmt(i.subtotal)}`}/>
                  <Row label="IVA"                 value={`${sym2}${fmt(i.iva)}`}/>
                  {(+i.retIsr||0)>0 && <Row label="Ret. ISR" value={`${sym2}${fmt(i.retIsr)}`}/>}
                  {(+i.retIva||0)>0 && <Row label="Ret. IVA" value={`${sym2}${fmt(i.retIva)}`}/>}
                  <Row label="Total"               value={`${sym2}${fmt(i.total)}`} bold color={C.navy}/>
                  <Row label="Monto Pagado"        value={`${sym2}${fmt(i.montoPagado)}`} bold color={C.ok}/>
                  <Row label="Saldo Pendiente"     value={`${sym2}${fmt(saldo)}`} bold color={saldo>0?C.warn:C.ok}/>
                  <Row label="Vencimiento"         value={i.vencimiento}/>
                  {i.diasCredito && <Row label="Días crédito" value={`${i.diasCredito} días`}/>}
                  {i.fechaProgramacion && <Row label="Pago programado" value={i.fechaProgramacion}/>}
                  {i.referencia && <Row label="Referencia" value={i.referencia}/>}
                </div>

                {/* Autorizaciones */}
                <div style={{display:"flex",gap:10,marginBottom:20}}>
                  <div style={{flex:1,background:i.voBo?"#E8F5E9":"#F8FAFC",borderRadius:8,padding:"8px 14px",textAlign:"center",fontSize:12}}>
                    <div style={{color:C.muted,marginBottom:2}}>Visto Bueno</div>
                    <div style={{fontSize:18}}>{i.voBo?"✅":"⬜"}</div>
                  </div>
                  <div style={{flex:1,background:i.autorizadoDireccion?"#E8F5E9":"#F8FAFC",borderRadius:8,padding:"8px 14px",textAlign:"center",fontSize:12}}>
                    <div style={{color:C.muted,marginBottom:2}}>Aut. Dirección</div>
                    <div style={{fontSize:18}}>{i.autorizadoDireccion?"✅":"⬜"}</div>
                  </div>
                </div>

                {/* Notas */}
                {i.notas && (
                  <div style={{background:"#FFF8E1",border:"1px solid #FFE082",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#856404"}}>
                    📝 {i.notas}
                  </div>
                )}

                <div style={{display:"flex",justifyContent:"flex-end",marginTop:20}}>
                  <button onClick={()=>setInvDetail(null)} style={btnStyle}>Cerrar</button>
                </div>
              </div>
            </div>
          );
        })()}
      </ModalShell>
    );
  };

  /* ── Ingreso row in table ─────────────────────────────────────── */
  const IngresoRow = ({ing, idx}) => {
    const m = metrics[ing.id] || {};
    const catStyle = getCatStyle(ing.categoria);
    const sym = monedaSym(ing.moneda);
    const disponPct = ing.monto > 0 ? Math.max(0,Math.min(100,(m.disponible||0)/ing.monto*100)) : 0;
    const cobradoPct = ing.monto > 0 ? Math.min(100,(m.totalCobrado||0)/ing.monto*100) : 0;
    const disponColor = (m.disponible||0) > 0 ? C.teal : (m.disponible||0) === 0 ? C.muted : C.danger;

    return (
      <tr style={{borderTop:`1px solid ${C.border}`,background:idx%2===0?C.surface:"#FAFBFC",cursor:"pointer",transition:"background .12s"}}
        onMouseEnter={e=>{e.currentTarget.style.background="#F0F7FF";}}
        onMouseLeave={e=>{e.currentTarget.style.background=idx%2===0?C.surface:"#FAFBFC";}}
        onClick={()=>setDetailIngreso(ing.id)}>
        <td style={{padding:"12px 10px",fontWeight:700,color:C.navy,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ing.cliente}</td>
        <td style={{padding:"12px 10px",color:ing.concepto?C.text:C.muted,fontStyle:ing.concepto?"normal":"italic",minWidth:160,maxWidth:220,whiteSpace:"normal",lineHeight:1.4,wordBreak:"break-word"}}>{ing.concepto||"—"}</td>
        <td style={{padding:"12px 10px"}}>
          <span style={{background:catStyle.bg,color:catStyle.text,border:`1px solid ${catStyle.border}`,padding:"2px 9px",borderRadius:20,fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{ing.categoria}</span>
        </td>
        <td style={{padding:"12px 10px",whiteSpace:"nowrap",fontSize:12,color:C.muted}}>{ing.fecha||"—"}</td>
        <td style={{padding:"12px 10px",fontWeight:700,textAlign:"right"}}>{sym}{fmt(ing.monto)}</td>
        <td style={{padding:"12px 10px",fontWeight:600,color:C.ok,textAlign:"right"}}>{sym}{fmt(m.totalCobrado||0)}</td>
        <td style={{padding:"12px 10px",fontWeight:600,color:(m.porCobrar||0)>0?C.warn:C.ok,textAlign:"right"}}>{sym}{fmt(m.porCobrar||0)}</td>
        <td style={{padding:"12px 10px",fontWeight:600,color:C.danger,textAlign:"right"}}>{sym}{fmt(m.consumido||0)}</td>
        {/* Por Pagar — facturas pendientes vinculadas */}
        <td style={{padding:"12px 10px",textAlign:"right"}}>
          <span style={{fontWeight:700,color:"#E65100",background:(m.porPagar||0)>0?"#FFF3E0":"transparent",padding:(m.porPagar||0)>0?"2px 6px":"0",borderRadius:6}}>
            {sym}{fmt(m.porPagar||0)}
          </span>
        </td>
        {/* Disponible */}
        <td style={{padding:"12px 10px",textAlign:"right"}}>
          <span style={{fontWeight:800,color:disponColor}}>{sym}{fmt(m.disponible||0)}</span>
          {ing.moneda !== "MXN" && <div style={{fontSize:9,color:C.muted}}>TC:{fmt(ing.tipoCambio)}</div>}
        </td>
        {/* Disponible Neto */}
        <td style={{padding:"12px 10px",textAlign:"right"}}>
          <span style={{fontWeight:800,color:(m.disponibleNeto||0)>=0?C.green:C.danger,background:(m.disponibleNeto||0)>=0?"#E8F5E9":"#FFEBEE",padding:"2px 7px",borderRadius:6}}>
            {sym}{fmt(m.disponibleNeto||0)}
          </span>
        </td>
        <td style={{padding:"12px 10px"}}>
          {/* Mini bar showing cobrado/consumido */}
          <div style={{width:80,height:8,borderRadius:20,background:"#E2E8F0",overflow:"hidden",position:"relative"}}>
            <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${cobradoPct}%`,background:`${C.ok}88`,borderRadius:20}}/>
            <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${Math.min(cobradoPct,disponPct*0+((m.consumido||0)/ing.monto*100))}%`,background:C.danger,borderRadius:20}}/>
          </div>
        </td>
        <td style={{padding:"12px 8px",whiteSpace:"nowrap"}} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>setDetailIngreso(ing.id)} style={{...iconBtn,color:C.sky}} title="Ver detalle">🔍</button>
          <button onClick={()=>setModalIngreso({...ing})} style={{...iconBtn,color:C.blue}} title="Editar">✏️</button>
          <button onClick={()=>setDeleteConfirm({id:ing.id,label:`${ing.cliente} — ${ing.concepto||ing.categoria}`})} style={{...iconBtn,color:C.danger}} title="Eliminar">🗑️</button>
        </td>
      </tr>
    );
  };

  /* ── Proyección en Calendario ───────────────────────────────── */
  const ProyeccionCalendario = () => {
    const [calYear,  setCalYear]  = useState(() => new Date().getFullYear());
    const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
    const [calDayDetailLocal, setCalDayDetailLocal] = useState(null);

    const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const DIAS  = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

    // Build map: "YYYY-MM-DD" → [ { ing, cobro } ]
    const calMap = useMemo(() => {
      const map = {};
      cobros.filter(c => c.tipo === 'proyectado' && c.fechaCobro).forEach(c => {
        const ing = ingresos.find(i => i.id === c.ingresoId);
        if (!ing) return;
        if (!map[c.fechaCobro]) map[c.fechaCobro] = [];
        map[c.fechaCobro].push({ ing, cobro: c });
      });
      return map;
    }, [cobros, ingresos]);

    const firstDay    = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const todayStr    = today();

    const prevMonth = () => { if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1); };
    const nextMonth = () => { if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1); };

    const monthPrefix = `${calYear}-${String(calMonth+1).padStart(2,'0')}`;
    const monthEntries = Object.entries(calMap).filter(([d])=>d.startsWith(monthPrefix));
    const monthTotals = {};
    monthEntries.forEach(([,items])=>items.forEach(({ing,cobro})=>{
      monthTotals[ing.moneda] = (monthTotals[ing.moneda]||0) + cobro.monto;
    }));

    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <h2 style={{fontSize:18,fontWeight:800,color:C.navy,margin:0}}>📆 Proyección de Cobros</h2>
            <p style={{color:C.muted,fontSize:13,margin:"4px 0 0"}}>Cobros proyectados capturados en el detalle de cada ingreso</p>
          </div>
          <button onClick={()=>setProyeccionView(false)} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"7px 14px",fontSize:12}}>← Volver</button>
        </div>

        {Object.keys(monthTotals).length > 0 && (
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:C.muted,alignSelf:"center"}}>Este mes:</span>
            {Object.entries(monthTotals).map(([mon,val])=>(
              <div key={mon} style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[mon]||"#F8FAFC",border:"1px solid",borderColor:{MXN:"#90CAF9",USD:"#A5D6A7",EUR:"#CE93D8"}[mon]||"#E0E0E0",borderRadius:20,padding:"5px 14px",fontSize:13,fontWeight:700,color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[mon]||C.navy}}>
                {mon==="EUR"?"€":"$"}{fmt(val)} {mon}
              </div>
            ))}
          </div>
        )}

        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",background:C.navy}}>
            <button onClick={prevMonth} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:16,fontWeight:700}}>‹</button>
            <span style={{fontWeight:800,fontSize:17,color:"#fff"}}>{MESES[calMonth]} {calYear}</span>
            <button onClick={nextMonth} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:16,fontWeight:700}}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"#F8FAFC",borderBottom:`1px solid ${C.border}`}}>
            {DIAS.map(d=>(
              <div key={d} style={{padding:"8px 4px",textAlign:"center",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase"}}>{d}</div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
            {Array.from({length:firstDay}).map((_,i)=>(
              <div key={`e${i}`} style={{minHeight:110,background:"#FAFBFC",borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}/>
            ))}
            {Array.from({length:daysInMonth}).map((_,i)=>{
              const day = i + 1;
              const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const entries = calMap[dateStr] || [];
              const isToday = dateStr === todayStr;
              const hasCobros = entries.length > 0;
              const byMon = {};
              entries.forEach(({ing,cobro})=>{ byMon[ing.moneda]=(byMon[ing.moneda]||0)+cobro.monto; });

              return (
                <div key={day}
                  onClick={hasCobros ? ()=>setCalDayDetailLocal({fecha:dateStr,entries}) : undefined}
                  style={{minHeight:110,padding:"8px 8px 6px",borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,background:hasCobros?"#F3E5F5":isToday?"#E8F0FE":C.surface,cursor:hasCobros?"pointer":"default",transition:"background .15s"}}
                  onMouseEnter={e=>{if(hasCobros)e.currentTarget.style.background="#EDD5F5";}}
                  onMouseLeave={e=>{if(hasCobros)e.currentTarget.style.background="#F3E5F5";}}>
                  {/* Número del día */}
                  <div style={{width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:isToday?C.navy:"transparent",color:isToday?"#fff":hasCobros?"#7B1FA2":C.text,fontWeight:isToday||hasCobros?800:400,fontSize:14,marginBottom:6}}>{day}</div>
                  {/* Chips de monto por moneda */}
                  {Object.entries(byMon).map(([mon,val])=>(
                    <div key={mon} style={{background:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[mon]||"#7B1FA2",color:"#fff",borderRadius:7,padding:"4px 7px",fontSize:13,fontWeight:800,marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",letterSpacing:"-0.3px"}}>
                      {mon==="EUR"?"€":"$"}{fmt(val)}
                      <span style={{fontSize:10,fontWeight:600,opacity:.85,marginLeft:3}}>{mon}</span>
                    </div>
                  ))}
                  {/* Conteo de cobros */}
                  {hasCobros && (
                    <div style={{fontSize:11,color:"#7B1FA2",fontWeight:700,marginTop:2}}>
                      {entries.length} cobro{entries.length>1?"s":""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{display:"flex",gap:16,marginTop:12,fontSize:11,color:C.muted,flexWrap:"wrap"}}>
          <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:14,height:14,borderRadius:3,background:"#F3E5F5",border:"1px solid #CE93D8",display:"inline-block"}}/>Día con cobro proyectado — clic para ver detalle</span>
          <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:14,height:14,borderRadius:"50%",background:C.navy,display:"inline-block"}}/>Hoy</span>
        </div>

        {/* Day detail popup */}
        {calDayDetailLocal && (
          <div style={{position:"fixed",inset:0,background:"rgba(15,45,74,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:3000,padding:20}}
            onClick={()=>setCalDayDetailLocal(null)}>
            <div onClick={e=>e.stopPropagation()}
              style={{background:C.surface,borderRadius:20,padding:28,width:"100%",maxWidth:540,maxHeight:"80vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <div>
                  <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase"}}>Cobros proyectados</div>
                  <div style={{fontSize:20,fontWeight:900,color:"#7B1FA2"}}>📅 {calDayDetailLocal.fecha}</div>
                </div>
                <button onClick={()=>setCalDayDetailLocal(null)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:16}}>×</button>
              </div>
              {(()=>{
                const dt = {};
                calDayDetailLocal.entries.forEach(({ing,cobro})=>{ dt[ing.moneda]=(dt[ing.moneda]||0)+cobro.monto; });
                return (
                  <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
                    {Object.entries(dt).map(([mon,val])=>(
                      <div key={mon} style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[mon],border:"1px solid",borderColor:{MXN:"#90CAF9",USD:"#A5D6A7",EUR:"#CE93D8"}[mon],borderRadius:10,padding:"10px 16px",textAlign:"center"}}>
                        <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase"}}>{mon}</div>
                        <div style={{fontSize:20,fontWeight:800,color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[mon]}}>{mon==="EUR"?"€":"$"}{fmt(val)}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {calDayDetailLocal.entries.map(({ing,cobro})=>{
                const sym = monedaSym(ing.moneda);
                const catStyle = getCatStyle(ing.categoria);
                return (
                  <div key={cobro.id}
                    style={{padding:"12px 14px",borderRadius:10,border:"1px solid #CE93D8",background:"#FAF0FF",marginBottom:8,cursor:"pointer"}}
                    onClick={()=>{setCalDayDetailLocal(null); setProyeccionView(false); setDetailIngreso(ing.id);}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{fontWeight:800,color:C.navy,fontSize:14}}>{ing.cliente}</div>
                        <div style={{fontSize:12,color:C.muted,marginTop:2}}>{ing.concepto||ing.categoria}</div>
                        <span style={{background:catStyle.bg,color:catStyle.text,border:`1px solid ${catStyle.border}`,padding:"1px 8px",borderRadius:20,fontSize:10,fontWeight:700,marginTop:4,display:"inline-block"}}>{ing.categoria}</span>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontWeight:900,fontSize:16,color:"#7B1FA2"}}>{sym}{fmt(cobro.monto)} {ing.moneda}</div>
                        {cobro.notas && <div style={{fontSize:11,color:C.muted,fontStyle:"italic",marginTop:2}}>{cobro.notas}</div>}
                        <div style={{fontSize:10,color:C.muted,marginTop:4}}>Clic para ver detalle →</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ── Main Render ───────────────────────────────────────────────── */
  if (proyeccionView) return (
    <div>
      <ProyeccionCalendario/>
      {detailIngreso && <DetailModal/>}
    </div>
  );

  const totalIngresos = ingresos.length;
  const pendientesDeCobrar = ingresos.filter(ing=>(metrics[ing.id]?.porCobrar||0)>0).length;

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:800,color:C.navy,margin:0}}>💵 Cuentas por Cobrar</h1>
          <p style={{color:C.muted,fontSize:14,margin:"4px 0 0"}}>Controla ingresos de clientes y vincúlalos a tus gastos</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setProyeccionView(true)} style={{...btnStyle,background:"#E8F0FE",color:C.blue,padding:"8px 16px",fontSize:13}}>📆 Proyección</button>
          <button onClick={()=>setConfigCats(true)} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"8px 14px",fontSize:13}}>⚙️ Categorías</button>
          <button onClick={()=>setModalIngreso({id:"",cliente:"",concepto:"",categoria:catList[0]||"Circuito",monto:"",moneda:"MXN",tipoCambio:1,fecha:today(),notas:""})} style={btnStyle}>
            + Nuevo Ingreso
          </button>
        </div>
      </div>

      {/* KPI Cards — per currency */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",margin:"20px 0"}}>
        {Object.entries(kpis).map(([mon,v])=>{
          if (v.monto === 0 && v.cobrado === 0) return null;
          const sym = monedaSym(mon);
          const flagMap = {MXN:"🇲🇽",USD:"🇺🇸",EUR:"🇪🇺"};
          const colMap  = {MXN:C.mxn,USD:C.usd,EUR:C.eur};
          const bgMap   = {MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"};
          const mk = (key,label,value,color,icon,bg,tipo) => (
            <div key={key} onClick={()=>setKpiModal({titulo:label,tipo,moneda:mon})}
              style={{background:bg||C.surface,borderRadius:16,padding:"18px 22px",border:`1px solid ${C.border}`,boxShadow:"0 2px 8px rgba(0,0,0,.05)",flex:1,minWidth:150,cursor:"pointer",transition:"transform .15s, box-shadow .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.03)";e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,.12)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.05)";}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>{label}</div>
                  <div style={{fontSize:22,fontWeight:800,color,marginTop:4}}>{value}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:3}}>Clic para ver desglose</div>
                </div>
                <div style={{fontSize:26}}>{icon}</div>
              </div>
            </div>
          );
          return [
            mk(`${mon}-monto`,    `${flagMap[mon]} ${mon} Total`,  `${sym}${fmt(v.monto)}`,         colMap[mon],    "💼", bgMap[mon],    "total"),
            mk(`${mon}-cobrado`,  `${mon} Cobrado`,                `${sym}${fmt(v.cobrado)}`,        C.ok,           "✅", null,          "cobrado"),
            mk(`${mon}-porCobrar`,`${mon} Por Cobrar`,             `${sym}${fmt(v.porCobrar)}`,      C.warn,         "⏳", null,          "porCobrar"),
            mk(`${mon}-consumido`,`${mon} Consumido`,              `${sym}${fmt(v.consumido)}`,      C.danger,       "📤", null,          "consumido"),
            mk(`${mon}-porPagar`, `${mon} Por Pagar`,              `${sym}${fmt(v.porPagar)}`,       "#E65100",      "🧾", "#FFF3E0",     "porPagar"),
            mk(`${mon}-disponible`,`${mon} Disponible`,            `${sym}${fmt(v.disponible)}`,     C.teal,         "💰", null,          "disponible"),
            mk(`${mon}-dispNeto`, `${mon} Disponible Neto`,        `${sym}${fmt(v.disponibleNeto)}`, v.disponibleNeto>=0?C.green:C.danger,"🏦",v.disponibleNeto>=0?"#E8F5E9":"#FFEBEE","disponibleNeto"),
          ];
        })}
      </div>

      {/* ── KPI Desglose Modal ── */}
      {kpiModal && (()=>{
        const { titulo, tipo, moneda } = kpiModal;
        const sym = monedaSym(moneda);

        // Filtra los ingresos de esa moneda según el tipo de KPI
        const rows = ingresos.filter(ing => ing.moneda === moneda).map(ing => {
          const m = metrics[ing.id] || {};
          let valor = 0;
          if (tipo === "total")          valor = ing.monto;
          else if (tipo === "cobrado")   valor = m.totalCobrado || 0;
          else if (tipo === "porCobrar") valor = m.porCobrar || 0;
          else if (tipo === "consumido") valor = m.consumido || 0;
          else if (tipo === "porPagar")  valor = m.porPagar || 0;
          else if (tipo === "disponible")    valor = m.disponible || 0;
          else if (tipo === "disponibleNeto") valor = m.disponibleNeto || 0;
          return { ing, valor };
        }).filter(r => r.valor !== 0).sort((a,b) => Math.abs(b.valor) - Math.abs(a.valor));

        const total = rows.reduce((s,r) => s+r.valor, 0);
        const colorTipo = {
          total:C.navy, cobrado:C.ok, porCobrar:C.warn, consumido:C.danger,
          porPagar:"#E65100", disponible:C.teal, disponibleNeto:total>=0?C.green:C.danger
        }[tipo]||C.navy;

        return (
          <div style={{position:"fixed",inset:0,background:"rgba(15,45,74,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2500,padding:20}}
            onClick={()=>setKpiModal(null)}>
            <div onClick={e=>e.stopPropagation()}
              style={{background:C.surface,borderRadius:20,padding:28,width:"100%",maxWidth:620,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
              {/* Header */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
                <div>
                  <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Desglose</div>
                  <div style={{fontSize:20,fontWeight:900,color:colorTipo}}>{titulo}</div>
                </div>
                <button onClick={()=>setKpiModal(null)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:18}}>×</button>
              </div>
              {/* Total */}
              <div style={{background:"#F8FAFC",borderRadius:10,padding:"12px 16px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,color:C.muted,fontWeight:600}}>Total {moneda}</span>
                <span style={{fontSize:22,fontWeight:900,color:colorTipo}}>{sym}{fmt(total)}</span>
              </div>
              {/* Tabla de ingresos */}
              {rows.length === 0 ? (
                <div style={{textAlign:"center",padding:30,color:C.muted}}>Sin registros</div>
              ) : (
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead>
                    <tr style={{background:"#F8FAFC"}}>
                      {["Cliente","Concepto","Categoría","Fecha","Importe"].map(h=>(
                        <th key={h} style={{padding:"9px 10px",textAlign:h==="Importe"?"right":"left",color:C.muted,fontWeight:700,fontSize:11,textTransform:"uppercase",borderBottom:`2px solid ${C.border}`}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ing,valor},idx)=>{
                      const catStyle = getCatStyle(ing.categoria);
                      return (
                        <tr key={ing.id}
                          style={{borderBottom:`1px solid ${C.border}`,background:idx%2===0?C.surface:"#FAFBFC",cursor:"pointer",transition:"background .12s"}}
                          onClick={()=>{setKpiModal(null); setDetailIngreso(ing.id);}}
                          onMouseEnter={e=>{e.currentTarget.style.background="#F0F7FF";}}
                          onMouseLeave={e=>{e.currentTarget.style.background=idx%2===0?C.surface:"#FAFBFC";}}>
                          <td style={{padding:"10px 10px",fontWeight:700,color:C.navy}}>{ing.cliente}</td>
                          <td style={{padding:"10px 10px",color:ing.concepto?C.text:C.muted,fontStyle:ing.concepto?"normal":"italic",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ing.concepto||"—"}</td>
                          <td style={{padding:"10px 10px"}}>
                            <span style={{background:catStyle.bg,color:catStyle.text,border:`1px solid ${catStyle.border}`,padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{ing.categoria}</span>
                          </td>
                          <td style={{padding:"10px 10px",fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>{ing.fecha||"—"}</td>
                          <td style={{padding:"10px 10px",textAlign:"right",fontWeight:800,color:valor>=0?colorTipo:C.danger}}>{sym}{fmt(valor)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{borderTop:`2px solid ${C.navy}`,background:"#EEF2FF"}}>
                      <td colSpan={4} style={{padding:"10px 10px",fontWeight:800,color:C.navy,fontSize:13}}>TOTAL ({rows.length} ingresos)</td>
                      <td style={{padding:"10px 10px",textAlign:"right",fontWeight:900,fontSize:15,color:colorTipo}}>{sym}{fmt(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
              <div style={{fontSize:11,color:C.muted,marginTop:12,textAlign:"center"}}>Clic en una fila para abrir el detalle del ingreso</div>
            </div>
          </div>
        );
      })()}

      {/* Global stats strip */}
      <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        <div style={{background:"#E8F0FE",border:`1px solid #C7D7FD`,borderRadius:10,padding:"8px 16px",fontSize:13}}>
          <span style={{color:C.muted}}>Total ingresos: </span><span style={{fontWeight:700,color:C.navy}}>{totalIngresos}</span>
        </div>
        <div style={{background:"#FFF3E0",border:"1px solid #FFCC80",borderRadius:10,padding:"8px 16px",fontSize:13}}>
          <span style={{color:C.muted}}>Pendientes de cobro: </span><span style={{fontWeight:700,color:C.warn}}>{pendientesDeCobrar}</span>
        </div>
        <div style={{background:"#E0F2F1",border:"1px solid #80CBC4",borderRadius:10,padding:"8px 16px",fontSize:13}}>
          <span style={{color:C.muted}}>Vinculaciones activas: </span><span style={{fontWeight:700,color:C.teal}}>{invoiceIngresos.length}</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:18,marginBottom:20}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
          <input placeholder="🔍 Buscar cliente, concepto…" value={filtroSearch} onChange={e=>setFiltroSearch(e.target.value)} style={{...inputStyle,maxWidth:220}}/>
          <select value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)} style={{...selectStyle,maxWidth:200}}>
            <option value="">Todos los clientes</option>
            {clientesList.map(c=><option key={c}>{c}</option>)}
          </select>
          <select value={filtroCategoria} onChange={e=>setFiltroCategoria(e.target.value)} style={{...selectStyle,maxWidth:180}}>
            <option value="">Todas las categorías</option>
            {catList.map(c=><option key={c}>{c}</option>)}
          </select>
          <select value={filtroMoneda} onChange={e=>setFiltroMoneda(e.target.value)} style={{...selectStyle,maxWidth:130}}>
            <option value="">Todas las monedas</option>
            <option value="MXN">🇲🇽 MXN</option>
            <option value="USD">🇺🇸 USD</option>
            <option value="EUR">🇪🇺 EUR</option>
          </select>
          {/* Filtro Cobrado / Por Cobrar */}
          <select value={filtroCobro} onChange={e=>setFiltroCobro(e.target.value)} style={{...selectStyle,maxWidth:160}}>
            <option value="">💵 Todos</option>
            <option value="cobrado">✅ Con cobros</option>
            <option value="porCobrar">⏳ Por cobrar</option>
          </select>
          <input type="date" value={filtroFechaFrom} onChange={e=>setFiltroFechaFrom(e.target.value)} style={{...inputStyle,maxWidth:150}} title="Desde"/>
          <input type="date" value={filtroFechaTo} onChange={e=>setFiltroFechaTo(e.target.value)} style={{...inputStyle,maxWidth:150}} title="Hasta"/>
          {(filtroSearch||filtroCliente||filtroCategoria||filtroMoneda||filtroFechaFrom||filtroFechaTo||filtroCobro) && (
            <button onClick={()=>{setFiltroSearch("");setFiltroCliente("");setFiltroCategoria("");setFiltroMoneda("");setFiltroFechaFrom("");setFiltroFechaTo("");setFiltroCobro("");}} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"7px 14px",fontSize:12}}>✕ Limpiar</button>
          )}
        </div>
      </div>

      {/* Ingresos Table */}
      {filtered.length === 0 ? (
        <div style={{textAlign:"center",padding:60,color:C.muted,background:C.surface,borderRadius:14,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:48,marginBottom:12}}>💵</div>
          <div style={{fontSize:16,fontWeight:600}}>
            {ingresos.length === 0 ? "Sin ingresos registrados" : "Sin resultados con estos filtros"}
          </div>
          {ingresos.length === 0 && (
            <button onClick={()=>setModalIngreso({id:"",cliente:"",concepto:"",categoria:catList[0]||"Circuito",monto:"",moneda:"MXN",tipoCambio:1,fecha:today(),notas:""})} style={{...btnStyle,marginTop:16}}>
              + Crear primer ingreso
            </button>
          )}
        </div>
      ) : (
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:900}}>
              <thead>
                <tr style={{background:C.navy}}>
                  {["Cliente","Concepto","Categoría","Fecha","Monto","Cobrado","Por Cobrar","Consumido","Por Pagar","Disponible","Disp. Neto","Consumo","Acciones"].map(h=>(
                    <th key={h} style={{padding:"10px 10px",textAlign:["Monto","Cobrado","Por Cobrar","Consumido","Por Pagar","Disponible","Disp. Neto"].includes(h)?"right":"left",color:"#fff",fontWeight:600,fontSize:11,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((ing,idx)=><IngresoRow key={ing.id} ing={ing} idx={idx}/>)}
              </tbody>
              <tfoot>
                <tr style={{borderTop:`2px solid ${C.navy}`,background:"#EEF2FF"}}>
                  <td colSpan={4} style={{padding:"10px 10px",fontWeight:800,color:C.navy,fontSize:13}}>
                    TOTAL FILTRADO ({filtered.length})
                  </td>
                  <td style={{padding:"10px 10px",fontWeight:800,textAlign:"right",fontSize:12,color:C.muted}}>—</td>
                  <td style={{padding:"10px 10px",fontWeight:800,color:C.ok,textAlign:"right",fontSize:12}}>—</td>
                  <td style={{padding:"10px 10px",fontWeight:800,color:C.warn,textAlign:"right",fontSize:12}}>—</td>
                  <td style={{padding:"10px 10px",fontWeight:800,color:C.danger,textAlign:"right",fontSize:12}}>—</td>
                  <td style={{padding:"10px 10px",fontWeight:800,color:"#E65100",textAlign:"right",fontSize:12}}>—</td>
                  <td colSpan={4}/>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Nota de multimoneda */}
      <div style={{marginTop:12,padding:"10px 14px",background:"#FFFDE7",border:"1px solid #FFE082",borderRadius:8,fontSize:11,color:"#856404",lineHeight:1.6}}>
        💡 <b>Consumido</b> = facturas pagadas vinculadas · <b>Por Pagar</b> = facturas pendientes/parciales vinculadas (no afecta Disponible) ·
        <b> Disponible</b> = Cobrado − Consumido · <b>Disp. Neto</b> = Disponible − Por Pagar (lo que queda tras cubrir todo lo comprometido).
        Los totales no se suman entre monedas distintas.
      </div>

      {/* ── Modals ── */}
      {modalIngreso && <IngresoModal/>}
      {detailIngreso && <DetailModal/>}

      {/* Delete confirm */}
      {deleteConfirm && (
        <ModalShell title="Confirmar Eliminación" onClose={()=>setDeleteConfirm(null)}>
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:48,marginBottom:16}}>🗑️</div>
            <p style={{fontSize:15,color:C.text,marginBottom:8}}>¿Eliminar este ingreso?</p>
            <p style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:8}}>{deleteConfirm.label}</p>
            <p style={{fontSize:12,color:C.danger,marginBottom:24}}>Se eliminan también sus cobros y vinculaciones con facturas.</p>
            <div style={{display:"flex",gap:12,justifyContent:"center"}}>
              <button onClick={()=>setDeleteConfirm(null)} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"10px 28px"}}>Cancelar</button>
              <button onClick={handleDeleteIngreso} style={{...btnStyle,background:C.danger,padding:"10px 28px"}}>Sí, Eliminar</button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Config categorías */}
      {configCats && (
        <ModalShell title="⚙️ Categorías de Ingreso" onClose={()=>setConfigCats(false)}>
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
              {catList.map(c=>{
                const cs = getCatStyle(c);
                return (
                  <div key={c} style={{display:"flex",alignItems:"center",gap:4,background:cs.bg,border:`1px solid ${cs.border}`,borderRadius:20,padding:"4px 12px"}}>
                    <span style={{fontSize:13,color:cs.text,fontWeight:600}}>{c}</span>
                    {catList.length > 1 && (
                      <button onClick={()=>removeCategoria(c)} style={{background:"none",border:"none",cursor:"pointer",color:C.danger,fontSize:14,padding:0}}>×</button>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:8}}>
              <input placeholder="Nueva categoría…" value={newCatInput} onChange={e=>setNewCatInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter") addCategoria();}}
                style={{...inputStyle,flex:1}}/>
              <button onClick={addCategoria} style={btnStyle}>Agregar</button>
            </div>
          </div>
          <div style={{background:"#EEF2FF",borderRadius:8,padding:"10px 14px",fontSize:12,color:C.muted}}>
            💡 Las categorías predeterminadas son: {DEFAULT_CATS.join(", ")}.
          </div>
        </ModalShell>
      )}
    </div>
  );
}
