import { useState } from 'react';
import { getStartTime, upsertWeekdaySchedule, deleteWeekdaySchedule, type ClassSchedule, type WeekdaySchedule } from '../lib/db';

const DAYS = [
  { wd: 1, label: '월' }, { wd: 2, label: '화' }, { wd: 3, label: '수' }, { wd: 4, label: '목' },
  { wd: 5, label: '금' }, { wd: 6, label: '토' }, { wd: 0, label: '일' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const SELECT_CLS = 'border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-50 disabled:text-slate-300';

// 24시간제 시/분 선택 — 브라우저 time 입력칸은 오전/오후까지 채워야 값이 잡혀서 저장이 안 켜지는 문제가 있었음
// 시를 '--'로 두면 빈 값(= 기본 시간 적용)
function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [h = '', m = ''] = value ? value.split(':') : [];
  const minutes = m && !MINUTES.includes(m) ? [...MINUTES, m].sort() : MINUTES;
  return (
    <div className="flex items-center gap-1">
      <select value={h} onChange={e => onChange(e.target.value ? `${e.target.value}:${m || '00'}` : '')} className={SELECT_CLS}>
        <option value="">--</option>
        {HOURS.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
      <span className="text-slate-400 text-sm">:</span>
      <select value={h ? m : ''} disabled={!h} onChange={e => onChange(`${h}:${e.target.value}`)} className={SELECT_CLS}>
        {!h && <option value="">--</option>}
        {minutes.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  );
}

interface Props {
  targets: string[];                 // 학년 키(중등부 1학년 …) + 반 이름
  schedules: ClassSchedule[];
  weekdaySchedules: WeekdaySchedule[];
  onChange: (next: WeekdaySchedule[]) => void;
}

export default function WeekdayScheduleEditor({ targets, schedules, weekdaySchedules, onChange }: Props) {
  const [target, setTarget] = useState(targets[0] ?? '');
  // 저장값과 다르게 입력 중인 요일만 담는다 (없으면 저장값 표시)
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const saved = (wd: number) => weekdaySchedules.find(s => s.gradeKey === target && s.weekday === wd)?.startTime ?? '';
  const valueOf = (wd: number) => edits[wd] ?? saved(wd);
  const dirty = DAYS.some(({ wd }) => valueOf(wd) !== saved(wd));

  const changeTarget = (t: string) => { setTarget(t); setEdits({}); };

  const save = async () => {
    setSaving(true);
    try {
      let next = weekdaySchedules;
      for (const { wd } of DAYS) {
        const val = valueOf(wd);
        if (val === saved(wd)) continue;
        if (val) {
          await upsertWeekdaySchedule(target, wd, val);
          next = [...next.filter(s => !(s.gradeKey === target && s.weekday === wd)), { gradeKey: target, weekday: wd, startTime: val }];
        } else {
          await deleteWeekdaySchedule(target, wd);
          next = next.filter(s => !(s.gradeKey === target && s.weekday === wd));
        }
      }
      onChange(next);
      setEdits({});
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? '';
      alert(`저장에 실패했습니다.${msg ? `\n\n${msg}` : ''}\n\nclass_weekday_schedules 테이블/정책이 만들어졌는지 확인해주세요.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-700">요일별 시간</p>
        <p className="text-xs text-slate-400 mt-0.5">
          비워둔 요일은 위의 기본 시간이 적용됩니다. 반 설정 &gt; 학년 설정 순으로 우선하고, 같은 대상에서는 요일별 설정이 우선합니다.
        </p>
      </div>
      <select value={target} onChange={e => changeTarget(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
        {targets.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
        {DAYS.map(({ wd, label }) => (
          <div key={wd} className="flex items-center justify-between px-4 py-2">
            <span className={`text-sm font-semibold ${wd === 0 ? 'text-red-500' : wd === 6 ? 'text-blue-500' : 'text-slate-700'}`}>{label}</span>
            <div className="flex items-center gap-2">
              <TimeSelect value={valueOf(wd)} onChange={v => setEdits(prev => ({ ...prev, [wd]: v }))} />
              <span className="text-xs text-slate-400 w-14 text-right">
                {valueOf(wd) ? '' : `기본 ${getStartTime(target, schedules)}`}
              </span>
            </div>
          </div>
        ))}
      </div>
      <button onClick={save} disabled={!dirty || saving}
        className="w-full py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40">
        {saving ? '저장 중...' : '저장'}
      </button>
      {!dirty && (
        <p className="text-xs text-slate-400 text-center -mt-1">바꿀 요일의 시간을 선택하면 저장할 수 있어요. 안 건드린 요일은 기본 시간 그대로예요.</p>
      )}
    </div>
  );
}
