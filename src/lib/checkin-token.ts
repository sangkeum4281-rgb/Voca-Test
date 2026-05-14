const SECRET = 'choegang_attendance_2024';
const SLOT_MS = 30 * 1000; // 30초

export function getCurrentSlot(): number {
  return Math.floor(Date.now() / SLOT_MS);
}

export async function generateToken(slot: number): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(String(slot)));
  return Array.from(new Uint8Array(sig).slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 현재 슬롯 또는 이전 슬롯 토큰이면 유효 (최대 60초 허용)
export async function isValidToken(token: string): Promise<boolean> {
  if (!token) return false;
  const slot = getCurrentSlot();
  const [cur, prev] = await Promise.all([generateToken(slot), generateToken(slot - 1)]);
  return token === cur || token === prev;
}
