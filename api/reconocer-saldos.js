// ════════════════════════════════════════════════════════════════════
// Endpoint: POST /api/reconocer-saldos
// Recibe la captura (screenshot) del estado de cuenta bancario y usa
// Claude (visión) de Anthropic para extraer el saldo de cada cuenta.
//
// Variable de entorno requerida en Vercel:
//   ANTHROPIC_API_KEY  → API key de console.anthropic.com (empieza con sk-ant-)
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

// Modelo de visión (barato y con visión). Si necesitas más precisión,
// puedes cambiarlo por 'claude-sonnet-5'.
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

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
  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ ok: false, error: 'Falta la variable ANTHROPIC_API_KEY en Vercel' });
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
  let mediaType = 'image/png';
  const mimeMatch = imagenBase64.match(/^data:(image\/\w+);base64,/);
  if (mimeMatch) mediaType = mimeMatch[1];
  const b64 = imagenBase64.replace(/^data:image\/\w+;base64,/, '');

  // ── 3. Llamar a Claude (Anthropic Messages API)
  const anthropicBody = {
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
        ],
      },
      { role: 'assistant', content: '{' },
    ],
  };

  let apiRes;
  try {
    apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(anthropicBody),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: `No se pudo conectar con Anthropic: ${err.message}` });
  }

  if (!apiRes.ok) {
    let detalle = '';
    try {
      const errJson = await apiRes.json();
      detalle = errJson?.error?.message || '';
    } catch { /* ignore */ }
    return res.status(500).json({
      ok: false,
      error: `Anthropic respondió ${apiRes.status}${detalle ? `: ${detalle}` : ''}`,
    });
  }

  // ── 4. Extraer el texto de la respuesta
  let data;
  try {
    data = await apiRes.json();
  } catch {
    return res.status(500).json({ ok: false, error: 'Respuesta de Anthropic no es JSON válido' });
  }

  const bloque = Array.isArray(data?.content) ? data.content.find(b => b.type === 'text') : null;
  let texto = bloque?.text;
  if (!texto) {
    return res.status(500).json({ ok: false, error: 'Claude no devolvió contenido reconocible' });
  }
  texto = '{' + texto;

  // ── 5. Parsear el JSON devuelto por el modelo
  let parsed;
  try {
    parsed = JSON.parse(texto);
  } catch {
    const ini = texto.indexOf('{');
    const fin = texto.lastIndexOf('}');
    if (ini >= 0 && fin > ini) {
      try { parsed = JSON.parse(texto.slice(ini, fin + 1)); } catch { /* ignore */ }
    }
  }
  if (!parsed) {
    return res.status(500).json({ ok: false, error: 'No se pudo interpretar el JSON de Claude' });
  }

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
