import type { Word } from '../types';

export function generateId(): string {
  return crypto.randomUUID();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// 오탈자 1개까지 허용 (4글자 이하는 완전 일치)
export function isAnswerCorrect(input: string, correct: string): boolean {
  const a = input.toLowerCase().trim().replace(/[-'\s]/g, '');
  const c = correct.toLowerCase().trim().replace(/[-'\s]/g, '');
  if (a === c) return true;
  if (c.length >= 5 && levenshtein(a, c) <= 1) return true;
  return false;
}

// 로드된 최적 목소리 캐시
let _voice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find(v => v.name === 'Samantha') ||           // macOS 기본 여성
    voices.find(v => v.name === 'Google US English') ||  // Chrome
    voices.find(v => v.name === 'Microsoft Aria Online (Natural) - English (United States)') ||
    voices.find(v => v.lang === 'en-US' && v.localService) ||
    voices.find(v => v.lang === 'en-US') ||
    null
  );
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => { _voice = pickVoice(); };
  _voice = pickVoice();
}

export function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  if (!_voice) _voice = pickVoice();
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-US';
  utt.rate = 0.85;
  utt.pitch = 1.0;
  if (_voice) utt.voice = _voice;
  speechSynthesis.speak(utt);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getMasteryLevel(word: Word): number {
  const total = word.correctCount + word.incorrectCount;
  if (total === 0) return 0;
  const rate = word.correctCount / total;
  if (rate >= 0.9 && word.correctCount >= 5) return 3;
  if (rate >= 0.7 && word.correctCount >= 3) return 2;
  if (rate >= 0.5) return 1;
  return 0;
}

export function getMasteryLabel(level: number): string {
  return ['미학습', '학습중', '숙지', '완전습득'][level] ?? '미학습';
}

export function getMasteryColor(level: number): string {
  return ['bg-slate-200 text-slate-600', 'bg-yellow-100 text-yellow-700', 'bg-blue-100 text-blue-700', 'bg-green-100 text-green-700'][level] ?? 'bg-slate-200 text-slate-600';
}

// 3단 변화 패턴 감지: run-ran-run, (come came come), (bring–brought–brought) 등
function isConjugation(s: string): boolean {
  // em-dash·중간점 등 → 하이픈으로 통일
  const n = s.replace(/[–—−·]/g, '-').trim();
  const stripped = n.replace(/^[□■○●◇◆☐☑✓✗\s]+/, '').trim();
  // (word-word-word) 또는 (word word word) 형태
  if (/^\([a-zA-Z]+([\s-][a-zA-Z]+){2,}\)$/.test(stripped)) return true;
  // word-word-word 형태 (괄호 없이)
  const noParens = stripped.replace(/[()]/g, '').trim();
  return /^[a-zA-Z]+(-[a-zA-Z]+){2,}$/.test(noParens.replace(/\s/g, ''));
}

// 섹션 헤더 여부 (READING, CONVERSATION 등)
function isSectionHeader(english: string): boolean {
  return /^(READING|CONVERSATION|Further|LISTENING|WRITING|SPEAKING|GRAMMAR|REVIEW|TEST|Lesson|WORD)$/i.test(english)
    || /^[A-Z][A-Z\s]{5,}$/.test(english); // 전체 대문자 6자 이상
}

// 체크박스·번호 제거 후 영어 추출
function cleanEnglish(s: string): string {
  return s
    .replace(/^[□■○●◇◆☐☑✓✗\s\d.]+/, '')       // leading 제거
    .replace(/[^a-zA-Z0-9\s\-'~.]/g, ' ')          // 비허용 문자 → 공백 (+ 등 보존)
    .replace(/\s+/g, ' ')                            // 연속 공백 정리
    .replace(/(^\s*|\s+)[a-z]{1,8}\.\s*~?\s*$/i, '') // 뒤 품사 + trailing ~ 제거
    .trim();
}

// 한글 뜻 정리 — 대문자(A·B), ~, 괄호, [], ; 허용
function cleanKorean(s: string): string {
  return s
    .replace(/^\(?[a-z]{1,8}\.\)?\s*/i, '')           // 앞 품사 제거
    .replace(/[^가-힣A-Z\s(),·~\[\];]/g, '')          // 한글·허용기호 외 제거
    .trim();
}

// 분리점: ~ 또는 단독 대문자가 한글 바로 앞에 있으면 한글 쪽으로 포함
function findSplitPoint(s: string): number {
  const korIdx = s.search(/[가-힣]/);
  if (korIdx <= 0) return korIdx;

  let split = korIdx;
  let look = split - 1;
  while (look >= 0 && s[look] === ' ') look--;

  // 바로 앞이 ~ 이거나 단독 대문자(A, B)면 Korean 쪽으로
  if (look >= 0 && (s[look] === '~' || /[A-Z]/.test(s[look]))) {
    const prev = look > 0 ? s[look - 1] : ' ';
    if (prev === ' ' || look === 0) {
      split = look;
      while (split > 0 && s[split - 1] === ' ') split--;
    }
  }
  return split;
}

export function parseWords(text: string): Partial<Word>[] {
  // 다단 PDF 복사 처리: 한 줄에 □ 여러 개 → 각각 분리
  const rawLines: string[] = [];
  for (const line of text.trim().split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const cbCount = (t.match(/[□■○●◇◆☐☑✓✗]/g) ?? []).length;
    if (cbCount > 1) {
      rawLines.push(...t.split(/(?=[□■○●◇◆☐☑✓✗])/).map(s => s.trim()).filter(Boolean));
    } else {
      rawLines.push(t);
    }
  }

  // 연속 줄 병합
  const lines: string[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const cur = rawLines[i].trim();
    const hasKorean = /[가-힣]/.test(cur);
    const hasEnglish = /[a-zA-Z]/.test(cur);

    // ① 품사 연속줄: "a. 어려운, 힘든" 처럼 품사+한글로 시작 → 이전 줄에 붙임
    if (/^[a-z]{1,8}\.\s+[가-힣~]/i.test(cur) && lines.length > 0) {
      lines[lines.length - 1] += ' ' + cur;
      i++;
      continue;
    }

    // ② 영어만 있는 줄 + 다음이 한글 줄 → 합침
    if (hasEnglish && !hasKorean && !isConjugation(cur) && i + 1 < rawLines.length) {
      const next = rawLines[i + 1].trim();
      const nextKorean = /[가-힣]/.test(next);
      const nextNewEntry = /^[□■○●◇◆☐☑✓✗]/.test(next);
      if (nextKorean && !nextNewEntry) {
        lines.push(cur + ' ' + next);
        i += 2;
        continue;
      }
    }
    lines.push(cur);
    i++;
  }

  const result: Partial<Word>[] = [];

  for (const line of lines) {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) continue;

    // 3단 변화 스킵
    if (isConjugation(raw)) continue;

    let english = '';
    let korean = '';
    let synonyms: string[] = [];
    let antonyms: string[] = [];
    let example = '';

    if (raw.includes('\t')) {
      const parts = raw.split('\t').map(p => p.trim().replace(/^"|"$/g, ''));
      english  = cleanEnglish(parts[0] ?? '');
      korean   = cleanKorean(parts[1] ?? '');
      synonyms = parts[2] ? parts[2].split('/').map(s => cleanEnglish(s)).filter(Boolean) : [];
      antonyms = parts[3] ? parts[3].split('/').map(s => cleanEnglish(s)).filter(Boolean) : [];
      example  = parts[4] ?? '';
    } else {
      const split = findSplitPoint(raw);
      if (split > 0) {
        english = cleanEnglish(raw.slice(0, split));
        korean  = cleanKorean(raw.slice(split));
      } else if (split === -1) {
        english = cleanEnglish(raw);
      } else {
        continue;
      }
    }

    // 품사 약자만 남은 경우 스킵 (a. n. v. adv. 등)
    if (!english || !/[a-zA-Z]/.test(english) || /^[a-z]{1,8}\.?$/.test(english)) continue;
    // 섹션 헤더 스킵 (READING, CONVERSATION 등)
    if (isSectionHeader(english)) continue;
    result.push({ english, korean, synonyms, antonyms, example });
  }
  return result;
}
