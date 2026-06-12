-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: vincular payments con planes de pago
-- Fecha: 2026-06-12
-- ═══════════════════════════════════════════════════════════════════════════
-- Permite que un payment creado desde el módulo de Planes de Pago tenga una
-- referencia al abono que lo originó. Esto sirve para que en el popup de
-- detalle de Proyección de Pagos podamos detectar si el pago es parte de un
-- plan y mostrar el banner correspondiente con "Pago N de M".
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS plan_abono_id uuid REFERENCES plan_abonos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_plan_abono_id ON payments(plan_abono_id);

COMMENT ON COLUMN payments.plan_abono_id IS 'Referencia opcional al abono de un plan de pago que originó este payment. Si está presente, el payment se considera parte de un plan.';
