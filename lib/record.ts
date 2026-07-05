// 러닝 기록(뛴 날짜) 계산 유틸 — localStorage의 YYYY-MM-DD 문자열 배열 기반
export function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayStr() {
  return fmtDate(new Date());
}

export function parseDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// 오늘(또는 어제부터) 이어지는 연속 일수
export function currentStreak(set: Set<string>, today = new Date()) {
  let count = 0;
  let d = new Date(today);
  if (!set.has(fmtDate(d))) d = addDays(d, -1); // 오늘 아직이면 어제부터
  while (set.has(fmtDate(d))) {
    count += 1;
    d = addDays(d, -1);
  }
  return count;
}

// 이번 주(월요일 시작) 7일
export function weekDates(today = new Date()) {
  const dow = (today.getDay() + 6) % 7; // 월=0
  const monday = addDays(today, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function weekCount(set: Set<string>, today = new Date()) {
  return weekDates(today).filter((d) => set.has(fmtDate(d))).length;
}

export function monthCount(set: Set<string>, year: number, month: number) {
  let c = 0;
  set.forEach((s) => {
    const d = parseDate(s);
    if (d.getFullYear() === year && d.getMonth() === month) c += 1;
  });
  return c;
}

// 달력 그리드 (일요일 시작). 앞쪽 빈칸은 null.
export function buildMonthGrid(year: number, month: number): Array<Date | null> {
  const startPad = new Date(year, month, 1).getDay(); // 일=0
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) cells.push(new Date(year, month, d));
  return cells;
}
