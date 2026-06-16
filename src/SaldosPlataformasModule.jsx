// ═══════════════════════════════════════════════════════════════════
// SaldosPlataformasModule — Tablero de saldos en plataformas operativas
// ═══════════════════════════════════════════════════════════════════
//
// Vive bajo el módulo "Saldos" (junto a Saldos Bancarios).
// Muestra el saldo más reciente de cada plataforma operativa:
// Gasomatic, Caribe Cool, Visas Cubanas, Merely Tours.
//
// Datos vienen de la tabla `saldos_plataformas` en Supabase.
// COMPARTIDO entre VL y TAS — no se filtra por empresa.
//
// Al hacer clic en una tarjeta se abre un modal con el histórico.
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchSaldosPlataformasUltimos,
  fetchHistoricoSaldoPlataforma,
} from './db.js';

// ─── Paleta (igual que el resto de la app) ──────────────────────
const C = {
  navy:    '#0F2D4A',
  blue:    '#1565C0',
  blueSoft:'#E6F1FB',
  blueText:'#185FA5',
  green:   '#0F6E56',
  greenSoft:'#E1F5EE',
  purple:  '#3C3489',
  purpleSoft:'#EEEDFE',
  red:     '#A32D2D',
  redSoft: '#FCEBEB',
  muted:   '#64748B',
  border:  '#E2E8F0',
  bgSoft:  '#F8FAFC',
  text:    '#0F172A',
  white:   '#FFFFFF',
};

// ─── Helpers ────────────────────────────────────────────────────

const fmt = n => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+n);
};

const fmtEntero = n => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return new Intl.NumberFormat('es-MX').format(Math.round(+n));
};

const monedaSym = m => {
  if (m === 'EUR') return '€';
  if (m === 'VISAS') return '';
  return '$';
};

const monedaColor = m => {
  if (m === 'USD') return { bg: C.greenSoft, color: C.green };
  if (m === 'EUR') return { bg: C.purpleSoft, color: C.purple };
  if (m === 'VISAS') return { bg: C.purpleSoft, color: C.purple };
  return { bg: C.blueSoft, color: C.blueText }; // MXN / MN
};

// "Hace X" en español. Devuelve 'Hace un momento', 'Hace 5 min', 'Hace 2 h', 'Hace 3 d'.
// Si la fecha es de hace más de 7 días, devuelve solo fecha absoluta.
function fmtHace(consultadoEn) {
  if (!consultadoEn) return '—';
  const ahora = new Date();
  const fecha = new Date(consultadoEn);
  if (isNaN(fecha.getTime())) return '—';
  const diffMs = ahora - fecha;
  const diffMin = Math.round(diffMs / 60000);
  const diffH = Math.round(diffMs / 3600000);
  const diffD = Math.round(diffMs / 86400000);

  if (diffMin < 1) return 'Hace un momento';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffH < 24) return `Hace ${diffH} h${diffH === 1 ? '' : ''}`;
  if (diffD < 7) return `Hace ${diffD} día${diffD === 1 ? '' : 's'}`;
  return null; // forzar fecha absoluta
}

// Fecha absoluta corta: "16/06/26 09:17"
function fmtFechaCorta(consultadoEn) {
  if (!consultadoEn) return '—';
  const f = new Date(consultadoEn);
  if (isNaN(f.getTime())) return '—';
  const dd = String(f.getDate()).padStart(2, '0');
  const mm = String(f.getMonth() + 1).padStart(2, '0');
  const aa = String(f.getFullYear()).slice(-2);
  const hh = String(f.getHours()).padStart(2, '0');
  const mi = String(f.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${aa} ${hh}:${mi}`;
}

// Fecha + hora descriptiva: "Hoy 09:17", "Ayer 18:45", "Lun 09:12"
function fmtFechaRelativa(consultadoEn) {
  if (!consultadoEn) return '—';
  const f = new Date(consultadoEn);
  if (isNaN(f.getTime())) return '—';
  const ahora = new Date();
  const hh = String(f.getHours()).padStart(2, '0');
  const mi = String(f.getMinutes()).padStart(2, '0');
  const hora = `${hh}:${mi}`;

  // Misma fecha?
  const mismosDias = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mismosDias(ahora, f)) return `Hoy ${hora}`;
  const ayer = new Date(ahora); ayer.setDate(ayer.getDate() - 1);
  if (mismosDias(ayer, f)) return `Ayer ${hora}`;
  // Hace menos de 7 días: nombre día
  const diffMs = ahora - f;
  const diffD = Math.round(diffMs / 86400000);
  if (diffD < 7) {
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return `${dias[f.getDay()]} ${hora}`;
  }
  return fmtFechaCorta(consultadoEn);
}

// ─── Tabler icon helper ────────────────────────────────────────
const TI = ({ name, size = 18, color, style = {} }) => (
  <i className={`ti ti-${name}`} aria-hidden="true"
     style={{ fontSize: size, color: color || 'inherit', lineHeight: 1, ...style }}/>
);

// ─── ModalShell reutilizable ────────────────────────────────────
function ModalShell({ children, onClose, maxWidth = 560 }) {
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,30,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '40px 20px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: C.white, borderRadius: 12, width: '100%', maxWidth, padding: 22, fontFamily: 'inherit' }}>
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════
export default function SaldosPlataformasModule() {
  const [loading, setLoading] = useState(true);
  const [saldos, setSaldos] = useState([]);
  const [plataformaSel, setPlataformaSel] = useState(null); // {plataforma, moneda} para abrir histórico

  const cargar = async () => {
    setLoading(true);
    const ultimos = await fetchSaldosPlataformasUltimos();
    setSaldos(ultimos);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  // Última lectura general (la más reciente de todas las plataformas)
  const ultimaLecturaGeneral = useMemo(() => {
    if (saldos.length === 0) return null;
    const fechas = saldos.map(s => new Date(s.consultado_en).getTime()).filter(x => !isNaN(x));
    if (fechas.length === 0) return null;
    return new Date(Math.max(...fechas)).toISOString();
  }, [saldos]);

  return (
    <div style={{ padding: '0', fontFamily: 'inherit' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TI name="cloud-data-connection" size={20} color={C.text}/>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: C.text }}>Saldos Plataformas</h2>
          </div>
          <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>
            {loading
              ? 'Cargando…'
              : ultimaLecturaGeneral
                ? `Última actualización general: ${fmtHace(ultimaLecturaGeneral) || fmtFechaCorta(ultimaLecturaGeneral)}`
                : 'Sin lecturas disponibles'}
          </p>
        </div>
        <button onClick={cargar}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, color: C.text, border: `1px solid ${C.border}`, background: C.white, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
          <TI name="refresh" size={14}/>
          Refrescar
        </button>
      </div>

      {/* Estado vacío */}
      {!loading && saldos.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', background: C.bgSoft, border: `1px solid ${C.border}`, borderRadius: 12, color: C.muted, fontSize: 13 }}>
          <TI name="cloud-off" size={32} color={C.muted}/>
          <div style={{ marginTop: 12 }}>No hay saldos de plataformas registrados aún.</div>
        </div>
      )}

      {/* Grid de tarjetas */}
      {!loading && saldos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {saldos.map(s => (
            <TarjetaPlataforma key={s.plataforma} saldo={s}
              onClick={() => setPlataformaSel({ plataforma: s.plataforma, moneda: s.moneda })}/>
          ))}
        </div>
      )}

      {/* Info bar */}
      {!loading && saldos.length > 0 && (
        <div style={{ marginTop: 16, padding: '10px 14px', background: C.blueSoft, borderRadius: 8, fontSize: 11, color: '#042C53' }}>
          <TI name="info-circle" size={13} style={{ verticalAlign: -2, marginRight: 4 }}/>
          Haz clic en cualquier tarjeta para ver el histórico de lecturas de esa plataforma.
        </div>
      )}

      {/* Modal histórico */}
      {plataformaSel && (
        <HistoricoModal
          plataforma={plataformaSel.plataforma}
          moneda={plataformaSel.moneda}
          onClose={() => setPlataformaSel(null)}/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Tarjeta individual de plataforma
// ═══════════════════════════════════════════════════════════════════
function TarjetaPlataforma({ saldo, onClick }) {
  const { plataforma, saldo: monto, moneda, consultado_en } = saldo;
  const chip = monedaColor(moneda);
  const hace = fmtHace(consultado_en);
  const esVisas = moneda === 'VISAS';

  return (
    <div onClick={onClick}
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 18,
        background: C.white,
        cursor: 'pointer',
        transition: 'border-color .15s, transform .1s',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#CBD5E1'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}>

      {/* Header de la tarjeta: logo + nombre · chip moneda */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
          <LogoPlataforma plataforma={plataforma}/>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plataforma}</div>
        </div>
        <span style={{ background: chip.bg, color: chip.color, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8, letterSpacing: 0.3, flexShrink: 0 }}>
          {moneda}
        </span>
      </div>

      {/* Saldo */}
      <div style={{ fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1, marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>
        {esVisas
          ? <>{fmtEntero(monto)} <span style={{ fontSize: 14, fontWeight: 500, color: C.muted }}>disponibles</span></>
          : `${monedaSym(moneda)}${fmt(monto)}`}
      </div>

      {/* Última lectura */}
      <div style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
        <TI name="clock" size={12}/>
        <span>{hace ? `${hace} · ${fmtFechaCorta(consultado_en)}` : fmtFechaCorta(consultado_en)}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Logo de plataforma — placeholder mientras subes las imágenes reales
// Cuando tengas los logos, reemplaza este componente para que devuelva
// <img src={`/logos/${slug}.png`} ... />
// ═══════════════════════════════════════════════════════════════════
function LogoPlataforma({ plataforma }) {
  // Mapeo plataforma → estilo placeholder (color de fondo según plataforma)
  // Esto es solo visual mientras llegan los logos reales
  const slug = (plataforma || '').toLowerCase();
  const config = slug.includes('gasomatic')
    ? { bg: C.greenSoft, icon: 'gas-station', color: C.green }
    : slug.includes('caribe')
      ? { bg: '#FAECE7', icon: 'snowflake', color: '#993C1D' }
      : slug.includes('visa')
        ? { bg: C.purpleSoft, icon: 'id-badge-2', color: C.purple }
        : slug.includes('merely')
          ? { bg: '#FBEAF0', icon: 'beach', color: '#993556' }
          : { bg: C.bgSoft, icon: 'building', color: C.muted };

  return (
    <div style={{
      width: 44, height: 44,
      background: config.bg,
      borderRadius: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <TI name={config.icon} size={22} color={config.color}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Modal de histórico
// ═══════════════════════════════════════════════════════════════════
function HistoricoModal({ plataforma, moneda, onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [filtro, setFiltro] = useState('7'); // '7' | '30' | 'todo'

  useEffect(() => {
    (async () => {
      setLoading(true);
      const h = await fetchHistoricoSaldoPlataforma(plataforma);
      setData(h);
      setLoading(false);
    })();
  }, [plataforma]);

  // Filtrar por rango
  const dataFiltrada = useMemo(() => {
    if (filtro === 'todo') return data;
    const dias = filtro === '7' ? 7 : 30;
    const limite = new Date();
    limite.setDate(limite.getDate() - dias);
    return data.filter(r => new Date(r.consultado_en) >= limite);
  }, [data, filtro]);

  // Calcular variaciones
  const dataConVariacion = useMemo(() => {
    return dataFiltrada.map((r, i) => {
      const siguiente = dataFiltrada[i + 1]; // siguiente = anterior cronológicamente (ya viene desc)
      const variacion = siguiente ? (+r.saldo || 0) - (+siguiente.saldo || 0) : null;
      return { ...r, variacion };
    });
  }, [dataFiltrada]);

  const esVisas = moneda === 'VISAS';
  const chip = monedaColor(moneda);
  const slug = (plataforma || '').toLowerCase();
  const config = slug.includes('gasomatic')
    ? { bg: C.greenSoft, icon: 'gas-station', color: C.green }
    : slug.includes('caribe')
      ? { bg: '#FAECE7', icon: 'snowflake', color: '#993C1D' }
      : slug.includes('visa')
        ? { bg: C.purpleSoft, icon: 'id-badge-2', color: C.purple }
        : slug.includes('merely')
          ? { bg: '#FBEAF0', icon: 'beach', color: '#993556' }
          : { bg: C.bgSoft, icon: 'building', color: C.muted };

  return (
    <ModalShell onClose={onClose} maxWidth={620}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 36, height: 36, background: config.bg, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TI name={config.icon} size={18} color={config.color}/>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{plataforma} · histórico</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              <span style={{ background: chip.bg, color: chip.color, padding: '1px 6px', borderRadius: 4, fontWeight: 700, fontSize: 9 }}>{moneda}</span>
            </div>
          </div>
        </div>
        <button onClick={onClose}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: C.muted, fontFamily: 'inherit' }}>
          <TI name="x" size={18}/>
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { id: '7', label: '7 días' },
          { id: '30', label: '30 días' },
          { id: 'todo', label: 'Todo' },
        ].map(opt => (
          <button key={opt.id} onClick={() => setFiltro(opt.id)}
            style={{
              padding: '4px 10px', fontSize: 11,
              border: `1px solid ${filtro === opt.id ? C.blueText : C.border}`,
              background: filtro === opt.id ? C.blueSoft : C.white,
              color: filtro === opt.id ? C.blueText : C.muted,
              borderRadius: 8, cursor: 'pointer', fontWeight: filtro === opt.id ? 700 : 500,
              fontFamily: 'inherit',
            }}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}>Cargando histórico…</div>
      ) : dataConVariacion.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}>No hay lecturas en este rango.</div>
      ) : (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', maxHeight: 400, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 120px', padding: '8px 12px', background: C.bgSoft, borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.muted, letterSpacing: 0.4, fontWeight: 700, position: 'sticky', top: 0 }}>
            <div>FECHA / HORA</div>
            <div style={{ textAlign: 'right' }}>SALDO</div>
            <div style={{ textAlign: 'right' }}>VARIACIÓN</div>
          </div>
          {dataConVariacion.map((r, i) => {
            const esActual = i === 0;
            return (
              <div key={i}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 110px 120px',
                  padding: '10px 12px', alignItems: 'center', fontSize: 12,
                  borderBottom: i < dataConVariacion.length - 1 ? `1px solid ${C.border}` : 'none',
                  background: esActual ? C.blueSoft : 'transparent',
                }}>
                <div style={{ color: esActual ? C.text : C.muted, fontWeight: esActual ? 700 : 400 }}>
                  {fmtFechaRelativa(r.consultado_en)}
                  {esActual && <span style={{ color: C.muted, fontWeight: 400, fontSize: 11, marginLeft: 6 }}>(actual)</span>}
                </div>
                <div style={{ textAlign: 'right', fontWeight: esActual ? 700 : 500, fontVariantNumeric: 'tabular-nums' }}>
                  {esVisas ? fmtEntero(r.saldo) : `${monedaSym(r.moneda)}${fmt(r.saldo)}`}
                </div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.variacion === null ? C.muted : r.variacion > 0 ? C.green : r.variacion < 0 ? C.red : C.muted }}>
                  {r.variacion === null
                    ? '—'
                    : r.variacion === 0
                      ? '0'
                      : `${r.variacion > 0 ? '+' : '−'}${esVisas ? fmtEntero(Math.abs(r.variacion)) : monedaSym(r.moneda) + fmt(Math.abs(r.variacion))}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
}
