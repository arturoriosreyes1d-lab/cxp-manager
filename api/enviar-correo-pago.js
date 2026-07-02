// ════════════════════════════════════════════════════════════════════
// Endpoint: POST /api/enviar-correo-pago
// Envía un correo de comprobante de pago a un proveedor.
//
// Variables de entorno requeridas en Vercel:
//   GMAIL_USER          → cuentasporpagar@viajeslibero.com
//   GMAIL_APP_PASSWORD  → la app password de 16 caracteres (SIN espacios)
//   SUPABASE_URL        → URL de tu Supabase (para bajar el PDF)
//   SUPABASE_ANON_KEY   → anon key (para bajar el PDF)
//
// Body JSON esperado:
// {
//   modo:              'prueba' | 'envio',   // requerido
//   destinatario:      'proveedor@x.com',    // requerido en modo=envio
//   destinatario_prueba: 'test@yo.com',      // requerido en modo=prueba
//   cc:                ['a@x.com','b@y.com'],// opcional (max 5)
//   asunto:            'Comprobante...',     // requerido
//   cuerpo:            'Estimados...',       // requerido
//   nombreRemitente:   'Viajes Libero...',   // opcional
//   comprobantePath:   'empresa_1/xyz.pdf',  // path en Storage, opcional
//   comprobanteNombre: 'comprobante.pdf',    // opcional (nombre del archivo)
// }
//
// Respuesta:
// { ok: true, messageId: '...' }  ó
// { ok: false, error: 'mensaje descriptivo' }
// ════════════════════════════════════════════════════════════════════

import nodemailer from 'nodemailer';
import { FIRMA_VIAJES_LIBERO_BASE64 } from './_firma-viajes-libero.js';

// Utilidad · CORS y verificar método
function preflight(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

// Validar email básico
function esEmailValido(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

// Descargar PDF de Supabase Storage y devolver Buffer
async function descargarPDFComprobante(storagePath) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const ANON_KEY     = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error('Faltan variables SUPABASE_URL o SUPABASE_ANON_KEY en Vercel');
  }
  // Endpoint público del bucket privado con auth
  const url = `${SUPABASE_URL}/storage/v1/object/comprobantes-pago/${storagePath}`;
  const r = await fetch(url, {
    headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY },
  });
  if (!r.ok) {
    throw new Error(`No se pudo descargar el PDF: ${r.status} ${r.statusText}`);
  }
  const arrayBuffer = await r.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido (usa POST)' });
  }

  // ── 1. Leer credenciales del entorno
  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_PWD  = process.env.GMAIL_APP_PASSWORD;
  if (!GMAIL_USER || !GMAIL_PWD) {
    return res.status(500).json({ ok: false, error: 'Faltan credenciales GMAIL_USER o GMAIL_APP_PASSWORD en Vercel' });
  }

  // ── 2. Parsear body
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: 'Body no es JSON válido' }); }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Body vacío o inválido' });
  }

  const {
    modo,
    destinatario,
    destinatario_prueba,
    cc = [],
    asunto,
    cuerpo,
    nombreRemitente,
    comprobantePath,
    comprobanteNombre,
    imagenInlineBase64, // captura PNG del desglose a incrustar (opcional)
  } = body;

  // ── 3. Validaciones
  if (!modo || (modo !== 'prueba' && modo !== 'envio')) {
    return res.status(400).json({ ok: false, error: 'modo debe ser "prueba" o "envio"' });
  }
  if (!asunto || !cuerpo) {
    return res.status(400).json({ ok: false, error: 'asunto y cuerpo son requeridos' });
  }

  const dest = modo === 'prueba' ? destinatario_prueba : destinatario;
  if (!esEmailValido(dest)) {
    return res.status(400).json({ ok: false, error: `Email destinatario inválido: "${dest}"` });
  }

  // Sanitizar CC (max 5, todos válidos)
  const ccLimpio = (Array.isArray(cc) ? cc : [])
    .filter(e => esEmailValido(e))
    .slice(0, 5);

  // ── 4. Preparar attachment si aplica
  let attachments = [];
  if (comprobantePath) {
    try {
      const pdfBuffer = await descargarPDFComprobante(comprobantePath);
      attachments.push({
        filename: comprobanteNombre || 'comprobante.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf',
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: `Error al descargar comprobante: ${err.message}` });
    }
  }

  // ── 5. Crear el transporter (SMTP Gmail)
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // SSL
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PWD.replace(/\s/g, ''), // limpiar espacios por si acaso
    },
  });

  // ── 6. Verificar conexión (solo en modo prueba, para detectar auth issues)
  if (modo === 'prueba') {
    try {
      await transporter.verify();
    } catch (err) {
      return res.status(500).json({ ok: false, error: `Error de conexión SMTP: ${err.message}` });
    }
  }

  // ── 7. Construir mensaje
  const fromLabel = nombreRemitente ? `"${nombreRemitente}" <${GMAIL_USER}>` : GMAIL_USER;
  const asuntoFinal = modo === 'prueba' ? `[PRUEBA] ${asunto}` : asunto;

  // Si hay imagen inline (captura del desglose), añadirla como attachment con cid
  const cidRelacion = 'relacion-facturas-cid@cxp-manager';
  if (imagenInlineBase64) {
    // Limpiar el prefijo "data:image/png;base64," si viene
    const b64 = imagenInlineBase64.replace(/^data:image\/\w+;base64,/, '');
    attachments.push({
      filename: 'relacion-facturas.png',
      content: Buffer.from(b64, 'base64'),
      cid: cidRelacion,
      contentType: 'image/png',
    });
  }

  // Firma de Viajes Libero (siempre embebida en correos de envio, no en prueba)
  const cidFirma = 'firma-viajes-libero-cid@cxp-manager';
  const incluirFirma = modo === 'envio';
  if (incluirFirma) {
    attachments.push({
      filename: 'firma-viajes-libero.png',
      content: Buffer.from(FIRMA_VIAJES_LIBERO_BASE64, 'base64'),
      cid: cidFirma,
      contentType: 'image/png',
    });
  }

  // Convertir el cuerpo de texto plano a HTML preservando saltos de línea
  // y embebiendo la imagen si aplica
  const cuerpoTexto = modo === 'prueba'
    ? `⚠️ Este es un correo de PRUEBA generado desde CxP Manager.\nEl destinatario original habría sido: ${destinatario || '(no especificado)'}\n\n──────\n\n${cuerpo}`
    : cuerpo;

  // HTML del correo · escapar HTML del cuerpo por seguridad + añadir imagen inline
  const escapeHtml = (s) => (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const cuerpoHtml = escapeHtml(cuerpoTexto).replace(/\n/g, '<br>');

  // Firma HTML · imagen embebida centrada
  const firmaHtml = incluirFirma
    ? `<div style="margin: 24px 0 8px; padding-top: 16px; border-top: 1px solid #E2E8F0;"><img src="cid:${cidFirma}" alt="Viajes Libero" style="max-width: 600px; width: 100%; height: auto; display: block;"/></div>`
    : '';

  // Si hay imagen: la insertamos DESPUÉS del párrafo introductorio y ANTES del cierre
  // Usamos un marcador: si el cuerpo contiene "{{IMAGEN_RELACION}}" lo reemplazamos ahí;
  // si no, la insertamos automáticamente antes del cierre "Saludos" o al final del cuerpo.
  let cuerpoConImagen;
  if (imagenInlineBase64) {
    const imgTag = `<div style="margin: 16px 0; text-align: center;"><img src="cid:${cidRelacion}" alt="Relación de facturas pagadas" style="max-width: 380px; width: 100%; height: auto; border: 1px solid #E2E8F0; border-radius: 8px;"/></div>`;
    // Buscar dónde insertar la imagen: antes de "Saludos" si existe
    const idxSaludos = cuerpoHtml.search(/Saludos|Atentamente|Quedamos/i);
    if (idxSaludos > 0) {
      cuerpoConImagen = `${cuerpoHtml.slice(0, idxSaludos)}${imgTag}${cuerpoHtml.slice(idxSaludos)}`;
    } else {
      // No hay marcador de despedida: la ponemos al final
      cuerpoConImagen = `${cuerpoHtml}${imgTag}`;
    }
  } else {
    cuerpoConImagen = cuerpoHtml;
  }

  const htmlFinal = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1A2332; max-width: 720px;">${cuerpoConImagen}${firmaHtml}</div>`;

  const mailOptions = {
    from: fromLabel,
    to: dest,
    cc: ccLimpio.length > 0 ? ccLimpio.join(', ') : undefined,
    subject: asuntoFinal,
    text: cuerpoTexto, // fallback texto plano para clientes que no soportan HTML
    html: htmlFinal,
    attachments,
  };

  // ── 8. Enviar
  try {
    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({
      ok: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      modo,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message, code: err.code });
  }
}
