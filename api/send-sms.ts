import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

function makeSignature(timestamp: string): string {
  const serviceId = process.env.NCP_SERVICE_ID!;
  const accessKey = process.env.NCP_ACCESS_KEY!;
  const secretKey = process.env.NCP_SECRET_KEY!;
  const url = `/sms/v2/services/${serviceId}/messages`;
  const message = `POST ${url}\n${timestamp}\n${accessKey}`;
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { to, text } = req.body as { to: string; text: string };
  if (!to || !text) return res.status(400).json({ error: 'to, text required' });

  const serviceId = process.env.NCP_SERVICE_ID!;
  const accessKey = process.env.NCP_ACCESS_KEY!;
  const sender   = (process.env.NCP_SENDER_PHONE ?? '').replace(/[^0-9]/g, '');
  const timestamp = Date.now().toString();

  try {
    const r = await fetch(`https://sens.apigw.ntruss.com/sms/v2/services/${serviceId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-ncp-apigw-timestamp': timestamp,
        'x-ncp-iam-access-key': accessKey,
        'x-ncp-apigw-signature-v2': makeSignature(timestamp),
      },
      body: JSON.stringify({
        type: 'SMS',
        from: sender,
        content: text,
        messages: [{ to: to.replace(/[^0-9]/g, ''), content: text }],
      }),
    });
    const result = await r.json() as { statusCode?: string; statusName?: string; errorMessage?: string };
    console.log('NCP SMS response:', JSON.stringify(result));
    const success = result.statusCode === '202';
    return res.json({ success, error: success ? undefined : result.errorMessage ?? result.statusName });
  } catch (e) {
    return res.status(500).json({ success: false, error: String(e) });
  }
}
