import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

function ncpSign(timestamp: string): string {
  const serviceId = process.env.NCP_SERVICE_ID!;
  const accessKey = process.env.NCP_ACCESS_KEY!;
  const secretKey = process.env.NCP_SECRET_KEY!;
  const url = `/sms/v2/services/${serviceId}/messages`;
  return crypto.createHmac('sha256', secretKey).update(`POST ${url}\n${timestamp}\n${accessKey}`).digest('base64');
}

async function sendNcpSms(to: string, text: string): Promise<boolean> {
  const serviceId = process.env.NCP_SERVICE_ID!;
  const accessKey = process.env.NCP_ACCESS_KEY!;
  const sender    = (process.env.NCP_SENDER_PHONE ?? '').replace(/[^0-9]/g, '');
  const timestamp = Date.now().toString();
  try {
    const r = await fetch(`https://sens.apigw.ntruss.com/sms/v2/services/${serviceId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-ncp-apigw-timestamp': timestamp,
        'x-ncp-iam-access-key': accessKey,
        'x-ncp-apigw-signature-v2': ncpSign(timestamp),
      },
      body: JSON.stringify({ type: 'SMS', from: sender, content: text, messages: [{ to, content: text }] }),
    });
    const result = await r.json() as { statusCode?: string };
    return result.statusCode === '202';
  } catch { return false; }
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GRADE_DEFAULTS: Record<string, string> = {
  '중등부 1학년': '16:30',
  '중등부 2학년': '18:30',
  '중등부 3학년': '16:30',
  '고등부 1학년': '16:30',
  '고등부 2학년': '16:30',
  '고등부 3학년': '16:30',
};

function isWeekendKST(): boolean {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay();
  return d === 0 || d === 6;
}

function getStartTime(className: string, scheduleMap: Record<string, string>): string {
  // 반별 개별 설정 우선 (같은 학년이라도 시간대가 다른 반 대응)
  if (scheduleMap[className]) return scheduleMap[className];

  const gradeMatch = className.match(/(\d+)학년/);
  if (!gradeMatch) return '16:30';
  const grade = `${gradeMatch[1]}학년`;
  const isHigh = /고등|고교/.test(className);
  const newKey = `${isHigh ? '고등부' : '중등부'} ${grade}`;
  return scheduleMap[newKey] ?? scheduleMap[grade] ?? GRADE_DEFAULTS[newKey] ?? '16:30';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = (req.headers['x-cron-secret'] as string) ?? req.query.secret;
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = kst.toISOString().slice(0, 10);
  const isWeekend = kst.getUTCDay() === 0 || kst.getUTCDay() === 6;

  const { data: settings } = await supabase
    .from('school_settings').select('key,value')
    .in('key', ['auto_absent_sms', 'sms_test_phone', 'closed_dates', 'open_dates']);
  const sm: Record<string, string> = {};
  for (const r of settings ?? []) sm[r.key] = r.value;

  const smsEnabled = sm['auto_absent_sms'] === 'true';
  const testPhone = (sm['sms_test_phone'] ?? '').replace(/[^0-9]/g, '');
  const closedDates = sm['closed_dates'] ? sm['closed_dates'].split(',').filter(Boolean) : [];
  let openDates: { date: string; time?: string }[] = [];
  try { openDates = sm['open_dates'] ? JSON.parse(sm['open_dates']) : []; } catch { openDates = []; }
  const openEntry = openDates.find(o => o.date === today);

  if (closedDates.includes(today)) return res.json({ skipped: 'closed' });
  if (isWeekend && !openEntry) return res.json({ skipped: 'weekend' });
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const nowMin = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes();
  const AUTO_DELAY_MIN = 10;

  const [{ data: students }, { data: att }, { data: schedules }] = await Promise.all([
    supabase.from('students').select('*'),
    supabase.from('attendance').select('student_name').eq('date', today),
    supabase.from('class_schedules').select('*'),
  ]);

  const scheduleMap: Record<string, string> = {};
  for (const s of schedules ?? []) scheduleMap[s.grade_key] = s.start_time;

  const checkedIn = new Set((att ?? []).map((a: { student_name: string }) => a.student_name));

  const marked: string[] = [];
  const smsSent: string[] = [];

  for (const student of students ?? []) {
    const className = student.class_name ?? '';
    if (!className || /고등|고교/.test(className)) continue;

    const startTime = openEntry?.time || getStartTime(className, scheduleMap);
    const [h, m] = startTime.split(':').map(Number);
    if (nowMin < h * 60 + m + AUTO_DELAY_MIN) continue;
    if (checkedIn.has(student.name)) continue;

    await supabase.from('attendance').upsert(
      { student_name: student.name, date: today, status: 'absent', note: '' },
      { onConflict: 'student_name,date' }
    );
    marked.push(student.name);

    if (smsEnabled) {
      const parentPhone = (student.parent_phone ?? '').replace(/[^0-9]/g, '');
      const to = testPhone || parentPhone;
      if (!to) continue;

      const dateStr = new Date(today + 'T00:00:00+09:00')
        .toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });
      const text = `[최강학원] ${student.name} 학생이 오늘(${dateStr}) 수업에 결석했습니다.`;

      const ok = await sendNcpSms(to, text);
      if (ok) smsSent.push(student.name);
      else console.error('SMS 발송 실패:', student.name);
    }
  }

  return res.json({ ok: true, marked, smsSent, today });
}
