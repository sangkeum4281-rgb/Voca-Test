import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function buildAuth(apiKey: string, apiSecret: string): Promise<string> {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, '');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(date + salt));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `HMAC-SHA256 ApiKey=${apiKey}, Date=${date}, Salt=${salt}, Signature=${sigHex}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { studentName, status, date } = await req.json();

    const apiKey     = Deno.env.get('SOLAPI_API_KEY')!;
    const apiSecret  = Deno.env.get('SOLAPI_API_SECRET')!;
    const fromPhone  = Deno.env.get('SENDER_PHONE')!;
    const supabase   = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 학부모 전화번호 조회
    const { data: student } = await supabase
      .from('students')
      .select('parent_phone')
      .eq('name', studentName)
      .single();

    if (!student?.parent_phone) {
      return new Response(JSON.stringify({ success: false, reason: 'no_phone' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const statusText = status === 'late' ? '지각' : '결석';
    const dateStr    = new Date(date + 'T00:00:00+09:00')
      .toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    const text = `[최강학원] ${studentName} 학생이 오늘(${dateStr}) 수업에 ${statusText}했습니다.`;

    const res = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': await buildAuth(apiKey, apiSecret),
      },
      body: JSON.stringify({
        message: {
          to: student.parent_phone.replace(/[^0-9]/g, ''),
          from: fromPhone.replace(/[^0-9]/g, ''),
          text,
        },
      }),
    });

    const result = await res.json();
    const success = res.ok;

    return new Response(JSON.stringify({ success, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
