export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Metodo no permitido' });
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: 'Falta el token' });
  }

  const r = await fetch(
    'https://api.github.com/repos/arturoriosreyes1d-lab/Bot---Monitor-Saldos/actions/workflows/todos.yml/dispatches',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  if (r.status === 204) {
    return res.status(200).json({ ok: true });
  }

  const detail = await r.text();
  return res.status(502).json({ ok: false, status: r.status, detail });
}
