// ════════════════════════════════════════════════════════════════════
// Endpoint: POST /api/reconocer-saldos
// Recibe la captura (screenshot) del estado de cuenta bancario y usa
// Gemini (visión) para extraer el saldo de cada cuenta.
//
// Variable de entorno requerida en Vercel:
//   GEMINI_API_KEY  → API key gratis de Google AI Studio (aistudio.google.com)
//
// Body JSON esperado:
// {
//   imagenBase64: 'data:image/png;base64,....' | 'iVBORw0...'  // requerido
// }
//
// Respuesta:
// { ok: true, cuentas: [ { banco, numeroCuenta, moneda, esInversion, saldo } ] }
//   ó
// { ok: false, error: 'mensaje descriptivo' }
// ════════════════════════════════════════════════════════════════════

// Modelo de visión (rápido y dentro de la capa gratuita de Google)
const GEMINI_MODEL = 'gemini-2.0-flash';

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

// Instrucciones para el modelo · devolver JSON estructurado
const PROMPT = `Eres un asistente que lee capturas de pantalla de estados de cuenta bancarios en español (formato mexicano).

La imagen contiene uno o varios recuadros de "SALDOS BANCARIOS", cada uno con cuentas agrupadas por banco (ej. Banamex, Banorte, Santander). Cada cuenta muestra:
- El nombre del banco.
- Un número de cuenta (ej. "CTA. 1032831260").
- La moneda: "PESOS" (MXN) o "Dólares"/"USD" (USD), a veces "EUR".
- Un monto de SALDO. Puede haber DOS montos por cuenta: uno arriba (el SALDO real, a veces en itálica) y otro resaltado abajo (el disponible). SIEMPRE toma el de ARRIBA (el saldo), NUNCA el resaltado de abajo.
- Algunas cuentas son de "Inversión" (marca esInversion=true).

Extrae CADA cuenta que veas y devuelve SOLO un objeto JSON con esta forma exacta:
{
  "cuentas": [
    {
      "banco": "Banamex",
      "numeroCuenta": "1032831260",
      "moneda": "MXN",
      "esInversion": false,
      "saldo": 3836.94
    }
  ]
}

Reglas:
- "moneda" debe ser exactamente "MXN", "USD" o "EUR".
- "saldo" debe ser un número puro, sin símbolo de moneda ni comas (usa punto decimal). Ej: 783559.00
- "numeroCuenta" solo dígitos, sin "CTA." ni espacios. Si no ves número, usa "".
- "esInversion" true solo si la fila dice "Inversión".
- NO inventes cuentas. Si un monto no se ve claro, igual incluye la cuenta con tu mejor lectura del saldo.
- Ignora los totales del final (Total Saldos Bancarios, Total Disponible, etc.).
- Responde ÚNICAMENTE el JSON, sin texto adicional.`;

export default async function handler(req, res) {
  if (preflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido (usa POST)' });
  }

  // ── 1. Credencial del entorno
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ ok: false, error: 'Falta la variable GEMINI_API_KEY en Vercel' });
  }

  // ── 2. Parsear body
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: 'Body no es JSON válido' }); }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Body vacío o inválido' });
  }

  const { imagenBase64 } = body;
  if (!imagenBase64 || typeof imagenBase64 !== 'string') {
    return res.status(400).json({ ok: false, error: 'Falta imagenBase64' });
  }

  // Detectar mime y limpiar el prefijo "data:image/xxx;base64,"
  let mimeType = 'image/png';
  const mimeMatch = imagenBase64.match(/^data:(image\/\w+);base64,/);
  if (mimeMatch) mimeType = mimeMatch[1];
  const b64 = imagenBase64.replace(/^data:image\/\w+;base64,/, '');

  // ── 3. Llamar a Gemini
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;
  const geminiBody = {
    contents: [{
      parts: [
        { text: PROMPT },
        { inline_data: { mime_type: mimeType, data: b64 } },
      ],
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    },
  };

  let geminiRes;
  try {
    geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: `No se pudo conectar con Gemini: ${err.message}` });
  }

  if (!geminiRes.ok) {
    let detalle = '';
    try {
      const errJson = await geminiRes.json();
      detalle = errJson?.error?.message || '';
    } catch { /* ignore */ }
    return res.status(500).json({
      ok: false,
      error: `Gemini respondió ${geminiRes.status}${detalle ? `: ${detalle}` : ''}`,
    });
  }

  // ── 4. Extraer el texto JSON de la respuesta
  let data;
  try {
    data = await geminiRes.json();
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Respuesta de Gemini no es JSON válido' });
  }

  const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) {
    return res.status(500).json({ ok: false, error: 'Gemini no devolvió contenido reconocible' });
  }

  // ── 5. Parsear el JSON devuelto por el modelo
  let parsed;
  try {
    parsed = JSON.parse(texto);
  } catch {
    // Fallback: intentar recortar hasta el primer { y el último }
    const ini = texto.indexOf('{');
    const fin = texto.lastIndexOf('}');
    if (ini >= 0 && fin > ini) {
      try { parsed = JSON.parse(texto.slice(ini, fin + 1)); } catch { /* ignore */ }
    }
  }
  if (!parsed) {
    return res.status(500).json({ ok: false, error: 'No se pudo interpretar el JSON de Gemini' });
  }

  // Aceptar tanto { cuentas: [...] } como un array directo
  const listaRaw = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.cuentas) ? parsed.cuentas : []);

  // ── 6. Normalizar cada cuenta
  const normMoneda = (m) => {
    const u = String(m || '').toUpperCase();
    if (u.includes('USD') || u.includes('DOL') || u.includes('DÓL')) return 'USD';
    if (u.includes('EUR')) return 'EUR';
    return 'MXN';
  };
  const cuentas = listaRaw.map(c => ({
    banco: String(c.banco || '').trim(),
    numeroCuenta: String(c.numeroCuenta || '').replace(/\D/g, ''),
    moneda: normMoneda(c.moneda),
    esInversion: c.esInversion === true,
    saldo: (() => {
      const n = typeof c.saldo === 'number' ? c.saldo : parseFloat(String(c.saldo).replace(/[^0-9.\-]/g, ''));
      return Number.isFinite(n) ? n : 0;
    })(),
  })).filter(c => c.banco || c.numeroCuenta);

  return res.status(200).json({ ok: true, cuentas });
}
