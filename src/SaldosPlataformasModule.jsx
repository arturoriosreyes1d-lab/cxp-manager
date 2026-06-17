// ═══════════════════════════════════════════════════════════════════
// SaldosPlataformasModule — Tablero Saldos Plataformas (Opción B sobria)
// ═══════════════════════════════════════════════════════════════════
//
// Vive bajo el módulo "Saldos" (junto a Saldos Bancarios).
// Muestra el saldo más reciente de cada plataforma operativa.
//
// Layout: grid 2×2 con cards XL (~200px), franja vertical de color
//   a la izquierda como acento sobrio (look bancario).
// Orden FIJO: Gasomatic → Caribe Cool → Merely Tours → Visas Cubanas
//
// Datos: tabla `saldos_plataformas` en Supabase.
// COMPARTIDO entre VL y TAS — sin filtro por empresa.
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchSaldosPlataformasUltimos,
  fetchHistoricoSaldoPlataforma,
} from './db.js';

// ─── Paleta ─────────────────────────────────────────────────────
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

// ─── Orden fijo de plataformas + configuración por cada una ────
// Si nuevas plataformas aparecen en BD que no están aquí, van al final.
const PLATAFORMAS_CONFIG = [
  {
    key: 'gasomatic',
    nombre: 'Gasomatic',
    franja: '#0F6E56',            // verde teal (Caribe Cool palette)
    bgIcon: '#E1F5EE',            // verde claro
    iconColorFallback: '#0F6E56',
    iconFallback: 'gas-station',
    logo: '/logos/plataformas/gasomatic.png',
  },
  {
    key: 'caribe',
    nombre: 'Caribe Cool',
    franja: '#993C1D',            // coral oscuro
    bgIcon: '#FAECE7',            // coral muy claro
    iconColorFallback: '#993C1D',
    iconFallback: 'snowflake',
    logo: '/logos/plataformas/caribe-cool.png',
  },
  {
    key: 'merely',
    nombre: 'Merely Tours',
    franja: '#993556',            // rosa oscuro
    bgIcon: '#FBEAF0',            // rosa muy claro
    iconColorFallback: '#993556',
    iconFallback: 'beach',
    logo: null,                   // pendiente
  },
  {
    key: 'visa',
    nombre: 'Visas Cubanas',
    franja: '#3C3489',            // morado
    bgIcon: '#EEEDFE',            // morado muy claro
    iconColorFallback: '#3C3489',
    iconFallback: 'id-badge-2',
    logo: null,                   // pendiente
  },
];

// Devuelve la config de la plataforma según el nombre (matcheo case-insensitive parcial)
function getPlataformaConfig(nombre) {
  const slug = (nombre || '').toLowerCase();
  for (const cfg of PLATAFORMAS_CONFIG) {
    if (slug.includes(cfg.key)) return cfg;
  }
  // Default si no hace match
  return {
    key: 'other', nombre,
    franja: C.muted, bgIcon: C.bgSoft,
    iconColorFallback: C.muted, iconFallback: 'building',
    logo: null,
  };
}

// Orden fijo: prepara la lista de saldos respetando el orden de PLATAFORMAS_CONFIG
function ordenarPorConfig(saldos) {
  const indexed = saldos.map(s => ({
    saldo: s,
    config: getPlataformaConfig(s.plataforma),
  }));
  const orden = PLATAFORMAS_CONFIG.map(c => c.key);
  return indexed.sort((a, b) => {
    const ia = orden.indexOf(a.config.key);
    const ib = orden.indexOf(b.config.key);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// ─── Helpers de formato ─────────────────────────────────────────
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
  if (diffH < 24) return `Hace ${diffH} h`;
  if (diffD < 7) return `Hace ${diffD} día${diffD === 1 ? '' : 's'}`;
  return null;
}

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

function fmtFechaRelativa(consultadoEn) {
  if (!consultadoEn) return '—';
  const f = new Date(consultadoEn);
  if (isNaN(f.getTime())) return '—';
  const ahora = new Date();
  const hh = String(f.getHours()).padStart(2, '0');
  const mi = String(f.getMinutes()).padStart(2, '0');
  const hora = `${hh}:${mi}`;
  const mismosDias = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mismosDias(ahora, f)) return `Hoy ${hora}`;
  const ayer = new Date(ahora); ayer.setDate(ayer.getDate() - 1);
  if (mismosDias(ayer, f)) return `Ayer ${hora}`;
  const diffD = Math.round((ahora - f) / 86400000);
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

// ─── Logo o ícono fallback ─────────────────────────────────────
function LogoCaja({ config, size = 44 }) {
  return (
    <div style={{
      width: size, height: size,
      background: config.logo ? '#fff' : config.bgIcon,
      border: config.logo ? `1px solid ${C.border}` : 'none',
      borderRadius: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, overflow: 'hidden',
      padding: config.logo ? 5 : 0,
    }}>
      {config.logo ? (
        <img src={config.logo} alt={config.nombre}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}/>
      ) : (
        <TI name={config.iconFallback} size={Math.round(size * 0.55)} color={config.iconColorFallback}/>
      )}
    </div>
  );
}

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
  const [plataformaSel, setPlataformaSel] = useState(null);

  const cargar = async () => {
    setLoading(true);
    const ultimos = await fetchSaldosPlataformasUltimos();
    setSaldos(ultimos);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  // Ordenar respetando PLATAFORMAS_CONFIG
  const saldosOrdenados = useMemo(() => ordenarPorConfig(saldos), [saldos]);

  // Última lectura general
  const ultimaLecturaGeneral = useMemo(() => {
    if (saldos.length === 0) return null;
    const fechas = saldos.map(s => new Date(s.consultado_en).getTime()).filter(x => !isNaN(x));
    if (fechas.length === 0) return null;
    return new Date(Math.max(...fechas)).toISOString();
  }, [saldos]);

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {/* Animaciones */}
      <style>{`
        @keyframes saldosp-fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes saldosp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.25); }
        }
        .saldosp-card-anim {
          animation: saldosp-fadeUp 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.15s ease;
        }
        .saldosp-card-anim:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 28px rgba(15,45,74,0.10) !important;
          border-color: #CBD5E1 !important;
        }
        .saldosp-card-anim:active { transform: translateY(-1px); }
        .saldosp-dot-pulse { animation: saldosp-pulse 2s ease-in-out infinite; }
      `}</style>

      {/* Header de la sub-vista */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TI name="cloud-data-connection" size={22} color={C.text}/>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: C.navy, letterSpacing: '-0.4px' }}>Saldos Plataformas</h2>
          </div>
          {!loading && ultimaLecturaGeneral && (
            <p style={{ fontSize: 12, color: C.muted, margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="saldosp-dot-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#1D9E75', display: 'inline-block' }}/>
              Última actualización general: {fmtHace(ultimaLecturaGeneral) || fmtFechaCorta(ultimaLecturaGeneral)}
            </p>
          )}
          {loading && (
            <p style={{ fontSize: 12, color: C.muted, margin: '6px 0 0' }}>Cargando…</p>
          )}
        </div>
        <button onClick={cargar}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, color: C.text, border: `1px solid ${C.border}`, background: C.white, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
          <TI name="refresh" size={14}/>
          Refrescar
        </button>
      </div>

      {/* Estado vacío */}
      {!loading && saldos.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center', background: C.bgSoft, border: `1px solid ${C.border}`, borderRadius: 12, color: C.muted, fontSize: 13 }}>
          <TI name="cloud-off" size={36} color={C.muted}/>
          <div style={{ marginTop: 12 }}>No hay saldos de plataformas registrados aún.</div>
        </div>
      )}

      {/* Grid de tarjetas: 2 columnas en pantalla amplia, 1 en angosta */}
      {!loading && saldos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 16 }}>
          {saldosOrdenados.map((item, i) => (
            <TarjetaPlataforma
              key={item.saldo.plataforma}
              saldo={item.saldo}
              config={item.config}
              index={i}
              onClick={() => setPlataformaSel({ plataforma: item.saldo.plataforma, moneda: item.saldo.moneda, config: item.config })}/>
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
          config={plataformaSel.config}
          onClose={() => setPlataformaSel(null)}/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Tarjeta individual de plataforma — estilo Opción B sobria
// ═══════════════════════════════════════════════════════════════════
function TarjetaPlataforma({ saldo, config, index, onClick }) {
  const { saldo: monto, moneda, consultado_en } = saldo;
  const chip = monedaColor(moneda);
  const hace = fmtHace(consultado_en);
  const esVisas = moneda === 'VISAS';

  return (
    <div className="saldosp-card-anim"
      onClick={onClick}
      style={{
        background: C.white,
        borderRadius: 14,
        border: `1px solid ${C.border}`,
        minHeight: 200,
        cursor: 'pointer',
        display: 'grid',
        gridTemplateColumns: '6px 1fr',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(15,45,74,0.04)',
        animationDelay: `${index * 0.06}s`,
      }}>

      {/* Franja vertical de color */}
      <div style={{ background: config.franja }}/>

      {/* Contenido */}
      <div style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>

        {/* Header de la card: logo + nombre · chip moneda */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
            <LogoCaja config={config} size={48}/>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>{config.nombre}</div>
              <div style={{ fontSize: 10, color: C.muted, letterSpacing: 0.5, marginTop: 3, fontWeight: 600 }}>PLATAFORMA</div>
            </div>
          </div>
          <span style={{ background: chip.bg, color: chip.color, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, letterSpacing: 0.3, flexShrink: 0 }}>
            {moneda}
          </span>
        </div>

        {/* Saldo grande */}
        <div>
          <div style={{ fontSize: 32, fontWeight: 800, color: C.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.6px' }}>
            {esVisas
              ? <>{fmtEntero(monto)} <span style={{ fontSize: 15, fontWeight: 500, color: C.muted, letterSpacing: 0 }}>disponibles</span></>
              : `${monedaSym(moneda)}${fmt(monto)}`}
          </div>

          {/* Última lectura */}
          <div style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 6, marginTop: 14 }}>
            <TI name="clock" size={13}/>
            <span>{hace ? `${hace} · ${fmtFechaCorta(consultado_en)}` : fmtFechaCorta(consultado_en)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Modal de histórico
// ═══════════════════════════════════════════════════════════════════
function HistoricoModal({ plataforma, moneda, config, onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [filtro, setFiltro] = useState('7');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const h = await fetchHistoricoSaldoPlataforma(plataforma);
      setData(h);
      setLoading(false);
    })();
  }, [plataforma]);

  const dataFiltrada = useMemo(() => {
    if (filtro === 'todo') return data;
    const dias = filtro === '7' ? 7 : 30;
    const limite = new Date();
    limite.setDate(limite.getDate() - dias);
    return data.filter(r => new Date(r.consultado_en) >= limite);
  }, [data, filtro]);

  const dataConVariacion = useMemo(() => {
    return dataFiltrada.map((r, i) => {
      const siguiente = dataFiltrada[i + 1];
      const variacion = siguiente ? (+r.saldo || 0) - (+siguiente.saldo || 0) : null;
      return { ...r, variacion };
    });
  }, [dataFiltrada]);

  const esVisas = moneda === 'VISAS';
  const chip = monedaColor(moneda);

  return (
    <ModalShell onClose={onClose} maxWidth={620}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <LogoCaja config={config} size={40}/>
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
