-- ════════════════════════════════════════════════════════════════════
-- Trazabilidad del préstamo · Rubros + empresa_destino + nota
-- ════════════════════════════════════════════════════════════════════
-- 1) Crear tabla de RUBROS (globales para ambas empresas)
-- 2) Seed con rubros iniciales
-- 3) Agregar columnas nuevas a prestamo_movimientos
-- ════════════════════════════════════════════════════════════════════

-- 1) TABLA DE RUBROS (globales)
CREATE TABLE IF NOT EXISTS rubros_prestamo (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text          NOT NULL,
  emoji        text          DEFAULT '📦',
  orden        integer       DEFAULT 0,
  activo       boolean       NOT NULL DEFAULT true,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  created_by   text          DEFAULT ''
);

-- Índice para evitar duplicados por nombre (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_rubros_prestamo_nombre_unique
  ON rubros_prestamo (LOWER(nombre));

-- 2) SEED con rubros iniciales
INSERT INTO rubros_prestamo (nombre, emoji, orden) VALUES
  ('Plan de pagos',          '📋', 1),
  ('Préstamo Caribe Cool',   '🌴', 2),
  ('Impuestos',              '📑', 3),
  ('Pago a proveedores',     '🤝', 4),
  ('Nómina',                 '💼', 5),
  ('Servicios',              '💡', 6),
  ('Otros',                  '📦', 7)
ON CONFLICT (LOWER(nombre)) DO NOTHING;

-- 3) AGREGAR COLUMNAS a prestamo_movimientos
ALTER TABLE prestamo_movimientos
  ADD COLUMN IF NOT EXISTS empresa_destino text,
  ADD COLUMN IF NOT EXISTS rubro_id        uuid REFERENCES rubros_prestamo(id),
  ADD COLUMN IF NOT EXISTS nota            text DEFAULT '';

-- Índices para queries comunes
CREATE INDEX IF NOT EXISTS idx_prestamo_mov_empresa_destino
  ON prestamo_movimientos (empresa_destino);
CREATE INDEX IF NOT EXISTS idx_prestamo_mov_rubro
  ON prestamo_movimientos (rubro_id);
