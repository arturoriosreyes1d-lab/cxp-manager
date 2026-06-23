// ═══════════════════════════════════════════════════════════════════
// FactorajeModule — Simulador de factoraje
// ═══════════════════════════════════════════════════════════════════
// Pantalla completa para evaluar ofertas de factoraje sobre la cartera
// CxC de TAS (empresa_2). Calcula 3 escenarios (conservador/esperado/
// agresivo) y muestra:
//   - Selector de facturas
//   - Parámetros configurables (tasa, anticipo, plazo, comisión, retención)
//   - Resultado en vivo por moneda (MXN/USD/EUR)
//   - 3 escenarios lado a lado
//   - Flujo proyectado 8 semanas
//   - Guardar simulación + Exportar a Excel + Historial
//
// Props:
//   onBack       — volver a Reportes
//   ingresos     — array de facturas activas (con saldo>0)
//   empresaId    — 'empresa_2'
//   usuario      — username actual (para auditoría)
//   diasDiff     — fn (fechaVenc) => número de días vencido (heredada de CxcView)
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useMemo, useEffect, useRef } from 'react';
import ExcelJS from 'exceljs';
import {
  saveSimulacionFactoraje,
  fetchSimulacionesFactoraje,
  deleteSimulacionFactoraje,
} from './db.js';

// ─── Paleta ─────────────────────────────────────────────────────
const C = {
  navy:'#0F2D4A', purple:'#5E2D8F', purpleLight:'#8E44AD',
  border:'#E2E8F0', muted:'#64748B', text:'#1A2332',
  bgSoft:'#FAFBFC', surface:'#FFFFFF',
  green:'#1D7A4E', greenLight:'#2EBC76', greenSoft:'#4ADE80',
  red:'#C04A4D', redLight:'#FCA5A5',
  amber:'#C9A858', amberLight:'#FCD34D',
  blue:'#185FA5', blueLight:'#4A90E2',
};

// ─── Helpers ────────────────────────────────────────────────────
const fmt = n => isNaN(n)||n===null||n===undefined ? '0.00'
  : new Intl.NumberFormat('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}).format(+n);
const fmtCompact = n => {
  const v = +n || 0;
  if (Math.abs(v) >= 1_000_000) return (v/1_000_000).toFixed(2)+'M';
  if (Math.abs(v) >= 1_000) return (v/1_000).toFixed(1)+'K';
  return v.toFixed(0);
};
const fmtFecha = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});
};
const fmtFechaHora = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' ' +
         d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
};
const monedaSym = (m) => m==='EUR'?'€':'$';

// ═════════════════════════════════════════════════════════════════
// LÓGICA DE CÁLCULO DEL FACTORAJE
// ═════════════════════════════════════════════════════════════════
//
// Conceptos:
//   total          = saldo pendiente de cobro de la cartera (calculado por metrics.porCobrar)
//   anticipo       = total * (pctAnticipo/100)
//   retencion      = total * (pctRetencion/100)
//   comision       = total * (pctComision/100)        (apertura, una vez)
//   intereses      = anticipo * (tasaAnual/100) * (plazoDias/360)
//   recibesHoy     = anticipo - comision - intereses
//   recibesDespues = total - anticipo - retencion + retencion (al final)
//                  = total - anticipo  (la retención regresa al cobrar)
//   netoTotal      = recibesHoy + recibesDespues
//   costoTotal     = comision + intereses
//   costoLiquidez% = costoTotal / total * 100
//
function calcular(total, params) {
  const t = +total || 0;
  const { tasaAnual, pctAnticipo, plazoDias, pctComision, pctRetencion } = params;
  const anticipo  = t * (pctAnticipo/100);
  const comision  = t * (pctComision/100);
  const intereses = anticipo * (tasaAnual/100) * (plazoDias/360);
  const retencion = t * (pctRetencion/100);
  const recibesHoy     = anticipo - comision - intereses - retencion;
  // El remanente lo recibes cuando el cliente paga (total - anticipo + retencion)
  const recibesDespues = t - anticipo + retencion;
  const netoTotal      = recibesHoy + recibesDespues;
  const costoTotal     = comision + intereses;
  const costoLiquidezPct = t > 0 ? (costoTotal / t * 100) : 0;
  return { anticipo, comision, intereses, retencion, recibesHoy, recibesDespues, netoTotal, costoTotal, costoLiquidezPct };
}

// Variaciones automáticas para conservador / agresivo
// Conservador  = tasa+4pts, anticipo-10pts (peor escenario)
// Esperado     = parámetros tal cual el usuario los puso
// Agresivo     = tasa-3pts, anticipo+10pts (mejor escenario)
function variantes(params) {
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  return {
    conservador: {
      ...params,
      tasaAnual: clamp(params.tasaAnual + 4, 0, 100),
      pctAnticipo: clamp(params.pctAnticipo - 10, 0, 100),
    },
    esperado: { ...params },
    agresivo: {
      ...params,
      tasaAnual: clamp(params.tasaAnual - 3, 0, 100),
      pctAnticipo: clamp(params.pctAnticipo + 10, 0, 100),
    },
  };
}

// ═════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═════════════════════════════════════════════════════════════════
export default function FactorajeModule({ onBack, ingresos = [], metrics = {}, empresaId, usuario, diasDiff }) {

  // ─── Filtrar facturas con saldo pendiente > 0 (excluyendo ocultas) ───
  // IMPORTANTE: usamos metrics[id].porCobrar (calculado correctamente por la app),
  // NO ing.monto - ing.montoPagado.
  const facturasConSaldo = useMemo(() => {
    return ingresos
      .filter(i => !i.oculta)
      .map(i => {
        const total = +i.monto || 0;
        const saldo = (metrics?.[i.id]?.porCobrar) || 0;
        const pagado = total - saldo;
        return { ...i, saldo, _pagadoCalc: pagado };
      })
      .filter(i => i.saldo > 0);
  }, [ingresos, metrics]);

  // ─── Selección de facturas (default: todas) ────────────────
  const [seleccion, setSeleccion] = useState(new Set());
  const [selectorOpen, setSelectorOpen] = useState(false);

  // Inicializar la selección con todas las facturas con saldo
  useEffect(() => {
    setSeleccion(new Set(facturasConSaldo.map(f => f.id)));
  }, [facturasConSaldo.length]);

  // Facturas seleccionadas (con saldo) agrupadas por moneda
  const seleccionPorMoneda = useMemo(() => {
    const r = { MXN: { facturas:[], total:0 }, USD: { facturas:[], total:0 }, EUR: { facturas:[], total:0 } };
    facturasConSaldo.forEach(f => {
      if (!seleccion.has(f.id)) return;
      const m = f.moneda || 'MXN';
      if (!r[m]) r[m] = { facturas:[], total:0 };
      r[m].facturas.push(f);
      r[m].total += f.saldo;
    });
    return r;
  }, [facturasConSaldo, seleccion]);

  // ─── Parámetros (todos arrancan en 0) ──────────────────────
  const [params, setParams] = useState({
    tasaAnual: 0, pctAnticipo: 0, plazoDias: 0, pctComision: 0, pctRetencion: 0,
  });
  const setParam = (k, v) => setParams(p => ({ ...p, [k]: +v || 0 }));

  // ─── Cálculos en vivo (los 3 escenarios, por moneda) ───────
  const escenarios = useMemo(() => {
    const v = variantes(params);
    const out = {};
    for (const escName of ['conservador','esperado','agresivo']) {
      out[escName] = {
        params: v[escName],
        MXN: calcular(seleccionPorMoneda.MXN.total, v[escName]),
        USD: calcular(seleccionPorMoneda.USD.total, v[escName]),
        EUR: calcular(seleccionPorMoneda.EUR.total, v[escName]),
      };
    }
    return out;
  }, [params, seleccionPorMoneda]);

  const esp = escenarios.esperado;

  // ─── Estado de UI: modal historial, mensajes ────────────────
  const [historialOpen, setHistorialOpen] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, tipo='ok') => {
    setToast({ msg, tipo });
    setTimeout(()=>setToast(null), 3500);
  };

  // Cargar historial cuando se abre el modal
  useEffect(() => {
    if (!historialOpen) return;
    setHistorialLoading(true);
    fetchSimulacionesFactoraje(empresaId).then(rows => {
      setHistorial(rows);
      setHistorialLoading(false);
    });
  }, [historialOpen, empresaId]);

  // ─── Guardar simulación ─────────────────────────────────────
  const [guardando, setGuardando] = useState(false);
  const [nombreSim, setNombreSim] = useState('');
  const [guardarModalOpen, setGuardarModalOpen] = useState(false);

  const guardarSimulacion = async () => {
    if (params.tasaAnual === 0 && params.pctAnticipo === 0) {
      showToast('Captura al menos tasa y anticipo antes de guardar', 'err');
      return;
    }
    setGuardando(true);
    try {
      const ingresoIds = facturasConSaldo.filter(f=>seleccion.has(f.id)).map(f=>f.id);
      const resultado = {
        esperado: {
          ...escenarios.esperado.params,
          ...Object.fromEntries(['MXN','USD','EUR'].flatMap(m => Object.entries(escenarios.esperado[m]).map(([k,v]) => [`${k}_${m}`, +v.toFixed(2)])))
        },
        conservador: {
          ...escenarios.conservador.params,
          ...Object.fromEntries(['MXN','USD','EUR'].flatMap(m => Object.entries(escenarios.conservador[m]).map(([k,v]) => [`${k}_${m}`, +v.toFixed(2)])))
        },
        agresivo: {
          ...escenarios.agresivo.params,
          ...Object.fromEntries(['MXN','USD','EUR'].flatMap(m => Object.entries(escenarios.agresivo[m]).map(([k,v]) => [`${k}_${m}`, +v.toFixed(2)])))
        },
      };
      await saveSimulacionFactoraje({
        empresa_id: empresaId,
        nombre: nombreSim.trim() || null,
        usuario: usuario || 'admin',
        num_facturas: ingresoIds.length,
        total_mxn: +seleccionPorMoneda.MXN.total.toFixed(2),
        total_usd: +seleccionPorMoneda.USD.total.toFixed(2),
        total_eur: +seleccionPorMoneda.EUR.total.toFixed(2),
        ingreso_ids: ingresoIds,
        tasa_anual: +params.tasaAnual,
        pct_anticipo: +params.pctAnticipo,
        plazo_dias: +params.plazoDias,
        pct_comision: +params.pctComision,
        pct_retencion: +params.pctRetencion,
        resultado,
      });
      showToast('Simulación guardada correctamente');
      setGuardarModalOpen(false);
      setNombreSim('');
    } catch (err) {
      showToast('Error al guardar: '+err.message, 'err');
    }
    setGuardando(false);
  };

  // ─── Exportar a Excel ───────────────────────────────────────
  const [exportando, setExportando] = useState(false);
  const exportarExcel = async () => {
    setExportando(true);
    try {
      await generarExcelFactoraje({
        facturas: facturasConSaldo.filter(f=>seleccion.has(f.id)),
        seleccionPorMoneda,
        params,
        escenarios,
        diasDiff,
      });
      showToast('Archivo Excel descargado');
    } catch (err) {
      console.error(err);
      showToast('Error al generar Excel: '+err.message, 'err');
    }
    setExportando(false);
  };

  // ═════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════
  return (
    <div style={{padding:'24px 28px', background:C.bgSoft, minHeight:'100vh', fontFamily:"'Inter','Segoe UI',sans-serif"}}>

      {/* Animaciones */}
      <style>{`
        @keyframes fact-fadeUp {
          from { opacity:0; transform: translateY(10px); }
          to   { opacity:1; transform: translateY(0); }
        }
        .fact-anim { animation: fact-fadeUp .5s cubic-bezier(.2,.8,.2,1) both; }
        @keyframes fact-toast-in {
          from { opacity:0; transform: translateY(-10px); }
          to   { opacity:1; transform: translateY(0); }
        }
        .fact-toast { animation: fact-toast-in .3s ease both; }
      `}</style>

      {/* ─── Breadcrumb ─────────────────────────────────────── */}
      <div style={{display:'flex',alignItems:'center',gap:8,fontSize:12,marginBottom:14}}>
        <span style={{color:C.blue,cursor:'pointer'}} onClick={onBack}>← Cuentas por Cobrar</span>
        <span style={{color:'#CBD5E1'}}>/</span>
        <span style={{color:C.blue,cursor:'pointer'}} onClick={onBack}>Reportes</span>
        <span style={{color:'#CBD5E1'}}>/</span>
        <span style={{color:C.text,fontWeight:600}}>Factoraje</span>
      </div>

      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="fact-anim" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:22,paddingBottom:18,borderBottom:`1px solid ${C.border}`}}>
        <div>
          <div style={{fontSize:26,fontWeight:800,color:C.text,letterSpacing:'-0.5px',display:'flex',alignItems:'center',gap:12}}>
            💼 Simulador de Factoraje
          </div>
          <div style={{fontSize:13,color:C.muted,marginTop:4}}>
            Evalúa ofertas de factoraje sobre tu cartera y calcula el flujo proyectado
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setHistorialOpen(true)}
            style={{padding:'9px 16px',fontSize:12,border:`1px solid ${C.border}`,background:C.surface,borderRadius:8,color:C.muted,fontWeight:600,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6,fontFamily:'inherit'}}>
            📋 Mi historial
          </button>
          <button onClick={exportarExcel} disabled={exportando}
            style={{padding:'9px 18px',fontSize:12,background:exportando?'#94A3B8':`linear-gradient(135deg, ${C.green}, ${C.greenLight})`,color:'#fff',borderRadius:8,border:'none',fontWeight:700,cursor:exportando?'wait':'pointer',display:'inline-flex',alignItems:'center',gap:6,boxShadow:'0 2px 8px rgba(29,122,78,0.25)',fontFamily:'inherit'}}>
            {exportando ? '⏳ Generando…' : '📥 Exportar Excel'}
          </button>
        </div>
      </div>

      {/* ─── BLOQUE 1 — Selector de facturas ────────────────── */}
      <Block step={1} label="Facturas a factorizar" anim>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          {['MXN','USD','EUR'].map(m => {
            const r = seleccionPorMoneda[m];
            if (r.total === 0 && r.facturas.length === 0) return null;
            return (
              <div key={m} style={{background:'#F0F4F8',padding:'9px 14px',borderRadius:8,fontSize:12,color:C.text,display:'inline-flex',alignItems:'center',gap:8}}>
                <span style={{width:16,height:16,borderRadius:4,background:C.green,color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700}}>✓</span>
                <span><strong>{r.facturas.length} factura{r.facturas.length!==1?'s':''}</strong> · <strong>{monedaSym(m)}{fmt(r.total)} {m}</strong></span>
              </div>
            );
          })}
          {facturasConSaldo.length === 0 && (
            <div style={{color:C.muted,fontSize:13,fontStyle:'italic'}}>
              No hay facturas con saldo pendiente para factorizar.
            </div>
          )}
          {facturasConSaldo.length > 0 && (
            <button onClick={()=>setSelectorOpen(true)}
              style={{background:C.surface,border:`1px solid ${C.blue}`,color:C.blue,padding:'9px 14px',borderRadius:8,fontSize:12,cursor:'pointer',fontWeight:600,fontFamily:'inherit'}}>
              📋 Cambiar selección ({seleccion.size} de {facturasConSaldo.length})
            </button>
          )}
        </div>
      </Block>

      {/* ─── BLOQUE 2 + 3 — Parámetros + Resultado ─────────── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1.3fr',gap:14,marginBottom:14}}>

        {/* Parámetros */}
        <Block step={2} label="Parámetros (mete los valores que te dé el factorante)" anim noMargin>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            <ParamInput label="Tasa anual" unit="%" value={params.tasaAnual} onChange={v=>setParam('tasaAnual',v)}/>
            <ParamInput label="% Anticipo" unit="%" value={params.pctAnticipo} onChange={v=>setParam('pctAnticipo',v)}/>
            <ParamInput label="Plazo promedio" unit="días" value={params.plazoDias} onChange={v=>setParam('plazoDias',v)} step="1"/>
            <ParamInput label="Comisión apertura" unit="%" value={params.pctComision} onChange={v=>setParam('pctComision',v)}/>
            <div style={{gridColumn:'1 / -1'}}>
              <ParamInput label="% Retención (garantía)" unit="%" value={params.pctRetencion} onChange={v=>setParam('pctRetencion',v)}/>
            </div>
          </div>
        </Block>

        {/* Resultado en vivo */}
        <div className="fact-anim" style={{background:`linear-gradient(135deg, ${C.navy} 0%, #1F4F7A 100%)`,color:'#fff',borderRadius:14,padding:20}}>
          <div style={{fontSize:10,fontWeight:700,opacity:0.85,textTransform:'uppercase',letterSpacing:0.6,marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
            <span style={{width:20,height:20,borderRadius:'50%',background:'rgba(255,255,255,0.2)',color:'#fff',fontSize:10,fontWeight:700,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>3</span>
            Resultado en vivo (Esperado)
          </div>

          {/* Resultado por moneda */}
          {['MXN','USD','EUR'].map(m => {
            const r = seleccionPorMoneda[m];
            if (r.total === 0) return null;
            const e = esp[m];
            return (
              <div key={m} style={{marginBottom:14,paddingBottom:14,borderBottom:'1px solid rgba(255,255,255,0.15)'}}>
                <div style={{fontSize:11,fontWeight:700,opacity:0.7,marginBottom:8,letterSpacing:0.5}}>{m}</div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'4px 0'}}>
                  <span style={{fontSize:12,opacity:0.85}}>Recibes HOY</span>
                  <span style={{fontSize:18,fontWeight:800,color:C.greenSoft,fontVariantNumeric:'tabular-nums',letterSpacing:'-0.3px'}}>{monedaSym(m)}{fmt(e.recibesHoy)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'4px 0'}}>
                  <span style={{fontSize:12,opacity:0.85}}>Costo (com + int)</span>
                  <span style={{fontSize:14,fontWeight:700,color:C.redLight,fontVariantNumeric:'tabular-nums'}}>-{monedaSym(m)}{fmt(e.costoTotal)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'4px 0'}}>
                  <span style={{fontSize:12,opacity:0.85}}>Recibes después</span>
                  <span style={{fontSize:14,fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{monedaSym(m)}{fmt(e.recibesDespues)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'8px 0 0',marginTop:6,borderTop:'1px solid rgba(255,255,255,0.25)'}}>
                  <span style={{fontSize:13,fontWeight:700}}>NETO</span>
                  <span style={{fontSize:20,fontWeight:800,fontVariantNumeric:'tabular-nums',letterSpacing:'-0.4px'}}>{monedaSym(m)}{fmt(e.netoTotal)}</span>
                </div>
                <div style={{fontSize:10,opacity:0.6,marginTop:4}}>
                  vs cobrar tú solo: {monedaSym(m)}{fmt(r.total)} · Costo liquidez: {e.costoLiquidezPct.toFixed(2)}%
                </div>
              </div>
            );
          })}

          {seleccionPorMoneda.MXN.total===0 && seleccionPorMoneda.USD.total===0 && seleccionPorMoneda.EUR.total===0 && (
            <div style={{padding:'20px 0',textAlign:'center',opacity:0.5,fontSize:12}}>
              Selecciona facturas para ver el resultado
            </div>
          )}
        </div>
      </div>

      {/* ─── BLOQUE 4 — Escenarios ──────────────────────────── */}
      <Block step={4} label="Escenarios lado a lado (compara ofertas)" anim>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
          <Escenario nombre="Conservador" sub="Tasa alta · anticipo bajo" color={C.blue} data={escenarios.conservador} seleccionPorMoneda={seleccionPorMoneda}/>
          <Escenario nombre="Esperado" sub="Caso base / probable" color={C.purple} data={escenarios.esperado} seleccionPorMoneda={seleccionPorMoneda} activo/>
          <Escenario nombre="Agresivo" sub="Mejor oferta esperada" color={C.green} data={escenarios.agresivo} seleccionPorMoneda={seleccionPorMoneda}/>
        </div>
      </Block>

      {/* ─── BLOQUE 5 — Flujo proyectado ───────────────────── */}
      <Block step={5} label="Flujo proyectado · próximas 8 semanas" anim>
        <FlujoProyectado
          ingresos={facturasConSaldo.filter(f=>seleccion.has(f.id))}
          escenario={esp}
          diasDiff={diasDiff}
        />
      </Block>

      {/* ─── BLOQUE 6 — Acciones finales ────────────────────── */}
      <div className="fact-anim" style={{background:`linear-gradient(135deg, rgba(94,45,143,0.06), rgba(94,45,143,0.01))`,border:`1px dashed ${C.purple}`,borderRadius:14,padding:16,display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:30}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:C.text}}>¿Te convence este escenario?</div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>Guarda esta simulación en tu historial o expórtala a Excel para mandar al factorante.</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setGuardarModalOpen(true)}
            style={{padding:'9px 16px',fontSize:12,border:`1px solid ${C.border}`,background:C.surface,borderRadius:8,color:C.muted,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
            💾 Guardar simulación
          </button>
          <button onClick={exportarExcel} disabled={exportando}
            style={{padding:'9px 18px',fontSize:12,background:exportando?'#94A3B8':`linear-gradient(135deg, ${C.green}, ${C.greenLight})`,color:'#fff',borderRadius:8,border:'none',fontWeight:700,cursor:exportando?'wait':'pointer',boxShadow:'0 2px 8px rgba(29,122,78,0.25)',fontFamily:'inherit'}}>
            📥 Exportar a Excel
          </button>
        </div>
      </div>

      {/* ─── Modal: selector de facturas ────────────────────── */}
      {selectorOpen && (
        <SelectorFacturasModal
          facturas={facturasConSaldo}
          seleccion={seleccion}
          setSeleccion={setSeleccion}
          onClose={()=>setSelectorOpen(false)}
          diasDiff={diasDiff}
        />
      )}

      {/* ─── Modal: guardar simulación ──────────────────────── */}
      {guardarModalOpen && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}} onClick={()=>!guardando && setGuardarModalOpen(false)}>
          <div style={{background:C.surface,borderRadius:14,padding:24,width:'100%',maxWidth:440,boxShadow:'0 24px 60px rgba(0,0,0,0.3)'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:18,fontWeight:800,color:C.text,marginBottom:6}}>💾 Guardar simulación</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:18}}>Dale un nombre para identificarla después en tu historial.</div>

            <label style={{display:'block',fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:0.5,marginBottom:5}}>Nombre (opcional)</label>
            <input type="text" value={nombreSim} onChange={e=>setNombreSim(e.target.value)}
              placeholder="Ej: Banorte 14% / Bancomext oferta junio"
              style={{width:'100%',padding:'10px 14px',borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,outline:'none',background:C.bgSoft,fontFamily:'inherit',boxSizing:'border-box',marginBottom:18}}/>

            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setGuardarModalOpen(false)} disabled={guardando}
                style={{padding:'9px 16px',fontSize:12,border:`1px solid ${C.border}`,background:C.surface,borderRadius:8,color:C.muted,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Cancelar</button>
              <button onClick={guardarSimulacion} disabled={guardando}
                style={{padding:'9px 18px',fontSize:12,background:guardando?'#94A3B8':C.purple,color:'#fff',borderRadius:8,border:'none',fontWeight:700,cursor:guardando?'wait':'pointer',fontFamily:'inherit'}}>
                {guardando ? '⏳ Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: historial ───────────────────────────────── */}
      {historialOpen && (
        <HistorialModal
          historial={historial}
          loading={historialLoading}
          onClose={()=>setHistorialOpen(false)}
          onRefresh={async ()=>{
            setHistorialLoading(true);
            const rows = await fetchSimulacionesFactoraje(empresaId);
            setHistorial(rows);
            setHistorialLoading(false);
          }}
        />
      )}

      {/* ─── Toast ──────────────────────────────────────────── */}
      {toast && (
        <div className="fact-toast" style={{position:'fixed',top:24,right:24,background:toast.tipo==='err'?C.red:C.green,color:'#fff',padding:'12px 20px',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.2)',zIndex:2000,fontSize:13,fontWeight:600}}>
          {toast.tipo==='err' ? '⚠️' : '✓'} {toast.msg}
        </div>
      )}

    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// SUBCOMPONENTES
// ═════════════════════════════════════════════════════════════════

// Bloque genérico con label paso N
function Block({ step, label, children, anim, noMargin }) {
  return (
    <div className={anim?'fact-anim':''} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:18,marginBottom:noMargin?0:14}}>
      <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:0.6,marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
        <span style={{width:20,height:20,borderRadius:'50%',background:C.purple,color:'#fff',fontSize:10,fontWeight:700,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>{step}</span>
        {label}
      </div>
      {children}
    </div>
  );
}

// Input numérico para los parámetros
function ParamInput({ label, unit, value, onChange, step='0.01' }) {
  return (
    <div>
      <div style={{fontSize:10,color:C.muted,marginBottom:5,fontWeight:700,textTransform:'uppercase',letterSpacing:0.4}}>{label}</div>
      <div style={{background:C.bgSoft,border:`1px solid ${C.border}`,padding:'10px 14px',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <input
          type="number"
          step={step}
          value={value}
          onChange={e=>onChange(e.target.value)}
          style={{fontSize:14,color:C.text,fontWeight:600,border:'none',outline:'none',background:'transparent',width:'100%',fontFamily:'inherit'}}
        />
        <span style={{color:C.muted,fontSize:12,fontWeight:500,marginLeft:8,whiteSpace:'nowrap'}}>{unit}</span>
      </div>
    </div>
  );
}

// Tarjeta de escenario
function Escenario({ nombre, sub, color, data, seleccionPorMoneda, activo }) {
  const neto = (seleccionPorMoneda.MXN.total>0 ? data.MXN.netoTotal : 0)
             + (seleccionPorMoneda.USD.total>0 ? data.USD.netoTotal : 0)
             + (seleccionPorMoneda.EUR.total>0 ? data.EUR.netoTotal : 0);
  const costo = (seleccionPorMoneda.MXN.total>0 ? data.MXN.costoTotal : 0)
              + (seleccionPorMoneda.USD.total>0 ? data.USD.costoTotal : 0)
              + (seleccionPorMoneda.EUR.total>0 ? data.EUR.costoTotal : 0);
  return (
    <div style={{border:activo?`2px solid ${color}`:`1px solid ${C.border}`,borderRadius:10,padding:14,background:activo?'rgba(94,45,143,0.04)':C.bgSoft,position:'relative'}}>
      {activo && (
        <div style={{position:'absolute',top:-9,left:14,background:color,color:'#fff',fontSize:9,padding:'3px 10px',borderRadius:99,fontWeight:700,letterSpacing:0.5}}>⭐ ESPERADO</div>
      )}
      <div style={{fontSize:12,fontWeight:700,color}}>{nombre}</div>
      <div style={{fontSize:10,color:C.muted,marginBottom:12}}>{sub}</div>
      <div style={{fontSize:18,fontWeight:800,color:C.text,fontVariantNumeric:'tabular-nums',letterSpacing:'-0.3px'}}>
        {seleccionPorMoneda.MXN.total>0 ? `$${fmt(data.MXN.netoTotal)} MXN` : (seleccionPorMoneda.USD.total>0 ? `$${fmt(data.USD.netoTotal)} USD` : `€${fmt(data.EUR.netoTotal)}`)}
      </div>
      <div style={{fontSize:10,color:C.muted,marginTop:2}}>Neto {seleccionPorMoneda.MXN.total>0?'MXN':(seleccionPorMoneda.USD.total>0?'USD':'EUR')}</div>
      <div style={{fontSize:10,color:'#475569',marginTop:10,paddingTop:10,borderTop:`1px solid #F1F5F9`,lineHeight:1.6}}>
        Tasa <strong>{data.params.tasaAnual.toFixed(1)}%</strong> · Anticipo <strong>{data.params.pctAnticipo.toFixed(1)}%</strong><br/>
        {seleccionPorMoneda.MXN.total>0 && <>Costo MXN: <strong>${fmt(data.MXN.costoTotal)}</strong> ({data.MXN.costoLiquidezPct.toFixed(2)}%)</>}
      </div>
    </div>
  );
}

// Gráfica de flujo proyectado (próximas 8 semanas)
function FlujoProyectado({ ingresos, escenario, diasDiff }) {
  // Agrupar el "recibesDespues" por semana según fechaVencimiento
  // El anticipo se recibe hoy (semana 0)
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const semanas = useMemo(() => {
    const buckets = Array.from({length:9},(_,i)=>({semana:i, label:i===0?'Hoy':`Sem ${i}`, anticipo:0, cobranza:0 }));
    // Anticipo recibido hoy
    buckets[0].anticipo = (escenario.MXN?.recibesHoy || 0); // Se grafica solo MXN para simplificar
    // Cobranza esperada por semana según vencimiento
    ingresos.forEach(f => {
      if ((f.moneda||'MXN') !== 'MXN') return;
      const vToCheck = f.fechaVencimiento ? new Date(f.fechaVencimiento+'T12:00:00') : null;
      if (!vToCheck) return;
      const diffDays = Math.ceil((vToCheck - hoy)/(1000*60*60*24));
      if (diffDays < 0) return; // ya vencida, no la modelamos en la gráfica de próximas 8
      const semana = Math.min(8, Math.ceil(diffDays/7));
      buckets[semana].cobranza += f.saldo;
    });
    return buckets;
  }, [ingresos, escenario]);

  const maxVal = Math.max(1, ...semanas.map(s => Math.max(s.anticipo, s.cobranza)));

  return (
    <div>
      <div style={{display:'flex',alignItems:'end',gap:8,height:140,padding:'12px 0'}}>
        {semanas.map(s => {
          const isAnticipo = s.semana === 0 && s.anticipo > 0;
          const val = isAnticipo ? s.anticipo : s.cobranza;
          const h = val > 0 ? Math.max(5, (val/maxVal)*100) : 5;
          const empty = val === 0;
          return (
            <div key={s.semana} style={{flex:1,borderRadius:'6px 6px 0 0',height:`${h}%`,
              background: empty ? '#F1F5F9' : (isAnticipo ? `linear-gradient(180deg, ${C.greenSoft}, ${C.green})` : `linear-gradient(180deg, ${C.amberLight}, ${C.amber})`),
              display:'flex',alignItems:'end',justifyContent:'center',
              color: empty ? 'transparent' : (isAnticipo ? '#fff' : '#5A4A1A'),
              fontSize:10,padding:'6px 3px',fontWeight:700,textAlign:'center'}}>
              {!empty && (
                <span>{s.label}<br/>${fmtCompact(val)}</span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:C.muted,marginTop:4,paddingLeft:8,paddingRight:8}}>
        {semanas.map(s => <span key={s.semana}>{s.label}</span>)}
      </div>
      <div style={{display:'flex',gap:16,paddingTop:12,marginTop:8,borderTop:`1px solid #F1F5F9`,fontSize:11,color:'#475569'}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{width:12,height:12,background:`linear-gradient(180deg, ${C.greenSoft}, ${C.green})`,borderRadius:2}}/>
          Anticipo del factorante (hoy)
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{width:12,height:12,background:`linear-gradient(180deg, ${C.amberLight}, ${C.amber})`,borderRadius:2}}/>
          Cobranza esperada por semana
        </div>
        <div style={{marginLeft:'auto',fontSize:10,color:C.muted}}>(Sólo cartera MXN graficada — facturas que vencen +8 semanas se agrupan en Sem 8)</div>
      </div>
    </div>
  );
}

// Modal selector de facturas
function SelectorFacturasModal({ facturas, seleccion, setSeleccion, onClose, diasDiff }) {
  const [filtro, setFiltro] = useState('');
  const [tmpSel, setTmpSel] = useState(new Set(seleccion));

  const filtered = useMemo(() => {
    if (!filtro.trim()) return facturas;
    const q = filtro.trim().toLowerCase();
    return facturas.filter(f =>
      (f.cliente||'').toLowerCase().includes(q) ||
      (f.folio||'').toLowerCase().includes(q) ||
      (f.concepto||'').toLowerCase().includes(q)
    );
  }, [filtro, facturas]);

  const toggle = (id) => {
    const ns = new Set(tmpSel);
    if (ns.has(id)) ns.delete(id); else ns.add(id);
    setTmpSel(ns);
  };
  const toggleTodos = () => {
    if (tmpSel.size === filtered.length) setTmpSel(new Set());
    else setTmpSel(new Set(filtered.map(f=>f.id)));
  };

  const aplicar = () => { setSeleccion(tmpSel); onClose(); };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}} onClick={onClose}>
      <div style={{background:C.surface,borderRadius:14,width:'100%',maxWidth:900,maxHeight:'85vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 60px rgba(0,0,0,0.3)'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'20px 24px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:C.text}}>📋 Seleccionar facturas a factorizar</div>
            <div style={{fontSize:12,color:C.muted,marginTop:2}}>{tmpSel.size} de {facturas.length} seleccionadas</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:C.muted}}>✕</button>
        </div>

        <div style={{padding:'14px 24px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:10,alignItems:'center'}}>
          <input type="text" value={filtro} onChange={e=>setFiltro(e.target.value)} placeholder="🔍 Buscar por cliente, folio, concepto…"
            style={{flex:1,padding:'9px 14px',borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,outline:'none',background:C.bgSoft,fontFamily:'inherit'}}/>
          <button onClick={toggleTodos} style={{padding:'9px 14px',fontSize:12,background:tmpSel.size===filtered.length?C.purple:C.surface,color:tmpSel.size===filtered.length?'#fff':C.text,border:`1px solid ${tmpSel.size===filtered.length?C.purple:C.border}`,borderRadius:8,cursor:'pointer',fontWeight:600,fontFamily:'inherit',whiteSpace:'nowrap'}}>
            {tmpSel.size===filtered.length ? 'Quitar todas' : 'Seleccionar todas'}
          </button>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'0 24px'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead style={{position:'sticky',top:0,background:C.surface,zIndex:1}}>
              <tr style={{borderBottom:`1px solid ${C.border}`}}>
                <th style={{padding:'10px 6px',textAlign:'left',fontWeight:700,color:C.muted,fontSize:10,textTransform:'uppercase',letterSpacing:0.4}}>✓</th>
                <th style={{padding:'10px 6px',textAlign:'left',fontWeight:700,color:C.muted,fontSize:10,textTransform:'uppercase',letterSpacing:0.4}}>Cliente</th>
                <th style={{padding:'10px 6px',textAlign:'left',fontWeight:700,color:C.muted,fontSize:10,textTransform:'uppercase',letterSpacing:0.4}}>Folio</th>
                <th style={{padding:'10px 6px',textAlign:'left',fontWeight:700,color:C.muted,fontSize:10,textTransform:'uppercase',letterSpacing:0.4}}>F.Vence</th>
                <th style={{padding:'10px 6px',textAlign:'left',fontWeight:700,color:C.muted,fontSize:10,textTransform:'uppercase',letterSpacing:0.4}}>Días</th>
                <th style={{padding:'10px 6px',textAlign:'right',fontWeight:700,color:C.muted,fontSize:10,textTransform:'uppercase',letterSpacing:0.4}}>Saldo</th>
                <th style={{padding:'10px 6px',textAlign:'left',fontWeight:700,color:C.muted,fontSize:10,textTransform:'uppercase',letterSpacing:0.4}}>Mon</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => {
                const d = diasDiff ? diasDiff(f.fechaVencimiento) : 0;
                const sel = tmpSel.has(f.id);
                return (
                  <tr key={f.id} onClick={()=>toggle(f.id)} style={{borderBottom:`1px solid #F1F5F9`,cursor:'pointer',background:sel?'rgba(94,45,143,0.04)':'transparent'}}>
                    <td style={{padding:'8px 6px'}}>
                      <input type="checkbox" checked={sel} onChange={()=>toggle(f.id)} onClick={e=>e.stopPropagation()} style={{cursor:'pointer'}}/>
                    </td>
                    <td style={{padding:'8px 6px',color:C.text,fontWeight:600}}>{f.cliente}</td>
                    <td style={{padding:'8px 6px',color:C.muted,fontSize:11}}>{f.folio || '—'}</td>
                    <td style={{padding:'8px 6px',color:C.muted,fontSize:11}}>{fmtFecha(f.fechaVencimiento)}</td>
                    <td style={{padding:'8px 6px',color:d!==null && d<0?C.red:(d!==null && d<=15?C.amber:C.green),fontSize:11,fontWeight:700}}>{d===null?'—':(d<0?d:`+${d}`)}</td>
                    <td style={{padding:'8px 6px',textAlign:'right',fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{monedaSym(f.moneda)}{fmt(f.saldo)}</td>
                    <td style={{padding:'8px 6px',fontSize:11,color:C.muted}}>{f.moneda}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{padding:'14px 24px',borderTop:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontSize:12,color:C.muted}}>
            <strong style={{color:C.text}}>{tmpSel.size}</strong> de {facturas.length} facturas
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={onClose} style={{padding:'9px 16px',fontSize:12,border:`1px solid ${C.border}`,background:C.surface,borderRadius:8,color:C.muted,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Cancelar</button>
            <button onClick={aplicar} style={{padding:'9px 18px',fontSize:12,background:C.purple,color:'#fff',borderRadius:8,border:'none',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Aplicar selección</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Modal de historial
function HistorialModal({ historial, loading, onClose, onRefresh }) {
  const [borrando, setBorrando] = useState(null);

  const borrar = async (id) => {
    if (!confirm('¿Borrar esta simulación?')) return;
    setBorrando(id);
    try {
      await deleteSimulacionFactoraje(id);
      await onRefresh();
    } catch (e) { alert('Error: '+e.message); }
    setBorrando(null);
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}} onClick={onClose}>
      <div style={{background:C.surface,borderRadius:14,width:'100%',maxWidth:800,maxHeight:'85vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 60px rgba(0,0,0,0.3)'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'20px 24px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:C.text}}>📋 Mi historial de simulaciones</div>
            <div style={{fontSize:12,color:C.muted,marginTop:2}}>{historial.length} simulaciones guardadas</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:C.muted}}>✕</button>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'14px 24px'}}>
          {loading ? (
            <div style={{padding:40,textAlign:'center',color:C.muted}}>Cargando…</div>
          ) : historial.length === 0 ? (
            <div style={{padding:40,textAlign:'center',color:C.muted,fontSize:13}}>
              No tienes simulaciones guardadas todavía.<br/>
              <span style={{fontSize:11}}>Cuando guardes una, aparecerá aquí.</span>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {historial.map(h => {
                const r = h.resultado || {};
                const e = r.esperado || {};
                return (
                  <div key={h.id} style={{border:`1px solid ${C.border}`,borderRadius:10,padding:14,background:C.bgSoft}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                      <div>
                        <div style={{fontSize:14,fontWeight:700,color:C.text}}>{h.nombre || '(Sin nombre)'}</div>
                        <div style={{fontSize:11,color:C.muted,marginTop:2}}>{fmtFechaHora(h.fecha_sim)} · {h.usuario}</div>
                      </div>
                      <button onClick={()=>borrar(h.id)} disabled={borrando===h.id}
                        style={{background:'none',border:'none',color:C.red,fontSize:14,cursor:'pointer',padding:4}}>
                        {borrando===h.id ? '⏳' : '🗑️'}
                      </button>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10,fontSize:11,color:C.muted}}>
                      <div><strong style={{color:C.text}}>{h.num_facturas}</strong> facturas</div>
                      <div>Tasa <strong style={{color:C.text}}>{(+h.tasa_anual).toFixed(1)}%</strong></div>
                      <div>Anticipo <strong style={{color:C.text}}>{(+h.pct_anticipo).toFixed(1)}%</strong></div>
                      <div>Plazo <strong style={{color:C.text}}>{h.plazo_dias}d</strong></div>
                    </div>
                    {(+h.total_mxn > 0) && (
                      <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`,fontSize:11}}>
                        <span style={{color:C.muted}}>Total MXN: </span><strong>${fmt(h.total_mxn)}</strong>
                        {e.netoTotal_MXN && <> · <span style={{color:C.muted}}>Neto: </span><strong style={{color:C.green}}>${fmt(e.netoTotal_MXN)}</strong></>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// EXPORTAR A EXCEL (ExcelJS)
// ═════════════════════════════════════════════════════════════════
async function generarExcelFactoraje({ facturas, seleccionPorMoneda, params, escenarios, diasDiff }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CxP Manager';
  wb.created = new Date();

  const fechaCorte = new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});

  // ════ HOJA 1: Resumen ════
  const ws1 = wb.addWorksheet('📊 Resumen', { properties:{tabColor:{argb:'5E2D8F'}} });
  ws1.columns = [
    { width:3 }, { width:28 }, { width:18 }, { width:18 }, { width:18 }, { width:18 }
  ];

  ws1.mergeCells('B2:F2');
  ws1.getCell('B2').value = 'REPORTE DE CUENTAS POR COBRAR · FACTORAJE';
  ws1.getCell('B2').font = { name:'Inter', size:14, bold:true, color:{argb:'FFFFFF'} };
  ws1.getCell('B2').fill = { type:'pattern', pattern:'solid', fgColor:{argb:'0F2D4A'} };
  ws1.getCell('B2').alignment = { vertical:'middle', horizontal:'left', indent:1 };
  ws1.getRow(2).height = 28;

  ws1.mergeCells('B3:F3');
  ws1.getCell('B3').value = 'TravelAirSolutions S.A. de C.V.';
  ws1.getCell('B3').font = { name:'Inter', size:11, bold:true, color:{argb:'FFFFFF'} };
  ws1.getCell('B3').fill = { type:'pattern', pattern:'solid', fgColor:{argb:'1F4F7A'} };
  ws1.getCell('B3').alignment = { vertical:'middle', horizontal:'left', indent:1 };
  ws1.getRow(3).height = 20;

  ws1.mergeCells('B4:F4');
  ws1.getCell('B4').value = `Corte al ${fechaCorte} · ${facturas.length} facturas con saldo pendiente`;
  ws1.getCell('B4').font = { name:'Inter', size:9, italic:true, color:{argb:'64748B'} };
  ws1.getCell('B4').alignment = { horizontal:'left', indent:1 };

  // KPIs por moneda
  let row = 6;
  ws1.getCell(`B${row}`).value = 'KPIs por moneda';
  ws1.getCell(`B${row}`).font = { name:'Inter', size:11, bold:true, color:{argb:'1A2332'} };
  row++;

  ws1.getCell(`B${row}`).value = 'Moneda';
  ws1.getCell(`C${row}`).value = '# Facturas';
  ws1.getCell(`D${row}`).value = 'Total CxC';
  ws1.getCell(`E${row}`).value = 'Vencido';
  ws1.getCell(`F${row}`).value = 'Por vencer';
  ['B','C','D','E','F'].forEach(c => {
    ws1.getCell(`${c}${row}`).font = { name:'Inter', size:10, bold:true, color:{argb:'FFFFFF'} };
    ws1.getCell(`${c}${row}`).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'0F2D4A'} };
    ws1.getCell(`${c}${row}`).alignment = { horizontal:'center', vertical:'middle' };
  });
  ws1.getRow(row).height = 22;
  row++;

  ['MXN','USD','EUR'].forEach(m => {
    const arr = seleccionPorMoneda[m].facturas;
    if (arr.length === 0) return;
    const vencido = arr.filter(f => {
      const d = diasDiff?.(f.fechaVencimiento);
      return d !== null && d !== undefined && d < 0;
    }).reduce((s,f)=>s+f.saldo, 0);
    const porVencer = seleccionPorMoneda[m].total - vencido;
    ws1.getCell(`B${row}`).value = m;
    ws1.getCell(`C${row}`).value = arr.length;
    ws1.getCell(`D${row}`).value = seleccionPorMoneda[m].total;
    ws1.getCell(`E${row}`).value = vencido;
    ws1.getCell(`F${row}`).value = porVencer;
    ['D','E','F'].forEach(c => { ws1.getCell(`${c}${row}`).numFmt = '$#,##0.00'; });
    ws1.getCell(`B${row}`).alignment = { horizontal:'center' };
    ws1.getCell(`B${row}`).font = { name:'Inter', size:10, bold:true };
    ws1.getCell(`C${row}`).alignment = { horizontal:'center' };
    ws1.getCell(`E${row}`).font = { name:'Inter', size:10, color:{argb:'C04A4D'}, bold:true };
    row++;
  });

  // Parámetros y escenarios
  row += 2;
  ws1.getCell(`B${row}`).value = 'Parámetros del factoraje';
  ws1.getCell(`B${row}`).font = { name:'Inter', size:11, bold:true, color:{argb:'1A2332'} };
  row++;
  const paramsRows = [
    ['Tasa anual', params.tasaAnual + ' %'],
    ['% Anticipo', params.pctAnticipo + ' %'],
    ['Plazo promedio (días)', params.plazoDias],
    ['% Comisión apertura', params.pctComision + ' %'],
    ['% Retención (garantía)', params.pctRetencion + ' %'],
  ];
  paramsRows.forEach(([k,v]) => {
    ws1.getCell(`B${row}`).value = k;
    ws1.getCell(`C${row}`).value = v;
    ws1.getCell(`B${row}`).font = { name:'Inter', size:10, color:{argb:'64748B'} };
    ws1.getCell(`C${row}`).font = { name:'Inter', size:10, bold:true };
    row++;
  });

  row += 2;
  ws1.getCell(`B${row}`).value = 'Escenarios calculados (Neto total)';
  ws1.getCell(`B${row}`).font = { name:'Inter', size:11, bold:true };
  row++;
  ws1.getCell(`B${row}`).value = 'Escenario';
  ws1.getCell(`C${row}`).value = 'Tasa';
  ws1.getCell(`D${row}`).value = 'Anticipo';
  ws1.getCell(`E${row}`).value = 'Recibes hoy MXN';
  ws1.getCell(`F${row}`).value = 'Neto total MXN';
  ['B','C','D','E','F'].forEach(c => {
    ws1.getCell(`${c}${row}`).font = { name:'Inter', size:10, bold:true, color:{argb:'FFFFFF'} };
    ws1.getCell(`${c}${row}`).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'5E2D8F'} };
    ws1.getCell(`${c}${row}`).alignment = { horizontal:'center' };
  });
  ws1.getRow(row).height = 20;
  row++;
  [['Conservador','conservador'],['Esperado ⭐','esperado'],['Agresivo','agresivo']].forEach(([label,key]) => {
    const e = escenarios[key];
    ws1.getCell(`B${row}`).value = label;
    ws1.getCell(`C${row}`).value = e.params.tasaAnual.toFixed(1)+'%';
    ws1.getCell(`D${row}`).value = e.params.pctAnticipo.toFixed(1)+'%';
    ws1.getCell(`E${row}`).value = e.MXN.recibesHoy;
    ws1.getCell(`F${row}`).value = e.MXN.netoTotal;
    ws1.getCell(`E${row}`).numFmt = '$#,##0.00';
    ws1.getCell(`F${row}`).numFmt = '$#,##0.00';
    ws1.getCell(`B${row}`).font = { name:'Inter', size:10, bold:key==='esperado' };
    ws1.getCell(`B${row}`).alignment = { horizontal:'center' };
    ['C','D'].forEach(c => ws1.getCell(`${c}${row}`).alignment = { horizontal:'center' });
    if (key==='esperado') {
      ['B','C','D','E','F'].forEach(c => ws1.getCell(`${c}${row}`).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'F0E6FB'} });
    }
    row++;
  });

  // Concentración top 10 clientes (MXN)
  if (seleccionPorMoneda.MXN.facturas.length > 0) {
    row += 2;
    ws1.getCell(`B${row}`).value = 'Concentración por cliente (Top 10 — MXN)';
    ws1.getCell(`B${row}`).font = { name:'Inter', size:11, bold:true };
    row++;
    ws1.getCell(`B${row}`).value = 'Cliente';
    ws1.getCell(`C${row}`).value = '# Facturas';
    ws1.getCell(`D${row}`).value = 'Saldo MXN';
    ws1.getCell(`E${row}`).value = '% Total';
    ['B','C','D','E'].forEach(c => {
      ws1.getCell(`${c}${row}`).font = { name:'Inter', size:10, bold:true, color:{argb:'FFFFFF'} };
      ws1.getCell(`${c}${row}`).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'0F2D4A'} };
      ws1.getCell(`${c}${row}`).alignment = { horizontal:'center' };
    });
    ws1.getRow(row).height = 22;
    row++;

    const totalMXN = seleccionPorMoneda.MXN.total;
    const porCliente = {};
    seleccionPorMoneda.MXN.facturas.forEach(f => {
      if (!porCliente[f.cliente]) porCliente[f.cliente] = { count:0, saldo:0 };
      porCliente[f.cliente].count++;
      porCliente[f.cliente].saldo += f.saldo;
    });
    const arr = Object.entries(porCliente).sort((a,b)=>b[1].saldo - a[1].saldo).slice(0,10);
    arr.forEach(([cliente, d]) => {
      ws1.getCell(`B${row}`).value = cliente;
      ws1.getCell(`C${row}`).value = d.count;
      ws1.getCell(`D${row}`).value = d.saldo;
      ws1.getCell(`E${row}`).value = totalMXN>0 ? d.saldo/totalMXN : 0;
      ws1.getCell(`D${row}`).numFmt = '$#,##0.00';
      ws1.getCell(`E${row}`).numFmt = '0.0%';
      ws1.getCell(`C${row}`).alignment = { horizontal:'center' };
      row++;
    });
  }

  // ════ HOJA 2: Por cliente ════
  const ws2 = wb.addWorksheet('👥 Por cliente', { properties:{tabColor:{argb:'185FA5'}} });
  ws2.columns = [
    { header:'Cliente', key:'cliente', width:35 },
    { header:'# Facturas', key:'cnt', width:12 },
    { header:'Moneda', key:'moneda', width:10 },
    { header:'Vencido', key:'venc', width:16 },
    { header:'Por vencer', key:'pvenc', width:16 },
    { header:'Saldo total', key:'saldo', width:18 },
  ];
  ws2.getRow(1).font = { name:'Inter', size:10, bold:true, color:{argb:'FFFFFF'} };
  ws2.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'0F2D4A'} };
  ws2.getRow(1).height = 22;
  ws2.getRow(1).alignment = { horizontal:'center', vertical:'middle' };

  const porClienteMoneda = {};
  facturas.forEach(f => {
    const key = `${f.cliente}_${f.moneda}`;
    if (!porClienteMoneda[key]) porClienteMoneda[key] = { cliente:f.cliente, moneda:f.moneda, cnt:0, venc:0, pvenc:0, saldo:0 };
    const r = porClienteMoneda[key];
    r.cnt++;
    r.saldo += f.saldo;
    const d = diasDiff?.(f.fechaVencimiento);
    if (d !== null && d !== undefined && d < 0) r.venc += f.saldo; else r.pvenc += f.saldo;
  });
  Object.values(porClienteMoneda).sort((a,b)=>b.saldo - a.saldo).forEach(r => {
    ws2.addRow(r);
  });
  ws2.getColumn('venc').numFmt = '$#,##0.00';
  ws2.getColumn('pvenc').numFmt = '$#,##0.00';
  ws2.getColumn('saldo').numFmt = '$#,##0.00';
  ws2.autoFilter = { from:{row:1,column:1}, to:{row:ws2.rowCount, column:6} };

  // ════ HOJAS 3, 4, 5: Facturas por moneda ════
  for (const m of ['MXN','USD','EUR']) {
    const arr = seleccionPorMoneda[m].facturas;
    if (arr.length === 0) continue;

    const ws = wb.addWorksheet(`📋 Facturas ${m}`, { properties:{tabColor:{argb: m==='MXN'?'1565C0':(m==='USD'?'2E7D32':'6A1B9A')}} });
    ws.columns = [
      { header:'#', key:'idx', width:5 },
      { header:'Cliente', key:'cliente', width:32 },
      { header:'Segmento', key:'segmento', width:14 },
      { header:'UUID Fiscal', key:'uuid', width:38 },
      { header:'Folio', key:'folio', width:14 },
      { header:'Concepto', key:'concepto', width:28 },
      { header:'F. Emisión', key:'fe', width:12 },
      { header:'F. Vencimiento', key:'fv', width:14 },
      { header:'Días Cred.', key:'dc', width:10 },
      { header:'Días Venc.', key:'dv', width:10 },
      { header:'Total', key:'total', width:15 },
      { header:'Cobrado', key:'cobrado', width:15 },
      { header:'Saldo', key:'saldo', width:15 },
      { header:'Estatus', key:'estatus', width:20 },
    ];
    ws.getRow(1).font = { name:'Inter', size:10, bold:true, color:{argb:'FFFFFF'} };
    ws.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'0F2D4A'} };
    ws.getRow(1).height = 24;
    ws.getRow(1).alignment = { horizontal:'center', vertical:'middle' };

    arr.forEach((f, i) => {
      const d = diasDiff?.(f.fechaVencimiento);
      let estatus = '🟢 Vigente';
      if (d === null || d === undefined) estatus = '— Sin fecha';
      else if (d < 0)  estatus = '🔴 Vencida';
      else if (d <= 15) estatus = '🟡 Por vencer 0-15d';
      else if (d <= 30) estatus = '🟢 Por vencer 16-30d';
      else if (d <= 60) estatus = '🟢 Por vencer 31-60d';
      else              estatus = '🟢 Por vencer +60d';

      const r = ws.addRow({
        idx: i+1,
        cliente: f.cliente,
        segmento: f.segmento || f.categoria || '',
        uuid: f.notas || '',
        folio: f.folio || '',
        concepto: f.concepto || '',
        fe: f.fechaContable ? new Date(f.fechaContable+'T12:00:00') : null,
        fv: f.fechaVencimiento ? new Date(f.fechaVencimiento+'T12:00:00') : null,
        dc: f.diasCredito || 0,
        dv: d,
        total: +f.monto || 0,
        cobrado: +f._pagadoCalc || 0,
        saldo: f.saldo,
        estatus,
      });
      // Coloreado de fila vencida
      if (d !== null && d !== undefined && d < 0) {
        ['A','B','C','D','E','F','G','H','I','J','K','L','M','N'].forEach(col => {
          r.getCell(col).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FEF2F2'} };
        });
        r.getCell('J').font = { name:'Inter', size:10, bold:true, color:{argb:'C04A4D'} };
        r.getCell('M').font = { name:'Inter', size:10, bold:true, color:{argb:'C04A4D'} };
      } else if (d !== null && d !== undefined && d <= 15) {
        ['A','B','C','D','E','F','G','H','I','J','K','L','M','N'].forEach(col => {
          r.getCell(col).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFBEB'} };
        });
      }
    });

    ws.getColumn('fe').numFmt = 'dd/mm/yyyy';
    ws.getColumn('fv').numFmt = 'dd/mm/yyyy';
    ws.getColumn('total').numFmt = '$#,##0.00';
    ws.getColumn('cobrado').numFmt = '$#,##0.00';
    ws.getColumn('saldo').numFmt = '$#,##0.00';

    // Fila total
    const totalRow = ws.addRow({
      cliente: 'TOTAL SALDO POR COBRAR',
      saldo: seleccionPorMoneda[m].total,
    });
    totalRow.font = { name:'Inter', size:11, bold:true };
    totalRow.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'F0F4F8'} };
    totalRow.getCell('M').numFmt = '$#,##0.00';

    // Autofiltro
    ws.autoFilter = { from:{row:1,column:1}, to:{row:arr.length+1, column:14} };
  }

  // ════ HOJA Notas ════
  const wsN = wb.addWorksheet('ℹ️ Notas', { properties:{tabColor:{argb:'94A3B8'}} });
  wsN.columns = [{ width:3 }, { width:90 }];
  const notas = [
    '',
    'NOTAS DEL REPORTE',
    '',
    `Empresa: TravelAirSolutions S.A. de C.V.`,
    `Fecha de generación: ${fechaCorte}`,
    `Total facturas en el reporte: ${facturas.length}`,
    '',
    'CRITERIOS DE INCLUSIÓN',
    '· Solo facturas activas con saldo pendiente > 0',
    '· Excluidas las facturas marcadas como ocultas',
    '· Una hoja por moneda (MXN, USD, EUR)',
    '',
    'DEFINICIÓN DE COLUMNAS',
    '· UUID Fiscal: identificador único del CFDI (lo que valida el SAT)',
    '· Folio: número de factura interno',
    '· F. Emisión: fecha contable de la factura',
    '· F. Vencimiento: fecha en la que el cliente debe pagar',
    '· Días Cred.: días de crédito otorgados al cliente',
    '· Días Venc.: días vencido (positivo) o por vencer (negativo)',
    '· Total: importe total facturado',
    '· Cobrado: monto ya pagado por el cliente',
    '· Saldo: pendiente de cobro (Total - Cobrado)',
    '· Estatus: clasificación según días vencido',
    '',
    'PARÁMETROS DE LA SIMULACIÓN',
    `· Tasa anual: ${params.tasaAnual}%`,
    `· % Anticipo: ${params.pctAnticipo}%`,
    `· Plazo promedio: ${params.plazoDias} días`,
    `· Comisión apertura: ${params.pctComision}%`,
    `· Retención: ${params.pctRetencion}%`,
    '',
    'FÓRMULAS DE CÁLCULO',
    '· Anticipo  = Total × (Anticipo%)',
    '· Comisión  = Total × (Comisión%)',
    '· Intereses = Anticipo × (Tasa anual%) × (Plazo días / 360)',
    '· Retención = Total × (Retención%)  (regresa al cobrar)',
    '· Recibes HOY     = Anticipo - Comisión - Intereses - Retención',
    '· Recibes después = Total - Anticipo + Retención  (al cobrar el cliente)',
    '· Neto total      = Recibes HOY + Recibes después',
    '· Costo total     = Comisión + Intereses',
    '· Costo liquidez% = Costo total / Total',
    '',
    'GENERADO POR CxP Manager — TravelAirSolutions',
  ];
  notas.forEach((n,i) => {
    const row = i+1;
    wsN.getCell(`B${row}`).value = n;
    if (n === 'NOTAS DEL REPORTE') wsN.getCell(`B${row}`).font = { name:'Inter', size:14, bold:true, color:{argb:'0F2D4A'} };
    else if (['CRITERIOS DE INCLUSIÓN','DEFINICIÓN DE COLUMNAS','PARÁMETROS DE LA SIMULACIÓN','FÓRMULAS DE CÁLCULO'].includes(n)) {
      wsN.getCell(`B${row}`).font = { name:'Inter', size:11, bold:true, color:{argb:'5E2D8F'} };
    } else {
      wsN.getCell(`B${row}`).font = { name:'Inter', size:10, color:{argb:'1A2332'} };
    }
  });

  // Generar y descargar
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fechaFile = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `Factoraje_TAS_${fechaFile}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
