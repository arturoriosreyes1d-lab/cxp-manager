-- ════════════════════════════════════════════════════════════════════
-- FASE 1 · Sistema de correos automáticos a proveedores
-- ════════════════════════════════════════════════════════════════════
-- Agrega campos para:
--  · Emails de proveedores (principal + adicionales CC)
--  · Comprobante PDF por pago
--  · Estado de envío de correo por pago
--  · Configuración global de correos (plantilla, remitente, CC globales)
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1) SUPPLIERS: emails para envío de comprobantes
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS email          text DEFAULT '',
  ADD COLUMN IF NOT EXISTS emails_cc      text[] DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS idx_suppliers_email
  ON suppliers (LOWER(email))
  WHERE email <> '';

-- ────────────────────────────────────────────────────────────────────
-- 2) PAYMENTS: comprobante y tracking de correo enviado
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS comprobante_url        text DEFAULT '',
  ADD COLUMN IF NOT EXISTS comprobante_nombre     text DEFAULT '',
  ADD COLUMN IF NOT EXISTS correo_enviado         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS correo_enviado_at      timestamptz,
  ADD COLUMN IF NOT EXISTS correo_enviado_a       text DEFAULT '',
  ADD COLUMN IF NOT EXISTS correo_error           text DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_payments_correo_pendiente
  ON payments (correo_enviado, invoice_id)
  WHERE correo_enviado = false AND comprobante_url <> '';

-- ────────────────────────────────────────────────────────────────────
-- 3) CONFIGURACIÓN GLOBAL DE CORREOS (una fila por empresa)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_config_correos (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          text          NOT NULL UNIQUE,
  remitente_email     text          DEFAULT '',
  remitente_nombre    text          DEFAULT '',
  emails_cc_globales  text[]        DEFAULT ARRAY[]::text[],
  plantilla_asunto    text          DEFAULT 'Comprobante de pago · {{empresa}} · {{fecha}}',
  plantilla_cuerpo    text          DEFAULT '',
  activo              boolean       NOT NULL DEFAULT true,
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  updated_by          text          DEFAULT ''
);

-- Seed inicial · Viajes Libero (empresa_1) con plantilla por defecto
INSERT INTO app_config_correos (empresa_id, remitente_email, remitente_nombre, plantilla_cuerpo)
VALUES (
  'empresa_1',
  'cuentasporpagar@viajeslibero.com',
  'Viajes Libero · Cuentas por Pagar',
  'Estimados {{proveedor}},

Adjunto encontrarán el comprobante de pago correspondiente a las siguientes facturas:

{{lista_facturas}}

Total pagado: {{monto_total}}
Fecha de pago: {{fecha}}
Método: {{metodo}}

Quedamos atentos a cualquier aclaración.

Saludos cordiales,
Viajes Libero'
)
ON CONFLICT (empresa_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────
-- 4) STORAGE BUCKET para comprobantes PDF
-- ────────────────────────────────────────────────────────────────────
-- ⚠️ Este paso NO se hace por SQL, se hace en la UI de Supabase:
--    1. Ir a Storage → New bucket
--    2. Nombre: "comprobantes-pago"
--    3. Public: NO (privado)
--    4. Allowed MIME types: application/pdf
--    5. File size limit: 5 MB
--    6. Politicas: allow_all para usuarios autenticados (o anon con RLS OFF)
--
-- Alternativa por SQL (si Supabase Storage acepta la insert directa):
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprobantes-pago',
  'comprobantes-pago',
  false,
  5242880,  -- 5 MB
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Policy para permitir INSERT/SELECT/DELETE con anon key
-- (misma lógica que las otras tablas de tu app)
DO $$
BEGIN
  BEGIN
    CREATE POLICY "allow_all_comprobantes_upload"
      ON storage.objects FOR INSERT TO anon
      WITH CHECK (bucket_id = 'comprobantes-pago');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "allow_all_comprobantes_select"
      ON storage.objects FOR SELECT TO anon
      USING (bucket_id = 'comprobantes-pago');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "allow_all_comprobantes_delete"
      ON storage.objects FOR DELETE TO anon
      USING (bucket_id = 'comprobantes-pago');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- Verificación · corre esto después para confirmar
-- ────────────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns WHERE table_name='suppliers' AND column_name IN ('email','emails_cc');
-- SELECT column_name FROM information_schema.columns WHERE table_name='payments' AND column_name LIKE 'correo%' OR column_name LIKE 'comprobante%';
-- SELECT * FROM app_config_correos;
-- SELECT id, name, public FROM storage.buckets WHERE id='comprobantes-pago';
