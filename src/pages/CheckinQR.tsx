import { useEffect, useState } from 'react';
import { generateToken, getCurrentSlot } from '../lib/checkin-token';

export default function CheckinQR() {
  const [token, setToken] = useState('');
  const [countdown, setCountdown] = useState(30);

  const refresh = async () => {
    const t = await generateToken(getCurrentSlot());
    setToken(t);
  };

  useEffect(() => {
    refresh();

    const tick = setInterval(() => {
      const secInSlot = Math.floor(Date.now() / 1000) % 30;
      const remaining = 30 - secInSlot;
      setCountdown(remaining);
      if (remaining === 30) refresh(); // 새 슬롯 시작
    }, 1000);

    return () => clearInterval(tick);
  }, []);

  const checkinUrl = token
    ? `${window.location.origin}/checkin?token=${token}`
    : '';

  const qrSrc = checkinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&bgcolor=ffffff&color=312e81&data=${encodeURIComponent(checkinUrl)}`
    : '';

  // 카운트다운 색상
  const timerColor = countdown <= 5 ? 'text-red-300' : countdown <= 10 ? 'text-yellow-300' : 'text-indigo-200';

  return (
    <div className="min-h-screen bg-indigo-700 flex flex-col items-center justify-center gap-6 p-6 select-none">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white">최강학원</h1>
        <p className="text-indigo-200 text-lg mt-1">출석 체크인</p>
      </div>

      {/* QR 코드 */}
      <div className="bg-white rounded-3xl p-5 shadow-2xl">
        {qrSrc ? (
          <img
            key={token}
            src={qrSrc}
            alt="체크인 QR"
            className="w-64 h-64 md:w-72 md:h-72"
          />
        ) : (
          <div className="w-64 h-64 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* 카운트다운 */}
      <div className="text-center">
        <p className="text-indigo-200 text-sm mb-1">QR 갱신까지</p>
        <p className={`text-5xl font-bold tabular-nums ${timerColor}`}>{countdown}</p>
        <p className="text-indigo-300 text-xs mt-1">초</p>
      </div>

      <p className="text-indigo-300 text-sm text-center max-w-xs">
        폰 카메라로 QR을 스캔하고<br />본인 이름을 눌러주세요
      </p>
    </div>
  );
}
