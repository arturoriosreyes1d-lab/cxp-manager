-- ═══════════════════════════════════════════════════════════════════
-- Migración: tabla simulaciones_factoraje
-- ═══════════════════════════════════════════════════════════════════
-- Guarda el historial de simulaciones de factoraje hechas en la app.
-- Permite a Reyes revisar después qué ofertas evaluó, con qué parámetros,
-- y comparar contra cotizaciones reales que reciba.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS simulaciones_factoraje (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      TEXT        NOT NULL,        -- 'empresa_2' (TAS) por ahora
  fecha_sim       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nombre          TEXT,                         -- opcional, ej: "Banorte 14%"
  usuario         TEXT,                         -- quién la corrió

  -- Selección de facturas (snapshot del momento)
  num_facturas    INTEGER     NOT NULL,
  total_mxn       NUMERIC(18,2) DEFAULT 0,
  total_usd       NUMERIC(18,2) DEFAULT 0,
  total_eur       NUMERIC(18,2) DEFAULT 0,
  ingreso_ids     JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- ids de ingresos incluidos

  -- Parámetros (los que el usuario ingresó)
  tasa_anual      NUMERIC(7,4) NOT NULL DEFAULT 0,   -- ej: 14.0 = 14% anual
  pct_anticipo    NUMERIC(7,4) NOT NULL DEFAULT 0,   -- ej: 80.0 = 80%
  plazo_dias      INTEGER     NOT NULL DEFAULT 0,    -- ej: 45
  pct_comision    NUMERIC(7,4) NOT NULL DEFAULT 0,   -- comisión apertura
  pct_retencion   NUMERIC(7,4) NOT NULL DEFAULT 0,   -- retención/garantía

  -- Resultado (los 3 escenarios calculados)
  resultado       JSONB       NOT NULL,
  -- Estructura esperada:
  -- {
  --   "esperado": { "tasa": 14, "anticipo": 80, "recibesHoy_MXN": 5977123,
  --                  "costoTotal_MXN": 89657, "recibesDespues_MXN": 1494281,
  --                  "netoTotal_MXN": 7381747, "costoLiquidezPct": 1.2,
  --                  "recibesHoy_USD": ..., (etc por moneda) },
  --   "conservador": { ... }, "agresivo": { ... }
  -- }

  notas           TEXT,                         -- comentarios libres
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_simulaciones_factoraje_empresa
  ON simulaciones_factoraje (empresa_id, fecha_sim DESC);

-- RLS: misma política permisiva que el resto de tablas
ALTER TABLE simulaciones_factoraje ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sf_allow_all ON simulaciones_factoraje;
CREATE POLICY sf_allow_all ON simulaciones_factoraje
  FOR ALL USING (true) WITH CHECK (true);

-- Comentarios para Supabase Studio
COMMENT ON TABLE simulaciones_factoraje IS 'Historial de simulaciones de factoraje de la cartera CxC';
COMMENT ON COLUMN simulaciones_factoraje.empresa_id IS 'empresa_2=TAS (factoraje aplica solo a TAS por ahora)';
COMMENT ON COLUMN simulaciones_factoraje.ingreso_ids IS 'Array JSONB con los ids de ingresos incluidos en la simulación';
COMMENT ON COLUMN simulaciones_factoraje.resultado IS 'JSONB con los 3 escenarios calculados (conservador/esperado/agresivo)';
