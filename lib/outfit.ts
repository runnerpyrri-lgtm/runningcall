// 러닝 복장 추천 — 현재 체감 기준 기본 + 하루 날씨 변화(비·자외선·기온)에 맞춘 스마트 플랜
import type { RunningSlot } from "@/lib/scoring";

export type OutfitAdvice = {
  main: string;
  extras: string[];
};

// 체감온도 기준 기본 복장(홈 칩·시간대표에서 사용). 러닝은 걷기보다 체감 +5~8°C.
export function getOutfit(slot: RunningSlot): OutfitAdvice {
  const feel = slot.apparentTemperature;
  const extras: string[] = [];

  let main: string;
  if (feel >= 23) main = "반팔 + 반바지";
  else if (feel >= 16) main = "반팔 + 반바지";
  else if (feel >= 10) main = "얇은 긴팔 + 반바지";
  else if (feel >= 5) main = "긴팔 + 긴바지";
  else if (feel >= 0) main = "기모 긴팔 + 긴바지";
  else main = "방한 상하의";

  if (slot.precipitation >= 0.3 || slot.precipitationProbability >= 60) extras.push("방수 자켓");
  if (slot.uvIndex >= 5) extras.push("선글라스");
  if (slot.windSpeed >= 8 && feel < 20) extras.push("바람막이");
  if (feel < 3) extras.push("장갑");

  return { main, extras: [...new Set(extras)].slice(0, 3) };
}

/* ------------------------------------------------------------------ *
 * 상세 플랜 (러닝 복장 시트)
 * ------------------------------------------------------------------ */
export type OutfitItem = { emoji: string; label: string; reason: string };
export type OutfitCategory = { emoji: string; label: string; value: string; reason: string };
export type WeatherChange = { emoji: string; text: string; tone: "rain" | "sun" | "temp" | "wind" };
export type OutfitTime = { label: string; emoji: string; feel: number; main: string; note: string };

export type OutfitPlan = {
  main: string;
  feels: number;
  headline: string;
  categories: OutfitCategory[];
  sun: { level: string; items: OutfitItem[] } | null;
  changes: WeatherChange[];
  byTime: OutfitTime[];
};

function fmtH(hour: number) {
  const ap = hour < 12 ? "오전" : "오후";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${ap} ${h}시`;
}

function topFor(feel: number): { value: string; reason: string } {
  if (feel >= 23) return { value: "반팔 티셔츠", reason: "달리면 체감이 더 올라가요. 통풍 잘 되는 기능성 소재로." };
  if (feel >= 16) return { value: "반팔 티셔츠", reason: "뛰면 금방 더워져요. 반팔이 딱 좋아요." };
  if (feel >= 10) return { value: "얇은 긴팔", reason: "초반 쌀쌀함만 막아주면 충분해요." };
  if (feel >= 5) return { value: "긴팔 + 얇은 바람막이", reason: "찬 공기를 막아주는 한 겹이 필요해요." };
  if (feel >= 0) return { value: "기모 긴팔", reason: "보온이 중요한 온도예요." };
  return { value: "방한 상의(레이어)", reason: "얇은 옷을 여러 겹 겹쳐 입으세요." };
}

function bottomFor(feel: number): { value: string; reason: string } {
  if (feel >= 16) return { value: "반바지", reason: "가볍게, 땀 잘 마르는 기능성으로." };
  if (feel >= 10) return { value: "반바지 또는 7부", reason: "하체는 금방 열이 올라와요." };
  if (feel >= 3) return { value: "긴바지(레깅스)", reason: "무릎 관절 보온에 좋아요." };
  return { value: "기모 긴바지", reason: "다리 보온이 필수예요." };
}

export function getOutfitPlan(slots: RunningSlot[], current: RunningSlot): OutfitPlan {
  const feel = current.apparentTemperature;
  const top = topFor(feel);
  const bottom = bottomFor(feel);

  const categories: OutfitCategory[] = [
    { emoji: "👕", label: "상의", value: top.value, reason: top.reason },
    { emoji: "🩳", label: "하의", value: bottom.value, reason: bottom.reason }
  ];

  if (feel < 3) {
    categories.push({ emoji: "🧤", label: "손·목", value: "장갑 + 넥워머", reason: "손끝과 목이 가장 먼저 시려요." });
    categories.push({ emoji: "🧣", label: "머리", value: "비니 / 귀마개", reason: "귀·머리 보온으로 체온을 지켜요." });
  } else if (feel < 8) {
    categories.push({ emoji: "🧤", label: "손", value: "얇은 장갑", reason: "초반 10분 손 시림을 막아줘요." });
  }

  if (current.windSpeed >= 8 && feel < 20) {
    categories.push({ emoji: "💨", label: "바람막이", value: "얇은 바람막이", reason: `바람 ${current.windSpeed.toFixed(0)}m/s로 체감이 더 낮아요.` });
  }

  if (current.precipitation >= 0.3 || current.precipitationProbability >= 60) {
    categories.push({ emoji: "🧥", label: "비 대비", value: "방수 자켓 + 챙 모자", reason: "지금 비가 올 수 있어요. 젖으면 체온이 확 떨어져요." });
  }

  // ── 햇빛·자외선 (낮 러닝용, 선글라스 적극 활용) ──
  const dayUv = Math.max(0, ...slots.filter((s) => s.hour >= 8 && s.hour <= 18).map((s) => s.uvIndex));
  let sun: OutfitPlan["sun"] = null;
  if (dayUv >= 3) {
    const items: OutfitItem[] = [
      { emoji: "🕶️", label: "스포츠 선글라스", reason: "눈부심과 눈 피로를 줄여 더 편하게 달려요." }
    ];
    if (dayUv >= 5) items.push({ emoji: "🧢", label: "챙 모자 + 선크림", reason: "얼굴·두피 자외선을 막아줘요." });
    if (dayUv >= 6 && feel >= 16) items.push({ emoji: "🧴", label: "팔토시(쿨토시)", reason: "팔 자외선을 막고 시원하게 유지돼요." });
    if (dayUv >= 8) items.push({ emoji: "🌳", label: "그늘 코스 선택", reason: "자외선이 매우 강해 그늘길이 훨씬 안전해요." });
    const level = dayUv >= 8 ? "매우 강함" : dayUv >= 6 ? "강함" : dayUv >= 3 ? "보통" : "약함";
    sun = { level, items };
  }

  // ── 오늘 날씨 변화 ──
  const changes: WeatherChange[] = [];
  const dry = current.precipitation < 0.3 && current.precipitationProbability < 60;
  const rainSlot = slots
    .filter((s) => s.hour > current.hour && s.hour <= 23)
    .find((s) => s.precipitation >= 0.5 || s.precipitationProbability >= 60);
  if (!dry) {
    changes.push({ emoji: "☔", text: "지금 비가 와요. 방수 자켓과 밝은 옷, 미끄럼 주의는 필수예요.", tone: "rain" });
  } else if (rainSlot) {
    changes.push({
      emoji: "🌧",
      text: `${fmtH(rainSlot.hour)}부터 비 소식이 있어요. 그 전에 뛰거나 방수 자켓을 챙기세요.`,
      tone: "rain"
    });
  }

  const uvPeak = slots
    .filter((s) => s.hour >= 10 && s.hour <= 16)
    .reduce<RunningSlot | null>((best, s) => (!best || s.uvIndex > best.uvIndex ? s : best), null);
  if (uvPeak && uvPeak.uvIndex >= 6) {
    changes.push({
      emoji: "😎",
      text: `${fmtH(uvPeak.hour)}쯤 자외선이 가장 강해요(UVI ${uvPeak.uvIndex.toFixed(0)}). 이 시간대엔 선글라스·모자 필수.`,
      tone: "sun"
    });
  }

  const noon = slots.find((s) => s.hour === 14);
  const evening = slots.find((s) => s.hour === 19);
  if (noon && evening && noon.apparentTemperature - evening.apparentTemperature >= 4) {
    changes.push({
      emoji: "🌆",
      text: `저녁엔 체감 ${Math.round(evening.apparentTemperature)}°로 선선해져요. 늦게 뛴다면 얇은 긴팔 하나 챙기면 좋아요.`,
      tone: "temp"
    });
  }

  const laterWind = Math.max(0, ...slots.filter((s) => s.hour > current.hour && s.hour <= 21).map((s) => s.windSpeed));
  if (laterWind >= 9 && current.windSpeed < 8) {
    changes.push({ emoji: "💨", text: "오후엔 바람이 강해져요. 얇은 바람막이 하나면 후반이 편해요.", tone: "wind" });
  }

  // ── 시간대별 옷차림 ──
  const byTime: OutfitTime[] = [
    { label: "아침", emoji: "🌅", hour: 8 },
    { label: "낮", emoji: "☀️", hour: 14 },
    { label: "저녁", emoji: "🌆", hour: 19 }
  ]
    .map((p) => {
      const s = slots.find((x) => x.hour === p.hour);
      if (!s) return null;
      let note = "";
      if (s.precipitation >= 0.5 || s.precipitationProbability >= 60) note = "방수 챙기기";
      else if (s.uvIndex >= 5) note = "선글라스·모자";
      else if (s.apparentTemperature <= 12) note = "긴팔 여분";
      else if (s.windSpeed >= 8) note = "바람막이";
      return { label: p.label, emoji: p.emoji, feel: Math.round(s.apparentTemperature), main: getOutfit(s).main, note };
    })
    .filter((p): p is OutfitTime => p !== null);

  const headline =
    feel >= 26
      ? "덥게 느껴지는 날이에요. 최대한 가볍게, 수분·햇빛 대비를 챙기세요."
      : feel >= 16
      ? "달리기 좋은 온도예요. 얇게 입고, 낮이면 선글라스만 더하면 완벽해요."
      : feel >= 8
      ? "초반만 서늘해요. 한 겹 얇게 걸치고 나가면 금방 적당해져요."
      : feel >= 0
      ? "쌀쌀해요. 바람을 막는 한 겹과 손·귀 보온을 챙기세요."
      : "한파예요. 여러 겹으로 든든히 입고 짧게 다녀오세요.";

  return { main: getOutfit(current).main, feels: feel, headline, categories, sun, changes: changes.slice(0, 4), byTime };
}
