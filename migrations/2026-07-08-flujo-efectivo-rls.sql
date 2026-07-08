-- ════════════════════════════════════════════════════════════════════
-- Migración: 2026-07-08 · Flujo de Efectivo — tabla + RLS allow_all
-- ════════════════════════════════════════════════════════════════════
-- Problema: los guardados del módulo Flujo de Efectivo fallaban con 401
-- (Unauthorized) porque la tabla flujo_efectivo_semanal no tenía la
-- política RLS allow_all que usa el resto del proyecto con la anon key.
--
-- Esta migración es IDEMPOTENTE y segura de correr aunque la tabla ya
-- exista: crea la tabla si falta, asegura el índice único que necesita
-- el upsert (onConflict empresa_id,week_key) y aplica RLS allow_all.
--
-- Cómo aplicar: Supabase → SQL Editor → pega TODO esto → RUN.
-- Convención RLS: allow_all (consistente con resto del proyecto)
-- ════════════════════════════════════════════════════════════════════

-- 1) Tabla (si no existe)
CREATE TABLE IF NOT EXISTS flujo_efectivo_semanal (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  TEXT NOT NULL,
  week_key    TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Índice único que requiere el upsert (onConflict: empresa_id,week_key)
CREATE UNIQUE INDEX IF NOT EXISTS ux_flujo_ef_empresa_week
  ON flujo_efectivo_semanal (empresa_id, week_key);

-- 3) RLS: allow_all (permite lectura/escritura con la anon key)
ALTER TABLE flujo_efectivo_semanal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_flujo_ef ON flujo_efectivo_semanal;
CREATE POLICY allow_all_flujo_ef
  ON flujo_efectivo_semanal
  FOR ALL
  USING (true)
  WITH CHECK (true);
