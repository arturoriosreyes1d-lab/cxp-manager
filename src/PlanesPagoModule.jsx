// ═══════════════════════════════════════════════════════════════════
// PlanesPagoModule — Módulo de planes de pago a proveedores
// ═══════════════════════════════════════════════════════════════════
//
// Vive bajo el módulo "Reportes" (se invoca desde ReportesView.jsx).
// Permite registrar planes de pago a proveedores y dar seguimiento
// a los abonos programados.
//
// Estructura:
//   • Header con KPIs (5 cards clickeables)
//   • Banner de alerta semanal (si hay abonos próximos)
//   • Tabs de filtro: Todos / Activos / Atrasados / Casi listos
//   • Tabla de planes activos
//   • Modales: nuevo plan (3 pasos), detalle de plan, popups de KPIs
//
// Cada empresa tiene SUS PROPIOS planes (filtrados por empresa_id).
// Match con CxP (banner al registrar pago) está en Fase B.
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  fetchInvoices,
  fetchPlanesPago, upsertPlanPago, deletePlanPago, cancelarPlanPago,
  fetchFacturasDePlan, insertPlanFactura,
  fetchAbonosPorPlan, fetchAbonosPorEmpresa, upsertAbono, deleteAbono, bulkInsertAbonos,
  calcularRitmoSemanal,
} from './db.js';

// ─── Paleta y constantes ─────────────────────────────────────────
const C = {
  navy:   '#0F2D4A',
  blue:   '#1565C0',
  blueSoft: '#DBEAFE',
  blueText: '#1E40AF',
  green:  '#16A34A',
  greenSoft: '#D1FAE5',
  greenText: '#065F46',
  warn:   '#D97706',
  warnSoft: '#FEF3C7',
  warnText: '#92400E',
  red:    '#DC2626',
  redSoft: '#FEE2E2',
  redText: '#991B1B',
  muted:  '#64748B',
  slate:  '#475569',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  bgSoft: '#F8FAFC',
  text:   '#0F172A',
  white:  '#FFFFFF',
};

const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
const INTER = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const DIAS_SEMANA = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const DIAS_SEMANA_LARGOS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

// ─── Helpers ─────────────────────────────────────────────────────
const fmt = (n) => {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+n);
};
const fmt0 = (n) => {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(+n);
};
const today = () => new Date().toISOString().split('T')[0];
const parseDate = (s) => { if (!s) return null; return new Date(s + 'T12:00:00'); };
const fmtDateShort = (s) => {
  if (!s) return '';
  const d = parseDate(s);
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d.getDate().toString().padStart(2,'0')} ${meses[d.getMonth()]}`;
};
const fmtDateLabel = (s) => {
  if (!s) return '';
  const d = parseDate(s);
  return `${DIAS_SEMANA[(d.getDay() + 6) % 7]} ${fmtDateShort(s)}`;
};
const fmtDateFull = (s) => {
  if (!s) return '';
  const d = parseDate(s);
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
};
const diasEntre = (s1, s2) => {
  const d1 = parseDate(s1); const d2 = parseDate(s2);
  if (!d1 || !d2) return 0;
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
};
const sumarDias = (fechaStr, dias) => {
  const d = parseDate(fechaStr);
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
};

// Calcula la fecha del próximo "día de la semana" deseado a partir de una fecha
// dado dia 1=Lun..7=Dom; si fechaStr ya es ese día, la devuelve.
const ajustarADiaSemana = (fechaStr, diaDeseado) => {
  if (!diaDeseado) return fechaStr;
  const d = parseDate(fechaStr);
  const diaActual = ((d.getDay() + 6) % 7) + 1; // 1=Lun..7=Dom
  let delta = diaDeseado - diaActual;
  if (delta < 0) delta += 7;
  d.setDate(d.getDate() + delta);
  return d.toISOString().split('T')[0];
};

// Genera los abonos para un plan según su configuración
function generarAbonosDelPlan(config) {
  const { montoTotal, montoAbono, frecuencia, diaSemana, diaMes, fechaInicio } = config;
  if (!montoTotal || !montoAbono || montoAbono <= 0) return [];
  const numCompletos = Math.floor(montoTotal / montoAbono);
  const resto = +(montoTotal - numCompletos * montoAbono).toFixed(2);
  const abonos = [];
  let fechaActual = fechaInicio;
  if (frecuencia === 'semanal' || frecuencia === 'quincenal') {
    if (diaSemana) fechaActual = ajustarADiaSemana(fechaActual, diaSemana);
  }
  const intervaloDias = frecuencia === 'semanal' ? 7 : (frecuencia === 'quincenal' ? 14 : 0);

  for (let i = 0; i < numCompletos; i++) {
    abonos.push({ numero: i + 1, fechaProgramada: fechaActual, montoProgramado: montoAbono, estado: 'pendiente' });
    if (frecuencia === 'mensual') {
      const d = parseDate(fechaActual);
      d.setMonth(d.getMonth() + 1);
      if (diaMes) d.setDate(Math.min(diaMes, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      fechaActual = d.toISOString().split('T')[0];
    } else if (intervaloDias > 0) {
      fechaActual = sumarDias(fechaActual, intervaloDias);
    }
  }
  if (resto > 0.01) {
    abonos.push({ numero: numCompletos + 1, fechaProgramada: fechaActual, montoProgramado: resto, estado: 'pendiente' });
  }
  return abonos;
}

// Recalcula el estado de un abono ('pendiente' → 'atrasado' si la fecha pasó)
function estadoCalculado(abono, hoyStr) {
  if (abono.estado === 'pagado' || abono.estado === 'parcial') return abono.estado;
  if (abono.fechaProgramada < hoyStr) return 'atrasado';
  return 'pendiente';
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════
export default function PlanesPagoModule({ empresaId, user, esConsulta = false }) {
  const [planes, setPlanes] = useState([]);
  const [abonosPorPlan, setAbonosPorPlan] = useState({}); // {planId: [...]}
  const [facturasPorPlan, setFacturasPorPlan] = useState({}); // {planId: [...]}
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [showNuevoPlan, setShowNuevoPlan] = useState(false);
  const [showDetalle, setShowDetalle] = useState(null); // planId
  const [kpiAbierto, setKpiAbierto] = useState(null);   // 'activos' | 'comprometido' | 'ritmo' | 'proximo' | 'atrasados'
  const [alertaCerrada, setAlertaCerrada] = useState(false);

  const hoyStr = today();

  const recargar = useCallback(async () => {
    setLoading(true);
    const ps = await fetchPlanesPago(empresaId);
    setPlanes(ps);
    // Cargar abonos Y facturas de todos los planes en paralelo
    const [abonosEntries, facturasEntries] = await Promise.all([
      Promise.all(ps.map(async p => [p.id, await fetchAbonosPorPlan(p.id)])),
      Promise.all(ps.map(async p => [p.id, await fetchFacturasDePlan(p.id)])),
    ]);
    const mapAbonos = {};
    abonosEntries.forEach(([id, abonos]) => { mapAbonos[id] = abonos; });
    setAbonosPorPlan(mapAbonos);
    const mapFacturas = {};
    facturasEntries.forEach(([id, facturas]) => { mapFacturas[id] = facturas; });
    setFacturasPorPlan(mapFacturas);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { recargar(); }, [recargar]);

  // ─── Métricas derivadas ────────────────────────────────────────
  const planesActivos = useMemo(() => planes.filter(p => p.estado === 'activo'), [planes]);

  const planesConCalculo = useMemo(() => {
    return planes.map(p => {
      const abonos = abonosPorPlan[p.id] || [];
      const facturas = facturasPorPlan[p.id] || [];
      const pagado = abonos
        .filter(a => a.estado === 'pagado' || a.estado === 'parcial')
        .reduce((sum, a) => sum + (+a.montoPagado || +a.montoProgramado || 0), 0);
      const restante = Math.max(0, p.montoTotal - pagado);
      const pct = p.montoTotal > 0 ? Math.round((pagado / p.montoTotal) * 100) : 0;
      // Próximo abono pendiente
      const pendientes = abonos
        .filter(a => a.estado !== 'pagado' && a.estado !== 'parcial')
        .sort((x, y) => x.fechaProgramada.localeCompare(y.fechaProgramada));
      const proximo = pendientes[0] || null;
      const atrasados = abonos.filter(a => estadoCalculado(a, hoyStr) === 'atrasado').length;
      return { ...p, abonos, facturas, pagado, restante, pct, proximo, atrasados };
    });
  }, [planes, abonosPorPlan, facturasPorPlan, hoyStr]);

  // KPIs
  const kpis = useMemo(() => {
    const activos = planesConCalculo.filter(p => p.estado === 'activo');
    // Comprometido por moneda
    const comprometido = { USD: 0, MXN: 0, EUR: 0 };
    activos.forEach(p => {
      const m = p.moneda || 'MXN';
      if (comprometido[m] != null) comprometido[m] += p.restante;
    });
    // Ritmo semanal normalizado
    const ritmo = calcularRitmoSemanal(activos);
    // Próximo pago (más cercano)
    const proximos = activos
      .map(p => p.proximo)
      .filter(Boolean)
      .sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada));
    const proximo = proximos[0] || null;
    const proximosMismoDia = proximos.filter(p => p && proximo && p.fechaProgramada === proximo.fechaProgramada);
    // Atrasados (suma a través de todos los planes)
    const atrasadosCount = activos.reduce((sum, p) => sum + p.atrasados, 0);
    const atrasadosMontoPorMoneda = { USD: 0, MXN: 0, EUR: 0 };
    activos.forEach(p => {
      const m = p.moneda || 'MXN';
      p.abonos.filter(a => estadoCalculado(a, hoyStr) === 'atrasado').forEach(a => {
        if (atrasadosMontoPorMoneda[m] != null) atrasadosMontoPorMoneda[m] += +a.montoProgramado || 0;
      });
    });
    return {
      activosCount: activos.length,
      totalCount: planes.length,
      comprometido,
      ritmo,
      proximo,
      proximosMismoDia,
      atrasadosCount,
      atrasadosMontoPorMoneda,
    };
  }, [planesConCalculo, planes, hoyStr]);

  // Alerta semanal: abonos pendientes/atrasados en próximos 7 días
  const alertaSemanal = useMemo(() => {
    const hasta = sumarDias(hoyStr, 6);
    const items = [];
    const porMoneda = { USD: 0, MXN: 0, EUR: 0 };
    planesConCalculo.forEach(p => {
      if (p.estado !== 'activo') return;
      p.abonos.forEach(a => {
        if (a.estado === 'pagado' || a.estado === 'parcial') return;
        if (a.fechaProgramada >= hoyStr && a.fechaProgramada <= hasta) {
          const m = p.moneda || 'MXN';
          if (porMoneda[m] != null) porMoneda[m] += +a.montoProgramado || 0;
          items.push({ plan: p, abono: a });
        }
      });
    });
    return { count: items.length, porMoneda, items };
  }, [planesConCalculo, hoyStr]);

  // Lista filtrada para la tabla
  const planesFiltrados = useMemo(() => {
    if (filtroEstado === 'todos') return planesConCalculo;
    if (filtroEstado === 'activos') return planesConCalculo.filter(p => p.estado === 'activo' && p.atrasados === 0 && p.pct < 75);
    if (filtroEstado === 'atrasados') return planesConCalculo.filter(p => p.estado === 'activo' && p.atrasados > 0);
    if (filtroEstado === 'casi') return planesConCalculo.filter(p => p.estado === 'activo' && p.pct >= 75);
    return planesConCalculo;
  }, [planesConCalculo, filtroEstado]);

  const planSeleccionado = useMemo(() => {
    if (!showDetalle) return null;
    return planesConCalculo.find(p => p.id === showDetalle) || null;
  }, [showDetalle, planesConCalculo]);

  // ─── Render ────────────────────────────────────────────────────
  if (loading) {
    return <div style={{ fontFamily: INTER, padding: 24, color: C.muted }}>Cargando planes…</div>;
  }

  return (
    <div style={{
      fontFamily: INTER,
      fontSize: 14,
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
      textRendering: 'optimizeLegibility',
    }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.navy }}>📅 Planes de pago</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>
            {planesActivos.length} {planesActivos.length === 1 ? 'plan activo' : 'planes activos'}
          </p>
        </div>
        {!esConsulta && (
          <button
            onClick={() => setShowNuevoPlan(true)}
            style={{
              background: C.navy, color: '#fff', border: 'none', padding: '9px 16px',
              borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >+ Nuevo plan</button>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        <KpiCard
          label="Activos" valueLine1={String(kpis.activosCount)}
          subline={`de ${kpis.totalCount} totales`}
          onClick={() => setKpiAbierto('activos')}
        />
        <KpiCard
          label="Comprometido"
          valueLine1={`$${fmt(kpis.comprometido.USD)} USD`}
          subline={kpis.comprometido.MXN > 0 ? `$${fmt(kpis.comprometido.MXN)} MXN` : null}
          mono
          onClick={() => setKpiAbierto('comprometido')}
        />
        <KpiCard
          label="Ritmo semanal"
          valueLine1={`$${fmt(kpis.ritmo.totales.USD)} USD`}
          subline={kpis.ritmo.totales.MXN > 0 ? `$${fmt(kpis.ritmo.totales.MXN)} MXN` : null}
          mono accent
          onClick={() => setKpiAbierto('ritmo')}
        />
        <KpiCard
          label="Próximo pago"
          valueLine1={kpis.proximo ? fmtDateLabel(kpis.proximo.fechaProgramada) : 'Sin programados'}
          subline={kpis.proximo ? `en ${Math.max(0, diasEntre(hoyStr, kpis.proximo.fechaProgramada))} días · ${kpis.proximosMismoDia.length} abono(s)` : null}
          onClick={() => setKpiAbierto('proximo')}
        />
        <KpiCard
          label="Atrasados" valueLine1={String(kpis.atrasadosCount)}
          subline={kpis.atrasadosMontoPorMoneda.USD > 0 ? `$${fmt(kpis.atrasadosMontoPorMoneda.USD)} USD` :
                   kpis.atrasadosMontoPorMoneda.MXN > 0 ? `$${fmt(kpis.atrasadosMontoPorMoneda.MXN)} MXN` : null}
          warning={kpis.atrasadosCount > 0}
          onClick={() => setKpiAbierto('atrasados')}
        />
      </div>

      {/* ALERTA SEMANAL */}
      {alertaSemanal.count > 0 && !alertaCerrada && (
        <div style={{
          background: C.warnSoft, border: `1px solid ${C.warn}`, borderRadius: 8,
          padding: '10px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ fontSize: 13, color: C.warnText }}>
            <strong>Esta semana:</strong> vencen {alertaSemanal.count} abono(s){' '}
            {alertaSemanal.porMoneda.USD > 0 && <>· <strong>${fmt(alertaSemanal.porMoneda.USD)} USD</strong></>}
            {alertaSemanal.porMoneda.MXN > 0 && <>· <strong>${fmt(alertaSemanal.porMoneda.MXN)} MXN</strong></>}
            {alertaSemanal.porMoneda.EUR > 0 && <>· <strong>${fmt(alertaSemanal.porMoneda.EUR)} EUR</strong></>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setKpiAbierto('proximo')}
              style={{ background: '#fff', border: `1px solid ${C.warn}`, color: C.warnText, padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Ver detalle</button>
            <button onClick={() => setAlertaCerrada(true)} aria-label="Cerrar"
              style={{ background: 'transparent', border: 'none', color: C.warnText, padding: '4px 8px', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>×</button>
          </div>
        </div>
      )}

      {/* TABLA con tabs de filtro */}
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${C.border}`, background: C.bgSoft }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { id: 'todos', label: `Todos (${planesConCalculo.length})` },
              { id: 'activos', label: `Activos (${planesConCalculo.filter(p => p.estado === 'activo' && p.atrasados === 0 && p.pct < 75).length})` },
              { id: 'atrasados', label: `Atrasados (${planesConCalculo.filter(p => p.estado === 'activo' && p.atrasados > 0).length})` },
              { id: 'casi', label: `Casi listos (${planesConCalculo.filter(p => p.estado === 'activo' && p.pct >= 75).length})` },
            ].map(t => (
              <button key={t.id} onClick={() => setFiltroEstado(t.id)}
                style={{
                  background: filtroEstado === t.id ? '#fff' : 'transparent',
                  border: filtroEstado === t.id ? `1px solid ${C.borderStrong}` : '1px solid transparent',
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: filtroEstado === t.id ? 700 : 500,
                  color: filtroEstado === t.id ? C.text : C.muted, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >{t.label}</button>
            ))}
          </div>
        </div>

        {planesFiltrados.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 13 }}>
              {planes.length === 0 ? 'Sin planes registrados todavía.' : 'No hay planes con este filtro.'}
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <Th>Proveedor · Config</Th>
                <Th center>Fact.</Th>
                <Th center>Total</Th>
                <Th center>Pagado</Th>
                <Th center>Restante</Th>
                <Th center>Avance</Th>
                <Th center>Próximo</Th>
                <Th center>Estado</Th>
                <th style={{ width: 26 }}></th>
              </tr>
            </thead>
            <tbody>
              {planesFiltrados.map(p => (
                <PlanRow key={p.id} plan={p} hoyStr={hoyStr} onClick={() => setShowDetalle(p.id)} />
              ))}
            </tbody>
          </table>
        )}

        <div style={{ padding: '8px 14px', background: C.bgSoft, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.muted, display: 'flex', justifyContent: 'space-between' }}>
          <div>Mostrando {planesFiltrados.length} de {planesConCalculo.length}</div>
          <div>Click en una fila para ver el detalle</div>
        </div>
      </div>

      {/* MODALES */}
      {showNuevoPlan && (
        <NuevoPlanModal
          empresaId={empresaId}
          user={user}
          planesExistentes={planes}
          onClose={() => setShowNuevoPlan(false)}
          onCreated={async () => { setShowNuevoPlan(false); await recargar(); }}
        />
      )}

      {planSeleccionado && (
        <DetallePlanModal
          plan={planSeleccionado}
          user={user}
          esConsulta={esConsulta}
          onClose={() => setShowDetalle(null)}
          onAccion={async () => { await recargar(); }}
        />
      )}

      {kpiAbierto === 'activos' && <PopupActivos planes={planesConCalculo} onClose={() => setKpiAbierto(null)} onAbrirPlan={(id) => { setKpiAbierto(null); setShowDetalle(id); }} />}
      {kpiAbierto === 'comprometido' && <PopupComprometido planes={planesConCalculo} onClose={() => setKpiAbierto(null)} onAbrirPlan={(id) => { setKpiAbierto(null); setShowDetalle(id); }} />}
      {kpiAbierto === 'ritmo' && <PopupRitmo ritmo={kpis.ritmo} onClose={() => setKpiAbierto(null)} />}
      {kpiAbierto === 'proximo' && <PopupProximos planes={planesConCalculo} hoyStr={hoyStr} onClose={() => setKpiAbierto(null)} onAbrirPlan={(id) => { setKpiAbierto(null); setShowDetalle(id); }} />}
      {kpiAbierto === 'atrasados' && <PopupAtrasados planes={planesConCalculo} hoyStr={hoyStr} onClose={() => setKpiAbierto(null)} onAbrirPlan={(id) => { setKpiAbierto(null); setShowDetalle(id); }} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sub-componentes
// ═══════════════════════════════════════════════════════════════════

function KpiCard({ label, valueLine1, subline, mono, accent, warning, onClick }) {
  const bg = accent ? C.blueSoft : (warning ? C.warnSoft : '#fff');
  const borderColor = accent ? C.blue : (warning ? C.warn : C.border);
  const labelColor = accent ? C.blueText : (warning ? C.warnText : C.muted);
  return (
    <button onClick={onClick} style={{
      all: 'unset',
      cursor: 'pointer',
      background: bg,
      border: `${accent ? '1.5' : '1'}px solid ${borderColor}`,
      borderRadius: 8,
      padding: '12px 14px',
      display: 'block',
      transition: 'transform 0.1s, box-shadow 0.15s',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.06)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 10, color: labelColor, letterSpacing: 0.5, fontWeight: accent ? 700 : 600, textTransform: 'uppercase' }}>{label}</div>
        <span style={{ fontSize: 10, color: labelColor, opacity: 0.7 }}>↗</span>
      </div>
      <div style={{
        fontSize: valueLine1.length > 12 ? 14 : 18,
        fontWeight: 700, marginTop: 4,
        fontFamily: mono ? MONO : 'inherit',
        fontVariantNumeric: 'tabular-nums',
        color: warning ? C.warnText : (accent ? C.blueText : C.text),
      }}>{valueLine1}</div>
      {subline && <div style={{ fontSize: 11, color: labelColor, marginTop: 1, fontFamily: mono ? MONO : 'inherit', fontVariantNumeric: 'tabular-nums' }}>{subline}</div>}
    </button>
  );
}

function Th({ children, right, center }) {
  return (
    <th style={{
      textAlign: right ? 'right' : (center ? 'center' : 'left'),
      padding: '10px 14px', fontWeight: 600,
      color: C.muted, fontSize: 11, letterSpacing: 0.5,
      textTransform: 'uppercase',
    }}>{children}</th>
  );
}

function PlanRow({ plan, hoyStr, onClick }) {
  const isAtrasado = plan.atrasados > 0;
  const isCasiListo = plan.pct >= 75 && plan.estado === 'activo';
  const barColor = isAtrasado ? C.warn : (isCasiListo ? C.green : C.blue);
  const bgFila = isAtrasado ? C.warnSoft : 'transparent';
  return (
    <tr onClick={onClick} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: bgFila }}>
      <td style={{ padding: '11px 14px' }}>
        <div style={{ fontWeight: 600, color: C.text }}>{plan.proveedor}</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
          {plan.frecuencia === 'semanal' && plan.diaSemana && `Semanal · ${DIAS_SEMANA_LARGOS[plan.diaSemana - 1]?.toLowerCase()}`}
          {plan.frecuencia === 'quincenal' && plan.diaSemana && `Quincenal · ${DIAS_SEMANA_LARGOS[plan.diaSemana - 1]?.toLowerCase()}`}
          {plan.frecuencia === 'mensual' && plan.diaMes && `Mensual · día ${plan.diaMes}`}
          {plan.frecuencia === 'personalizado' && 'Personalizado'}
          {' · '}{plan.moneda}
        </div>
      </td>
      <td style={{ textAlign: 'center', padding: '11px 8px', fontWeight: 600 }}>{(plan.facturas || []).length || '—'}</td>
      <td style={{ textAlign: 'center', padding: '11px 8px', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>${fmt(plan.montoTotal)}</td>
      <td style={{ textAlign: 'center', padding: '11px 8px', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color: plan.pagado > 0 ? C.green : C.muted }}>${fmt(plan.pagado)}</td>
      <td style={{ textAlign: 'center', padding: '11px 8px', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>${fmt(plan.restante)}</td>
      <td style={{ padding: '11px 14px', minWidth: 140 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 5, background: C.bgSoft, borderRadius: 999, overflow: 'hidden', minWidth: 50 }}>
            <div style={{ width: `${Math.min(100, plan.pct)}%`, height: '100%', background: barColor, transition: 'width 0.3s' }}/>
          </div>
          <span style={{ fontSize: 12, color: isCasiListo ? C.green : (isAtrasado ? C.warnText : C.muted), fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'right', fontWeight: isCasiListo ? 700 : 500 }}>{plan.pct}%</span>
        </div>
      </td>
      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
        {plan.proximo ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{fmtDateLabel(plan.proximo.fechaProgramada)}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
              {(() => {
                const dias = diasEntre(hoyStr, plan.proximo.fechaProgramada);
                if (dias < 0) return <span style={{ color: C.warnText }}>{Math.abs(dias)} días vencido</span>;
                if (dias === 0) return 'hoy';
                return `en ${dias} días · $${fmt(plan.proximo.montoProgramado)}`;
              })()}
            </div>
          </>
        ) : <span style={{ fontSize: 12, color: C.muted }}>—</span>}
      </td>
      <td style={{ textAlign: 'center', padding: '11px 14px' }}>
        {plan.estado === 'liquidado' ? <Badge bg={C.greenSoft} color={C.greenText}>Liquidado</Badge> :
         plan.estado === 'cancelado' ? <Badge bg="#F3F4F6" color={C.muted}>Cancelado</Badge> :
         isAtrasado ? <Badge bg={C.warn} color="#fff">Atrasado</Badge> :
         isCasiListo ? <Badge bg={C.greenSoft} color={C.greenText}>Casi listo</Badge> :
         <Badge bg={C.blueSoft} color={C.blueText}>Activo</Badge>}
      </td>
      <td style={{ textAlign: 'center', color: C.muted }}>›</td>
    </tr>
  );
}

function Badge({ children, bg, color }) {
  return <span style={{ padding: '3px 9px', background: bg, color, borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>{children}</span>;
}

// ═══════════════════════════════════════════════════════════════════
// MODAL: Nuevo Plan (3 pasos)
// ═══════════════════════════════════════════════════════════════════
function NuevoPlanModal({ empresaId, user, planesExistentes, onClose, onCreated }) {
  const [paso, setPaso] = useState(1);
  const [loadingFacturas, setLoadingFacturas] = useState(false);
  const [todasFacturas, setTodasFacturas] = useState({ MXN: [], USD: [], EUR: [] });
  // Paso 1: proveedor seleccionado
  const [proveedorSel, setProveedorSel] = useState(null);
  const [search, setSearch] = useState('');
  // Paso 2: facturas
  const [facturasSeleccionadas, setFacturasSeleccionadas] = useState(new Set());
  // Paso 3: configuración
  const [frecuencia, setFrecuencia] = useState('semanal');
  const [diaSemana, setDiaSemana] = useState(5); // viernes default
  const [diaMes, setDiaMes] = useState(1);
  const [fechaInicio, setFechaInicio] = useState(today());
  const [montoAbono, setMontoAbono] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Cargar facturas de la empresa al abrir modal
  useEffect(() => {
    (async () => {
      setLoadingFacturas(true);
      try {
        // fetchInvoices ya devuelve agrupado por moneda: {MXN: [], USD: [], EUR: []}
        const grouped = await fetchInvoices(empresaId);
        setTodasFacturas(grouped || { MXN: [], USD: [], EUR: [] });
      } catch (e) {
        console.error('Cargando facturas:', e);
      } finally {
        setLoadingFacturas(false);
      }
    })();
  }, [empresaId]);

  // Agrupación: proveedores con facturas activas + saldo
  const proveedoresConFacturas = useMemo(() => {
    const map = {};
    ['MXN', 'USD', 'EUR'].forEach(mon => {
      (todasFacturas[mon] || []).forEach(inv => {
        const saldo = (+inv.total || 0) - (+inv.montoPagado || 0);
        if (saldo <= 0.01) return; // solo pendientes
        if (inv.estatus === 'Pagada') return;
        const key = inv.proveedor || '(sin proveedor)';
        if (!map[key]) map[key] = { proveedor: key, facturas: [], totalPorMoneda: { MXN: 0, USD: 0, EUR: 0 } };
        map[key].facturas.push({ ...inv, moneda: mon, saldo });
        map[key].totalPorMoneda[mon] += saldo;
      });
    });
    let lista = Object.values(map);
    if (search.trim()) {
      const q = search.toLowerCase();
      lista = lista.filter(p => p.proveedor.toLowerCase().includes(q));
    }
    // Ordenar por saldo total descendente (suma de todas las monedas, USD-equivalent simplificado)
    lista.sort((a, b) => {
      const sa = a.totalPorMoneda.USD * 18 + a.totalPorMoneda.MXN + a.totalPorMoneda.EUR * 19;
      const sb = b.totalPorMoneda.USD * 18 + b.totalPorMoneda.MXN + b.totalPorMoneda.EUR * 19;
      return sb - sa;
    });
    return lista;
  }, [todasFacturas, search]);

  const facturasDelProveedor = useMemo(() => {
    if (!proveedorSel) return [];
    return proveedorSel.facturas;
  }, [proveedorSel]);

  // Validación de moneda al seleccionar
  const monedasSeleccionadas = useMemo(() => {
    const set = new Set();
    facturasDelProveedor.forEach(f => { if (facturasSeleccionadas.has(f.id)) set.add(f.moneda); });
    return [...set];
  }, [facturasDelProveedor, facturasSeleccionadas]);

  const montoTotalSeleccionado = useMemo(() => {
    return facturasDelProveedor
      .filter(f => facturasSeleccionadas.has(f.id))
      .reduce((sum, f) => sum + f.saldo, 0);
  }, [facturasDelProveedor, facturasSeleccionadas]);

  const monedaPlan = monedasSeleccionadas[0] || null;
  const monedaInvalida = monedasSeleccionadas.length > 1;

  // Preview de abonos
  const abonosPreview = useMemo(() => {
    if (paso !== 3) return [];
    const monto = parseFloat(montoAbono) || 0;
    if (monto <= 0 || montoTotalSeleccionado <= 0) return [];
    return generarAbonosDelPlan({
      montoTotal: montoTotalSeleccionado,
      montoAbono: monto,
      frecuencia,
      diaSemana: (frecuencia === 'semanal' || frecuencia === 'quincenal') ? diaSemana : null,
      diaMes: frecuencia === 'mensual' ? diaMes : null,
      fechaInicio,
    });
  }, [paso, montoAbono, montoTotalSeleccionado, frecuencia, diaSemana, diaMes, fechaInicio]);

  const fechaLiquidacionEstimada = useMemo(() => {
    if (abonosPreview.length === 0) return null;
    return abonosPreview[abonosPreview.length - 1].fechaProgramada;
  }, [abonosPreview]);

  const handleCrear = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      const planId = await upsertPlanPago({
        empresaId,
        proveedor: proveedorSel.proveedor,
        moneda: monedaPlan,
        montoTotal: montoTotalSeleccionado,
        frecuencia,
        diaSemana: (frecuencia === 'semanal' || frecuencia === 'quincenal') ? diaSemana : null,
        diaMes: frecuencia === 'mensual' ? diaMes : null,
        montoAbono: parseFloat(montoAbono),
        numAbonos: abonosPreview.length,
        fechaInicio,
        fechaLiquidacionEstimada,
        estado: 'activo',
      }, user?.nombre);
      if (!planId) throw new Error('No se pudo crear el plan');

      // Insertar facturas
      const facturasParaInsertar = facturasDelProveedor.filter(f => facturasSeleccionadas.has(f.id));
      for (const f of facturasParaInsertar) {
        await insertPlanFactura({
          planId, empresaId, invoiceId: String(f.id),
          montoInicial: f.saldo, montoAplicado: 0,
        }, user?.nombre);
      }

      // Bulk insert abonos
      const abonosFinal = abonosPreview.map(a => ({
        planId, empresaId,
        numero: a.numero,
        fechaProgramada: a.fechaProgramada,
        montoProgramado: a.montoProgramado,
        estado: 'pendiente',
      }));
      await bulkInsertAbonos(abonosFinal, user?.nombre);

      await onCreated();
    } catch (err) {
      console.error('Crear plan:', err);
      alert('No se pudo crear el plan. Revisa la consola.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalShell onClose={onClose} maxWidth={680}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 0.5, fontWeight: 700 }}>PASO {paso} DE 3</div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: '4px 0 0' }}>
            {paso === 1 ? 'Selecciona el proveedor' : paso === 2 ? 'Facturas a incluir' : 'Configurar los abonos'}
          </h3>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
      </div>

      {paso === 1 && (
        <>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar proveedor…"
            style={{ width: '100%', border: `1px solid ${C.border}`, padding: '8px 10px', borderRadius: 6, fontSize: 13, marginBottom: 10, fontFamily: 'inherit' }}
          />
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 0.4, marginBottom: 6, fontWeight: 600 }}>CON FACTURAS PENDIENTES</div>
          {loadingFacturas ? (
            <div style={{ padding: 30, textAlign: 'center', color: C.muted, fontSize: 13 }}>Cargando facturas…</div>
          ) : proveedoresConFacturas.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: C.muted, fontSize: 13 }}>No hay proveedores con facturas pendientes.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
              {proveedoresConFacturas.map(p => {
                const sel = proveedorSel?.proveedor === p.proveedor;
                return (
                  <button key={p.proveedor} onClick={() => { setProveedorSel(p); setFacturasSeleccionadas(new Set()); }}
                    style={{
                      all: 'unset', cursor: 'pointer',
                      padding: '10px 12px',
                      background: sel ? C.blueSoft : C.bgSoft,
                      border: sel ? `1px solid ${C.blue}` : `1px solid transparent`,
                      borderRadius: 6, display: 'block',
                    }}>
                    <div style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: sel ? C.blueText : C.text }}>{p.proveedor}</div>
                    <div style={{ fontSize: 11, color: sel ? C.blueText : C.muted, opacity: 0.85, marginTop: 2 }}>
                      {p.facturas.length} facturas
                      {p.totalPorMoneda.USD > 0 && ` · $${fmt(p.totalPorMoneda.USD)} USD`}
                      {p.totalPorMoneda.MXN > 0 && ` · $${fmt(p.totalPorMoneda.MXN)} MXN`}
                      {p.totalPorMoneda.EUR > 0 && ` · $${fmt(p.totalPorMoneda.EUR)} EUR`}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <ModalFooter
            leftBtn={<button onClick={onClose} style={btnStyle()}>Cancelar</button>}
            rightBtn={
              <button disabled={!proveedorSel} onClick={() => setPaso(2)} style={btnStyle(!!proveedorSel ? 'primary' : 'disabled')}>
                Siguiente →
              </button>
            }
          />
        </>
      )}

      {paso === 2 && proveedorSel && (
        <>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>{proveedorSel.proveedor} · selecciona cuáles cubrirá el plan</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {facturasDelProveedor.map(f => {
              const sel = facturasSeleccionadas.has(f.id);
              return (
                <label key={f.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px',
                  background: sel ? C.blueSoft : C.bgSoft,
                  border: sel ? `1px solid ${C.blue}` : `1px solid transparent`,
                  borderRadius: 6, cursor: 'pointer',
                }}>
                  <input type="checkbox" checked={sel} onChange={() => {
                    const ns = new Set(facturasSeleccionadas);
                    if (sel) ns.delete(f.id); else ns.add(f.id);
                    setFacturasSeleccionadas(ns);
                  }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{f.folio || f.uuid?.slice(0, 8) || f.id?.slice(0, 8)}</span>
                      <span style={{ fontSize: 12, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{f.moneda} ${fmt(f.saldo)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      {f.concepto || f.clasificacion || '—'} {f.fecha && `· ${fmtDateShort(f.fecha)}`}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {monedaInvalida && (
            <div style={{ background: C.redSoft, border: `1px solid ${C.red}`, borderRadius: 6, padding: '8px 10px', marginTop: 10, fontSize: 11, color: C.redText }}>
              ⚠ Las facturas deben ser de la misma moneda. Tienes: {monedasSeleccionadas.join(' + ')}.
            </div>
          )}

          <div style={{ marginTop: 12, padding: '10px 12px', background: C.bgSoft, borderRadius: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted }}>
              <span>Seleccionadas</span><span style={{ fontWeight: 700, color: C.text }}>{facturasSeleccionadas.size} factura(s)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
              <span style={{ fontWeight: 700 }}>Total del plan</span>
              <span style={{ fontWeight: 700, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>${fmt(montoTotalSeleccionado)} {monedaPlan || ''}</span>
            </div>
          </div>

          <ModalFooter
            leftBtn={<button onClick={() => setPaso(1)} style={btnStyle()}>← Atrás</button>}
            rightBtn={
              <button
                disabled={facturasSeleccionadas.size === 0 || monedaInvalida}
                onClick={() => setPaso(3)}
                style={btnStyle((facturasSeleccionadas.size > 0 && !monedaInvalida) ? 'primary' : 'disabled')}
              >Siguiente →</button>
            }
          />
        </>
      )}

      {paso === 3 && (
        <>
          <div style={{ padding: '8px 12px', background: C.bgSoft, borderRadius: 6, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: C.muted }}>Total a programar</span>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>${fmt(montoTotalSeleccionado)} {monedaPlan}</span>
          </div>

          <div style={{ marginBottom: 10 }}>
            <Label>Frecuencia</Label>
            <select value={frecuencia} onChange={e => setFrecuencia(e.target.value)} style={selectStyle()}>
              <option value="semanal">Semanal</option>
              <option value="quincenal">Quincenal</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {(frecuencia === 'semanal' || frecuencia === 'quincenal') && (
              <div>
                <Label>Día de la semana</Label>
                <select value={diaSemana} onChange={e => setDiaSemana(+e.target.value)} style={selectStyle()}>
                  {DIAS_SEMANA_LARGOS.map((d, i) => <option key={i} value={i + 1}>{d}</option>)}
                </select>
              </div>
            )}
            {frecuencia === 'mensual' && (
              <div>
                <Label>Día del mes</Label>
                <input type="number" min={1} max={31} value={diaMes} onChange={e => setDiaMes(+e.target.value)} style={inputStyle()}/>
              </div>
            )}
            <div>
              <Label>Inicio</Label>
              <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} style={inputStyle()}/>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <Label>Monto del abono</Label>
            <input value={montoAbono} onChange={e => setMontoAbono(e.target.value.replace(/[^\d.]/g, ''))} placeholder="2000" style={{ ...inputStyle(), fontFamily: MONO }}/>
            {parseFloat(montoAbono) > 0 && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>${fmt(parseFloat(montoAbono))} {monedaPlan} por abono</div>
            )}
          </div>

          {abonosPreview.length > 0 && (
            <div style={{ background: C.blueSoft, border: `1px solid ${C.blue}`, borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: C.blueText, letterSpacing: 0.4, fontWeight: 700, marginBottom: 4 }}>PREVIEW</div>
              <div style={{ fontSize: 12, color: C.blueText }}>
                <strong>{abonosPreview.length} abono(s)</strong> · primer pago <strong>{fmtDateLabel(abonosPreview[0].fechaProgramada)}</strong> · liquidación <strong>{fmtDateFull(fechaLiquidacionEstimada)}</strong>
              </div>
              {abonosPreview.length > 1 && abonosPreview[abonosPreview.length - 1].montoProgramado !== abonosPreview[0].montoProgramado && (
                <div style={{ fontSize: 11, color: C.blueText, opacity: 0.85, marginTop: 3 }}>
                  {abonosPreview.length - 1} abonos de ${fmt(abonosPreview[0].montoProgramado)} + 1 último de ${fmt(abonosPreview[abonosPreview.length - 1].montoProgramado)}
                </div>
              )}
            </div>
          )}

          <ModalFooter
            leftBtn={<button onClick={() => setPaso(2)} style={btnStyle()} disabled={guardando}>← Atrás</button>}
            rightBtn={
              <button onClick={handleCrear} disabled={!abonosPreview.length || guardando} style={btnStyle(abonosPreview.length > 0 && !guardando ? 'success' : 'disabled')}>
                {guardando ? 'Creando…' : '✓ Crear plan'}
              </button>
            }
          />
        </>
      )}
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MODAL: Detalle del plan
// ═══════════════════════════════════════════════════════════════════
function DetallePlanModal({ plan, user, esConsulta, onClose, onAccion }) {
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Recorrer abonos con saldo restante post-cada-uno
  const abonosConSaldo = useMemo(() => {
    let pagAcum = 0;
    return (plan.abonos || []).map(a => {
      if (a.estado === 'pagado' || a.estado === 'parcial') pagAcum += (+a.montoPagado || +a.montoProgramado || 0);
      return { ...a, restanteDespues: Math.max(0, plan.montoTotal - pagAcum) };
    });
  }, [plan]);

  const handleCancelar = async () => {
    await cancelarPlanPago(plan.id, user?.nombre);
    setConfirmCancel(false);
    await onAccion();
    onClose();
  };

  return (
    <ModalShell onClose={onClose} maxWidth="94vw" maxHeight="92vh">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: C.navy, margin: 0 }}>📋 {plan.proveedor}</h3>
          <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>
            Plan {plan.frecuencia}
            {(plan.frecuencia === 'semanal' || plan.frecuencia === 'quincenal') && plan.diaSemana && ` · ${DIAS_SEMANA_LARGOS[plan.diaSemana - 1]?.toLowerCase()}`}
            {plan.frecuencia === 'mensual' && plan.diaMes && ` · día ${plan.diaMes}`}
            {' · iniciado '}{fmtDateFull(plan.fechaInicio)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!esConsulta && plan.estado === 'activo' && (
            <button onClick={() => setConfirmCancel(true)} title="Cancelar plan"
              style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.redText, padding: '5px 9px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>⛔ Cancelar plan</button>
          )}
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
        </div>
      </div>

      {confirmCancel && (
        <div style={{ background: C.redSoft, border: `1px solid ${C.red}`, borderRadius: 6, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: C.redText, marginBottom: 8 }}>
            ¿Cancelar el plan? Los abonos pendientes quedarán archivados y el plan no aparecerá en vistas activas.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleCancelar} style={{ background: C.red, color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Sí, cancelar</button>
            <button onClick={() => setConfirmCancel(false)} style={btnStyle()}>No, volver</button>
          </div>
        </div>
      )}

      {/* KPIs del plan */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        <MiniKpi label="Total" value={`$${fmt(plan.montoTotal)}`} sub={plan.moneda}/>
        <MiniKpi label="Pagado" value={`$${fmt(plan.pagado)}`} sub={`${plan.pct}%`} color={C.green}/>
        <MiniKpi label="Restante" value={`$${fmt(plan.restante)}`} sub={`${plan.abonos.filter(a => a.estado !== 'pagado').length} abonos`}/>
        <MiniKpi label="Liquida" value={fmtDateFull(plan.fechaLiquidacionEstimada)} accent/>
      </div>

      {/* Tabla de abonos */}
      <div style={{ marginBottom: 8, fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 0.4 }}>ABONOS PROGRAMADOS</div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden', maxHeight: 380, overflowY: 'auto' }}>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead style={{ background: C.bgSoft, position: 'sticky', top: 0 }}>
            <tr>
              <th style={{ textAlign: 'center', padding: '10px 10px', fontWeight: 600, fontSize: 11, color: C.muted, letterSpacing: 0.4 }}>#</th>
              <th style={{ textAlign: 'center', padding: '10px 10px', fontWeight: 600, fontSize: 11, color: C.muted, letterSpacing: 0.4 }}>FECHA</th>
              <th style={{ textAlign: 'center', padding: '10px 10px', fontWeight: 600, fontSize: 11, color: C.muted, letterSpacing: 0.4 }}>ABONO</th>
              <th style={{ textAlign: 'center', padding: '10px 10px', fontWeight: 600, fontSize: 11, color: C.muted, letterSpacing: 0.4 }}>RESTANTE</th>
              <th style={{ textAlign: 'center', padding: '10px 10px', fontWeight: 600, fontSize: 11, color: C.muted, letterSpacing: 0.4 }}>ESTADO</th>
            </tr>
          </thead>
          <tbody>
            {abonosConSaldo.map(a => {
              const estCalc = estadoCalculado(a, today());
              const isPagado = a.estado === 'pagado' || a.estado === 'parcial';
              return (
                <tr key={a.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: '8px 10px', color: C.muted, textAlign: 'center' }}>{a.numero}</td>
                  <td style={{ padding: '8px 10px', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>{fmtDateLabel(a.fechaProgramada)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>${fmt(a.montoProgramado)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color: C.muted }}>${fmt(a.restanteDespues)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    {isPagado ? <Badge bg={C.greenSoft} color={C.greenText}>✓ Pagado</Badge> :
                     estCalc === 'atrasado' ? <Badge bg={C.warnSoft} color={C.warnText}>Atrasado</Badge> :
                     <Badge bg={C.blueSoft} color={C.blueText}>Pendiente</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: C.muted, padding: '10px 12px', background: C.bgSoft, borderRadius: 6 }}>
        💡 El match automático con pagos de CxP estará disponible en la próxima actualización. Por ahora los abonos se marcan como pagados desde aquí (función próximamente).
      </div>
    </ModalShell>
  );
}

function MiniKpi({ label, value, sub, color, accent }) {
  const bg = accent ? C.blueSoft : C.bgSoft;
  const labelColor = accent ? C.blueText : C.muted;
  return (
    <div style={{ background: bg, borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: labelColor, letterSpacing: 0.4, fontWeight: 600 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color: color || (accent ? C.blueText : C.text) }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: labelColor, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Popups de KPIs
// ═══════════════════════════════════════════════════════════════════
function PopupActivos({ planes, onClose, onAbrirPlan }) {
  const activos = planes.filter(p => p.estado === 'activo');
  return (
    <ModalShell onClose={onClose} maxWidth={680}>
      <PopupHeader label="DESGLOSE" title="Planes activos" onClose={onClose}/>
      {activos.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>Sin planes activos.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
          {activos.map(p => (
            <button key={p.id} onClick={() => onAbrirPlan(p.id)}
              style={{ all: 'unset', cursor: 'pointer', padding: '10px 12px', background: C.bgSoft, borderRadius: 6, border: `1px solid ${C.border}`, display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{p.proveedor}</span>
                <span style={{ fontSize: 11, color: C.muted, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>${fmt(p.restante)} {p.moneda}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <div style={{ flex: 1, height: 4, background: '#fff', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${p.pct}%`, height: '100%', background: p.pct >= 75 ? C.green : C.blue }}/>
                </div>
                <span style={{ fontSize: 10, color: C.muted, fontVariantNumeric: 'tabular-nums', minWidth: 28, textAlign: 'right' }}>{p.pct}%</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

function PopupComprometido({ planes, onClose, onAbrirPlan }) {
  const activos = planes.filter(p => p.estado === 'activo');
  const grupos = { USD: [], MXN: [], EUR: [] };
  activos.forEach(p => { if (grupos[p.moneda]) grupos[p.moneda].push(p); });

  return (
    <ModalShell onClose={onClose} maxWidth={680}>
      <PopupHeader label="DESGLOSE" title="Comprometido por moneda" onClose={onClose}/>
      {['USD', 'MXN', 'EUR'].map(mon => {
        if (grupos[mon].length === 0) return null;
        const total = grupos[mon].reduce((s, p) => s + p.restante, 0);
        return (
          <div key={mon} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 0.4, fontWeight: 700, marginBottom: 6 }}>{mon}</div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <tbody>
                {grupos[mon].map(p => (
                  <tr key={p.id} onClick={() => onAbrirPlan(p.id)} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                    <td style={{ padding: '6px 0', color: C.text }}>{p.proveedor}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>${fmt(p.restante)}</td>
                  </tr>
                ))}
                <tr style={{ background: C.blueSoft }}>
                  <td style={{ padding: '7px 6px', fontWeight: 700, color: C.blueText }}>Total {mon}</td>
                  <td style={{ padding: '7px 0', textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: C.blueText }}>${fmt(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </ModalShell>
  );
}

function PopupRitmo({ ritmo, onClose }) {
  const porMoneda = { USD: [], MXN: [], EUR: [] };
  (ritmo.detalle || []).forEach(d => {
    if (porMoneda[d.moneda]) porMoneda[d.moneda].push(d);
  });
  return (
    <ModalShell onClose={onClose} maxWidth={680}>
      <PopupHeader label="DESGLOSE" title="Ritmo semanal por plan" subtitle="Compromiso normalizado a base semanal" onClose={onClose}/>
      {['USD', 'MXN', 'EUR'].map(mon => {
        if (porMoneda[mon].length === 0) return null;
        return (
          <div key={mon} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 0.4, fontWeight: 700, marginBottom: 6 }}>{mon}</div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <tbody>
                {porMoneda[mon].map((d, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '6px 0', color: C.text }}>{d.proveedor}</td>
                    <td style={{ padding: '6px 6px', color: C.muted, fontSize: 10, textAlign: 'center' }}>
                      {d.frecuencia} · ${fmt(d.montoAbono)}
                    </td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>${fmt(d.aporteSemanal)}</td>
                  </tr>
                ))}
                <tr style={{ background: C.blueSoft }}>
                  <td style={{ padding: '7px 6px', fontWeight: 700, color: C.blueText }}>Total semanal {mon}</td>
                  <td></td>
                  <td style={{ padding: '7px 0', textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: C.blueText }}>${fmt(ritmo.totales[mon])}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
      <div style={{ fontSize: 10, color: C.muted, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, lineHeight: 1.5 }}>
        Quincenal = abono ÷ 2 · Mensual = abono ÷ 4.33 · Solo cuenta planes activos
      </div>
    </ModalShell>
  );
}

function PopupProximos({ planes, hoyStr, onClose, onAbrirPlan }) {
  const proximos = [];
  planes.forEach(p => {
    if (p.estado !== 'activo') return;
    p.abonos.forEach(a => {
      if (a.estado === 'pagado' || a.estado === 'parcial') return;
      if (a.fechaProgramada >= hoyStr) proximos.push({ plan: p, abono: a });
    });
  });
  proximos.sort((a, b) => a.abono.fechaProgramada.localeCompare(b.abono.fechaProgramada));
  const primeros = proximos.slice(0, 10);

  return (
    <ModalShell onClose={onClose} maxWidth={680}>
      <PopupHeader label="DESGLOSE" title="Próximos abonos" subtitle={`Próximos ${primeros.length} pagos en orden cronológico`} onClose={onClose}/>
      {primeros.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>Sin pagos próximos.</div>
      ) : (
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <tbody>
            {primeros.map((it, i) => {
              const dias = diasEntre(hoyStr, it.abono.fechaProgramada);
              return (
                <tr key={i} onClick={() => onAbrirPlan(it.plan.id)} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                  <td style={{ padding: '8px 6px 8px 0', fontFamily: MONO, fontSize: 11, width: 90 }}>{fmtDateLabel(it.abono.fechaProgramada)}</td>
                  <td style={{ padding: '8px 6px', color: C.muted, fontSize: 10, width: 60, textAlign: 'center' }}>{dias === 0 ? 'hoy' : `en ${dias}d`}</td>
                  <td style={{ padding: '8px 6px', color: C.text }}>{it.plan.proveedor}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>${fmt(it.abono.montoProgramado)} {it.plan.moneda}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </ModalShell>
  );
}

function PopupAtrasados({ planes, hoyStr, onClose, onAbrirPlan }) {
  const atrasados = [];
  planes.forEach(p => {
    if (p.estado !== 'activo') return;
    p.abonos.forEach(a => {
      if (estadoCalculado(a, hoyStr) === 'atrasado') atrasados.push({ plan: p, abono: a });
    });
  });
  atrasados.sort((a, b) => a.abono.fechaProgramada.localeCompare(b.abono.fechaProgramada));

  return (
    <ModalShell onClose={onClose} maxWidth={680}>
      <PopupHeader label="DESGLOSE" title="Abonos atrasados" subtitle={`${atrasados.length} pago(s) vencidos sin marcar`} onClose={onClose}/>
      {atrasados.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.green, fontSize: 13 }}>🎉 Todo al día, sin atrasos.</div>
      ) : (
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <tbody>
            {atrasados.map((it, i) => {
              const dias = Math.abs(diasEntre(hoyStr, it.abono.fechaProgramada));
              return (
                <tr key={i} onClick={() => onAbrirPlan(it.plan.id)} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: i % 2 ? C.warnSoft : '#fff' }}>
                  <td style={{ padding: '8px 6px 8px 0', fontFamily: MONO, fontSize: 11, width: 90, color: C.warnText }}>{fmtDateLabel(it.abono.fechaProgramada)}</td>
                  <td style={{ padding: '8px 6px', color: C.warnText, fontSize: 10, width: 80, textAlign: 'center', fontWeight: 700 }}>{dias}d vencido</td>
                  <td style={{ padding: '8px 6px', color: C.text }}>{it.plan.proveedor}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: C.warnText }}>${fmt(it.abono.montoProgramado)} {it.plan.moneda}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </ModalShell>
  );
}

function PopupHeader({ label, title, subtitle, onClose }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
      <div>
        <div style={{ fontSize: 10, color: C.blueText, letterSpacing: 0.5, fontWeight: 700 }}>{label}</div>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: '4px 0 0' }}>{title}</h3>
        {subtitle && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Shell genérico para modales
// ═══════════════════════════════════════════════════════════════════
function ModalShell({ onClose, maxWidth = 460, maxHeight, children }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15,23,42,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 20,
      fontFamily: INTER,
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 12, padding: 22,
        maxWidth, width: '100%',
        maxHeight: maxHeight || '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ leftBtn, rightBtn }) {
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      {leftBtn || <span></span>}
      {rightBtn}
    </div>
  );
}

function Label({ children }) {
  return <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4, fontWeight: 600 }}>{children}</label>;
}

function inputStyle() {
  return { width: '100%', border: `1px solid ${C.border}`, padding: '8px 10px', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' };
}
function selectStyle() {
  return { width: '100%', border: `1px solid ${C.border}`, padding: '8px 10px', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', background: '#fff', cursor: 'pointer' };
}
function btnStyle(variant) {
  const base = { padding: '8px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
  if (variant === 'primary')  return { ...base, background: C.navy,  color: '#fff', border: 'none' };
  if (variant === 'success')  return { ...base, background: C.green, color: '#fff', border: 'none' };
  if (variant === 'disabled') return { ...base, background: '#9CA3AF', color: '#fff', border: 'none', cursor: 'not-allowed' };
  return { ...base, background: '#fff', color: C.text, border: `1px solid ${C.border}` };
}
