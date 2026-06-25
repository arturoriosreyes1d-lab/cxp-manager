-- ════════════════════════════════════════════════════════════════════
-- Gastos Fijos Mensuales · Dashboard · Corto Plazo del Mes
-- ════════════════════════════════════════════════════════════════════
-- Para cada empresa, una lista editable de gastos recurrentes
-- (nómina, rentas, servicios, combustibles, peajes, etc).
-- El total se suma al "Corto Plazo" del mes en curso.
--
-- Solo superadmin puede insertar/editar/eliminar.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gastos_fijos_mensuales (
  id           uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   text                     NOT NULL,
  concepto     text                     NOT NULL,
  emoji        text                     DEFAULT '📌',
  monto        numeric(14,2)            NOT NULL DEFAULT 0,
  orden        integer                  DEFAULT 0,
  activo       boolean                  NOT NULL DEFAULT true,
  notas        text                     DEFAULT '',
  created_at   timestamptz              NOT NULL DEFAULT now(),
  updated_at   timestamptz              NOT NULL DEFAULT now(),
  updated_by   text                     DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_gastos_fijos_empresa ON gastos_fijos_mensuales(empresa_id);
CREATE INDEX IF NOT EXISTS idx_gastos_fijos_activo  ON gastos_fijos_mensuales(activo);

-- ─────────────── SEED para ambas empresas (montos en 0, los llenas tú) ───
INSERT INTO gastos_fijos_mensuales (empresa_id, concepto, emoji, monto, orden) VALUES
  -- TravelAirSolutions
  ('empresa_2', 'Nómina',       '💼', 0, 1),
  ('empresa_2', 'Rentas',       '🏢', 0, 2),
  ('empresa_2', 'Servicios',    '💡', 0, 3),
  ('empresa_2', 'Combustibles', '⛽', 0, 4),
  ('empresa_2', 'Peajes',       '🛣️', 0, 5),
  -- Viajes Libero
  ('empresa_1', 'Nómina',       '💼', 0, 1),
  ('empresa_1', 'Rentas',       '🏢', 0, 2),
  ('empresa_1', 'Servicios',    '💡', 0, 3),
  ('empresa_1', 'Combustibles', '⛽', 0, 4),
  ('empresa_1', 'Peajes',       '🛣️', 0, 5);

-- ─────────────── RLS opcional (no obligatorio si el app maneja roles internamente) ───
-- ALTER TABLE gastos_fijos_mensuales ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY allow_all ON gastos_fijos_mensuales FOR ALL USING (true) WITH CHECK (true);
