// ═══════════════════════════════════════════════════════════════════
// ReportesCxCView — Pantalla de reportes/herramientas de CxC
// ═══════════════════════════════════════════════════════════════════
// Grid de cards de herramientas:
//   - Card "Factoraje" → lleva al simulador de factoraje
//   - Card "Reporte CxC" → abre el generador clásico (que ya existe)
// Solo visible para empresa_2 (TAS).
//
// Props:
//   onBack          — volver a CxC
//   onOpenFactoraje — abrir módulo Factoraje
//   onOpenReporteClasico — abrir el reporte CxC clásico (ya existente)
//   ingresos        — para mostrar KPIs en las cards
//   kpis            — kpis precalculados de CxcView
//   metrics         — métricas precalculados de CxcView
// ═══════════════════════════════════════════════════════════════════

import React, { useMemo } from 'react';

const C = {
  navy:'#0F2D4A', purple:'#5E2D8F', purpleLight:'#8E44AD',
  border:'#E2E8F0', muted:'#64748B', text:'#1A2332',
  bgSoft:'#FAFBFC', surface:'#FFFFFF',
  blue:'#185FA5', blueLight:'#4A90E2',
  red:'#C04A4D', green:'#0F6E56',
};

const fmt = n => isNaN(n)||n===null ? '0' : new Intl.NumberFormat('es-MX',{minimumFractionDigits:0,maximumFractionDigits:0}).format(+n);
const fmtCompact = n => {
  const v = +n || 0;
  if (Math.abs(v) >= 1_000_000) return '$' + (v/1_000_000).toFixed(2)+'M';
  if (Math.abs(v) >= 1_000) return '$' + (v/1_000).toFixed(0)+'K';
  return '$' + v.toFixed(0);
};

export default function ReportesCxCView({
  onBack,
  onOpenFactoraje,
  onOpenReporteClasico,
  ingresos = [],
  kpis = {},
  metrics = [],
}) {

  // KPIs para la card de Factoraje
  const kpisFactoraje = useMemo(() => {
    const conSaldo = ingresos.filter(i => {
      if (i.oculta) return false; // mismo criterio que la app: facturas ocultas se excluyen
      const saldo = (+i.monto||0) - (+i.montoPagado||0);
      return saldo > 0;
    });
    const totalMXN = conSaldo.filter(i => (i.moneda||'MXN')==='MXN').reduce((s,i)=> s + ((+i.monto||0) - (+i.montoPagado||0)), 0);
    // vencido (usando fecha hoy)
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const vencidoMXN = conSaldo
      .filter(i => (i.moneda||'MXN')==='MXN' && i.fechaVencimiento)
      .filter(i => new Date(i.fechaVencimiento+'T12:00:00') < hoy)
      .reduce((s,i)=> s + ((+i.monto||0) - (+i.montoPagado||0)), 0);
    return {
      numFacturas: conSaldo.length,
      totalMXN,
      vencidoMXN,
    };
  }, [ingresos]);

  // KPIs para card de Reporte CxC clásico
  const kpisReporteClasico = useMemo(() => {
    return {
      ingresosTotales: ingresos.length,
      cobradoTotal: kpis?.MXN?.cobrado || 0,
      ocultas: ingresos.filter(i=>i.oculta).length,
    };
  }, [ingresos, kpis]);

  return (
    <div style={{padding:'24px 28px', background:C.bgSoft, minHeight:'100vh', fontFamily:"'Inter','Segoe UI',sans-serif"}}>

      <style>{`
        @keyframes rep-fadeUp {
          from { opacity:0; transform: translateY(10px); }
          to   { opacity:1; transform: translateY(0); }
        }
        .rep-anim { animation: rep-fadeUp .5s cubic-bezier(.2,.8,.2,1) both; }
        .rep-card {
          background: linear-gradient(180deg, #fff, #FAFBFC);
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          padding: 22px;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: transform .2s, box-shadow .2s, border-color .2s;
        }
        .rep-card::before {
          content: "";
          position: absolute;
          top: 0; left: 0; right: 0; height: 4px;
          background: var(--accent, #185FA5);
        }
        .rep-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 28px rgba(0,0,0,0.08);
          border-color: var(--accent, #185FA5);
        }
      `}</style>

      {/* ─── Breadcrumb ─────────────────────────────────────── */}
      <div style={{display:'flex',alignItems:'center',gap:8,fontSize:12,marginBottom:14}}>
        <span style={{color:C.blue,cursor:'pointer'}} onClick={onBack}>← Cuentas por Cobrar</span>
        <span style={{color:'#CBD5E1'}}>/</span>
        <span style={{color:C.text,fontWeight:600}}>Reportes</span>
      </div>

      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="rep-anim" style={{marginBottom:24,paddingBottom:18,borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:26,fontWeight:800,color:C.text,letterSpacing:'-0.5px',display:'flex',alignItems:'center',gap:12}}>
          📊 Reportes CxC
        </div>
        <div style={{fontSize:13,color:C.muted,marginTop:4}}>
          Genera reportes ejecutivos y herramientas financieras de tu cartera
        </div>
      </div>

      {/* ─── Grid de cards ──────────────────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>

        {/* CARD: FACTORAJE */}
        <div className="rep-card rep-anim" style={{'--accent':C.purple,animationDelay:'0.05s'}} onClick={onOpenFactoraje}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
            <div style={{
              width:56,height:56,borderRadius:12,
              background:`linear-gradient(135deg, ${C.purple}, ${C.purpleLight})`,
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:28,color:'#fff',
              boxShadow:'0 6px 18px rgba(94, 45, 143, 0.3)',
            }}>💼</div>
            <span style={{
              background:'rgba(94,45,143,0.1)',color:C.purple,
              fontSize:9,fontWeight:700,padding:'3px 9px',borderRadius:99,letterSpacing:0.4,textTransform:'uppercase',
            }}>⚡ Nuevo</span>
          </div>

          <h3 style={{fontSize:18,fontWeight:800,color:C.text,margin:'0 0 5px',letterSpacing:'-0.3px'}}>Factoraje</h3>
          <div style={{fontSize:12,color:C.muted,lineHeight:1.55,marginBottom:14}}>
            Simulador para evaluar ofertas de factoraje. Cartera + parámetros (tasa, anticipo, comisión) → 3 escenarios + proyección de flujo. Exporta a Excel multi-hoja.
          </div>

          <div style={{display:'flex',gap:14,paddingTop:14,borderTop:'1px solid #F1F5F9'}}>
            <Kpi num={kpisFactoraje.numFacturas} label="Facturas con saldo"/>
            <Kpi num={fmtCompact(kpisFactoraje.totalMXN)} label="Cartera MXN"/>
            <Kpi num={fmtCompact(kpisFactoraje.vencidoMXN)} label="Vencido" color={C.red}/>
          </div>
        </div>

        {/* CARD: REPORTE CxC CLÁSICO */}
        <div className="rep-card rep-anim" style={{'--accent':C.blue,animationDelay:'0.1s'}} onClick={onOpenReporteClasico}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
            <div style={{
              width:56,height:56,borderRadius:12,
              background:`linear-gradient(135deg, ${C.blue}, ${C.blueLight})`,
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:28,color:'#fff',
              boxShadow:'0 6px 18px rgba(24, 95, 165, 0.3)',
            }}>📊</div>
            <span style={{
              background:'rgba(15,110,86,0.08)',color:C.green,
              fontSize:9,fontWeight:700,padding:'3px 9px',borderRadius:99,letterSpacing:0.4,textTransform:'uppercase',
            }}>Existente</span>
          </div>

          <h3 style={{fontSize:18,fontWeight:800,color:C.text,margin:'0 0 5px',letterSpacing:'-0.3px'}}>Reporte CxC</h3>
          <div style={{fontSize:12,color:C.muted,lineHeight:1.55,marginBottom:14}}>
            El reporte estándar que ya tienes. Estado de cuenta general, vencimientos, totales por cliente. Se exporta como imagen.
          </div>

          <div style={{display:'flex',gap:14,paddingTop:14,borderTop:'1px solid #F1F5F9'}}>
            <Kpi num={kpisReporteClasico.ingresosTotales} label="Ingresos totales"/>
            <Kpi num={fmtCompact(kpisReporteClasico.cobradoTotal)} label="Cobrado total" color={C.green}/>
            <Kpi num={kpisReporteClasico.ocultas} label="Ocultas"/>
          </div>
        </div>

      </div>

      {/* Espacio para futuros reportes */}
      <div className="rep-anim" style={{
        marginTop:22,padding:18,
        background:'rgba(94,45,143,0.03)',
        border:'1px dashed #CBD5E1',borderRadius:12,
        textAlign:'center',animationDelay:'0.15s',
      }}>
        <div style={{fontSize:11,color:'#94A3B8',fontStyle:'italic'}}>
          + Espacio para futuras herramientas (Aging Report, Cartera por Cliente, Análisis por Mes, etc.)
        </div>
      </div>

    </div>
  );
}

function Kpi({ num, label, color }) {
  return (
    <div style={{flex:1}}>
      <div style={{fontSize:16,fontWeight:800,color:color||C.text,lineHeight:1,fontVariantNumeric:'tabular-nums',letterSpacing:'-0.3px'}}>
        {typeof num === 'number' ? fmt(num) : num}
      </div>
      <div style={{fontSize:9,color:'#94A3B8',textTransform:'uppercase',letterSpacing:0.4,fontWeight:600,marginTop:4}}>{label}</div>
    </div>
  );
}
