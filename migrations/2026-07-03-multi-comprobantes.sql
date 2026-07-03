-- ═══════════════════════════════════════════════════════════════════
-- Soporte para múltiples PDFs adjuntos por pago
-- Fecha: 2026-07-03
-- ═══════════════════════════════════════════════════════════════════

-- Agregar columna JSONB para lista de comprobantes
-- Estructura: [{ url: '...', nombre: '...' }, { url: '...', nombre: '...' }]
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS comprobantes JSONB DEFAULT '[]'::jsonb;

-- Migrar comprobantes viejos (comprobante_url) al array nuevo
-- Solo los que tienen valor y aún no están migrados
UPDATE payments
SET comprobantes = jsonb_build_array(
  jsonb_build_object(
    'url', comprobante_url,
    'nombre', COALESCE(comprobante_nombre, 'comprobante.pdf')
  )
)
WHERE comprobante_url IS NOT NULL
  AND comprobante_url != ''
  AND (comprobantes IS NULL OR comprobantes = '[]'::jsonb);

-- Verificar migración
SELECT
  COUNT(*) AS total_pagos_con_comprobante_viejo,
  COUNT(*) FILTER (WHERE jsonb_array_length(comprobantes) > 0) AS pagos_migrados_al_array
FROM payments
WHERE comprobante_url IS NOT NULL AND comprobante_url != '';
