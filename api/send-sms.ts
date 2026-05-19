import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { to, text } = req.body as { to: string; text: string };
  if (!to || !text) return res.status(400).json({ error: 'to, text required' });

  const key    = process.env.VITE_ALIGO_KEY!;
  const userId = process.env.VITE_ALIGO_USER_ID!;
  const sender = (process.env.VITE_SENDER_PHONE ?? '').replace(/[^0-9]/g, '');

  try {
    const r = await fetch('https://aligo-sms.sangkeum4281.workers.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, text, key, user_id: userId, sender }),
    });
    const result = await r.json() as { result_code: string | number; message?: string };
    console.log('Aligo response:', JSON.stringify(result));
    const success = result.result_code === '1' || result.result_code === 1;
    return res.json({ success, error: success ? undefined : result.message });
  } catch (e) {
    return res.status(500).json({ success: false, error: String(e) });
  }
}
