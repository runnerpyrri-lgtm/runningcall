// 활동별 복장 추천 — 현재 체감 기준 기본 + 하루 날씨 변화(비·자외선·기온)에 맞춘 스마트 플랜
import type { RunningSlot } from "@/lib/scoring";
import type { ActivityKey } from "@/lib/activity";

export type OutfitAdvice = {
  main: string;
  extras: string[];
};

// 러닝은 몸에 열이 올라 체감 +5~8°C, 자전거는 속도 바람으로 더 시원, 걷기·산책은 그대로.
function mainFor(feel: number, activity: ActivityKey): string {
  if (activity === "run") {
    if (feel >= 16) return "반팔 + 반바지";
    if (feel >= 10) return "얇은 긴팔 + 반바지";
    if (feel >= 5) return "긴팔 + 긴바지";
    if (feel >= 0) return "기모 긴팔 + 긴바지";
    return "방한 상하의";
  }

  if (activity === "bike") {
    if (feel >= 23) return "저지 + 반바지";
    if (feel >= 15) return "긴팔 저지 + 긴바지";
    if (feel >= 8) return "바람막이 + 긴바지";
    if (feel >= 2) return "방풍 자켓 + 기모 하의";
    return "방한 방풍 라이딩복";
  }

  if (activity === "hike") {
    if (feel >= 22) return "기능성 반팔 + 등산 반바지";
    if (feel >= 13) return "긴팔 + 바람막이 + 등산바지";
    if (feel >= 5) return "긴팔 + 플리스 + 바람막이";
    if (feel >= -3) return "보온 레이어 + 방풍 재킷";
    return "방한 등산복 풀레이어";
  }

  // 걷기·애견산책 — 몸 열이 적어 같은 온도에서 더 따뜻하게
  if (feel >= 23) return "반팔 + 얇은 하의";
  if (feel >= 17) return "긴팔 또는 얇은 겉옷";
  if (feel >= 10) return "가벼운 자켓 + 긴바지";
  if (feel >= 3) return "따뜻한 외투 + 긴바지";
  return "패딩 + 방한 소품";
}

export function getOutfit(slot: RunningSlot, activity: ActivityKey = "run"): OutfitAdvice {
  const feel = slot.apparentTemperature;
  const extras: string[] = [];

  const main = mainFor(feel, activity);

  if (slot.precipitation >= 0.3 || (slot.precipitationProbability ?? 0) >= 60) {
    extras.push(activity === "run" ? "방수 자켓" : "우산");
  }
  if (slot.uvIndex >= 5) extras.push("선글라스");
  if (slot.windSpeed >= 8 && feel < 20) extras.push(activity === "run" ? "바람막이" : activity === "bike" ? "방풍 자켓" : "겉옷 한 겹");
  if (feel < 3) extras.push("장갑");
  if (activity === "bike") extras.push("헬멧");
  if (activity === "hike") extras.push("스틱");
  if (activity === "dog" && slot.apparentTemperature >= 26) extras.push("강아지 물통");

  return { main, extras: [...new Set(extras)].slice(0, 3) };
}

/* ------------------------------------------------------------------ *
 * 상세 플랜 (복장 시트)
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

function topFor(feel: number, activity: ActivityKey): { value: string; reason: string } {
  if (activity === "run") {
    if (feel >= 23) return { value: "반팔 티셔츠", reason: "달리면 체감이 더 올라가요. 통풍 잘 되는 기능성 소재로." };
    if (feel >= 16) return { value: "반팔 티셔츠", reason: "뛰면 금방 더워져요. 반팔이 딱 좋아요." };
    if (feel >= 10) return { value: "얇은 긴팔", reason: "초반 쌀쌀함만 막아주면 충분해요." };
    if (feel >= 5) return { value: "긴팔 + 얇은 바람막이", reason: "찬 공기를 막아주는 한 겹이 필요해요." };
    if (feel >= 0) return { value: "기모 긴팔", reason: "보온이 중요한 온도예요." };
    return { value: "방한 상의(레이어)", reason: "얇은 옷을 여러 겹 겹쳐 입으세요." };
  }

  if (activity === "bike") {
    if (feel >= 23) return { value: "반팔 저지", reason: "속도 바람에 금방 시원해져요. 통풍 되는 저지로." };
    if (feel >= 15) return { value: "긴팔 저지", reason: "달릴 때 바람을 막아주는 한 겹이 좋아요." };
    if (feel >= 8) return { value: "바람막이 자켓", reason: "속도 체감이 커요. 방풍이 핵심이에요." };
    if (feel >= 2) return { value: "방풍 자켓 + 이너", reason: "찬 바람을 정면으로 맞아요. 방풍 필수예요." };
    return { value: "방한 방풍 상의(레이어)", reason: "여러 겹에 방풍을 더하세요." };
  }

  if (activity === "hike") {
    if (feel >= 22) return { value: "기능성 반팔 + 여벌 상의", reason: "오르막에서 땀이 많이 나요. 젖으면 갈아입을 여벌이 정상에서 효자예요." };
    if (feel >= 13) return { value: "긴팔 + 바람막이", reason: "오를 땐 덥고 능선에선 추워요. 벗고 입기 쉬운 레이어링이 답이에요." };
    if (feel >= 5) return { value: "긴팔 + 플리스 + 바람막이", reason: "정상부는 여기보다 6~10°C 낮아요. 세 겹 레이어링이 기본이에요." };
    return { value: "보온 이너 + 플리스 + 방풍 재킷", reason: "산 위 추위는 평지와 차원이 달라요. 겹겹이 입으세요." };
  }

  if (feel >= 23) return { value: "반팔 티셔츠", reason: "가볍고 통풍 잘 되는 옷이 편해요." };
  if (feel >= 17) return { value: "얇은 긴팔 또는 반팔+가디건", reason: "걷는 정도면 이 정도가 딱 좋아요." };
  if (feel >= 10) return { value: "맨투맨 + 가벼운 자켓", reason: "걷기는 열이 덜 나요. 한 겹 더 챙기세요." };
  if (feel >= 3) return { value: "니트 + 따뜻한 외투", reason: "가만히 있으면 금방 추워지는 온도예요." };
  return { value: "패딩(레이어)", reason: "든든하게 껴입는 게 답이에요." };
}

function bottomFor(feel: number, activity: ActivityKey): { value: string; reason: string } {
  if (activity === "run") {
    if (feel >= 16) return { value: "반바지", reason: "가볍게, 땀 잘 마르는 기능성으로." };
    if (feel >= 10) return { value: "반바지 또는 7부", reason: "하체는 금방 열이 올라와요." };
    if (feel >= 3) return { value: "긴바지(레깅스)", reason: "무릎 관절 보온에 좋아요." };
    return { value: "기모 긴바지", reason: "다리 보온이 필수예요." };
  }

  if (activity === "bike") {
    if (feel >= 20) return { value: "반바지 또는 7부", reason: "페달 편한 신축 소재로." };
    if (feel >= 10) return { value: "긴바지(패드 있으면 좋음)", reason: "무릎 보온과 안장 편의를 챙겨요." };
    if (feel >= 2) return { value: "기모 긴바지", reason: "다리 보온이 라이딩 지속력을 좌우해요." };
    return { value: "방풍 기모 하의", reason: "찬 바람 정면 대비가 필요해요." };
  }

  if (activity === "hike") {
    if (feel >= 20) return { value: "등산 반바지 또는 7부", reason: "통풍 좋고 신축성 있는 소재가 편해요." };
    if (feel >= 8) return { value: "신축 등산바지", reason: "바위 오르내릴 때 무릎 굽힘이 편해야 해요." };
    return { value: "기모 등산바지", reason: "하체가 따뜻해야 다리에 힘이 들어가요." };
  }

  if (feel >= 20) return { value: "얇은 하의", reason: "시원하고 편한 소재가 좋아요." };
  if (feel >= 10) return { value: "긴바지", reason: "걷기엔 긴바지가 무난해요." };
  if (feel >= 3) return { value: "도톰한 긴바지", reason: "하체가 따뜻해야 덜 지쳐요." };
  return { value: "기모 바지", reason: "다리 보온이 필수예요." };
}

// 활동별 히어로 문장
function headlineFor(feel: number, activity: ActivityKey): string {
  if (activity === "run") {
    if (feel >= 26) return "덥게 느껴지는 날이에요. 최대한 가볍게, 수분·햇빛 대비를 챙기세요.";
    if (feel >= 16) return "달리기 좋은 온도예요. 얇게 입고, 낮이면 선글라스만 더하면 완벽해요.";
    if (feel >= 8) return "초반만 서늘해요. 한 겹 얇게 걸치고 나가면 금방 적당해져요.";
    if (feel >= 0) return "쌀쌀해요. 바람을 막는 한 겹과 손·귀 보온을 챙기세요.";
    return "한파예요. 여러 겹으로 든든히 입고 짧게 다녀오세요.";
  }

  if (activity === "dog") {
    if (feel >= 26) return "더운 날 산책이에요. 보호자도 강아지도 가볍게, 물은 꼭 챙기세요.";
    if (feel >= 16) return "산책하기 좋은 온도예요. 편한 차림에 낮이면 모자 하나면 충분해요.";
    if (feel >= 8) return "선선한 산책 날씨예요. 겉옷 하나 걸치고 여유롭게 다녀오세요.";
    if (feel >= 0) return "쌀쌀해요. 보호자는 따뜻하게, 소형견·단모종은 옷을 입혀주세요.";
    return "한파예요. 산책은 짧게, 강아지 발 시림도 챙겨주세요.";
  }

  if (activity === "bike") {
    if (feel >= 26) return "더운 라이딩이에요. 통풍 저지에 물통은 필수, 그늘 코스를 노리세요.";
    if (feel >= 15) return "라이딩 좋은 온도예요. 얇게 입고 아이웨어만 더하면 완벽해요.";
    if (feel >= 8) return "속도 바람이 서늘해요. 바람막이 한 겹이면 딱 좋아요.";
    if (feel >= 2) return "찬 바람을 정면으로 맞아요. 방풍 자켓과 장갑을 꼭 챙기세요.";
    return "한파 라이딩이에요. 방풍·방한 단단히 하고 짧게 다녀오세요.";
  }

  if (activity === "hike") {
    if (feel >= 24) return "더운 산행이에요. 물은 평소 1.5배, 이른 시간 출발에 그늘 코스를 노리세요.";
    if (feel >= 13) return "산행하기 좋은 온도예요. 정상 방한용 바람막이 한 겹만 더 챙기세요.";
    if (feel >= 5) return "능선은 서늘해요. 플리스와 바람막이로 레이어링하세요.";
    if (feel >= -3) return "추운 산행이에요. 방풍·방한 단단히 하고 하산 시간을 여유 있게 잡으세요.";
    return "한파 산행이에요. 풀레이어에 아이젠까지, 무리는 절대 금물이에요.";
  }

  if (feel >= 26) return "덥게 느껴지는 날이에요. 가볍게 입고 그늘길로 다니세요.";
  if (feel >= 16) return "걷기 좋은 온도예요. 편한 차림에 낮이면 선글라스만 더해요.";
  if (feel >= 8) return "살짝 서늘해요. 가벼운 겉옷 하나 걸치고 나가세요.";
  if (feel >= 0) return "쌀쌀해요. 따뜻한 외투와 손 보온을 챙기세요.";
  return "한파예요. 든든히 입고 짧게 다녀오세요.";
}

export function getOutfitPlan(slots: RunningSlot[], current: RunningSlot, activity: ActivityKey = "run"): OutfitPlan {
  const feel = current.apparentTemperature;
  const isRun = activity === "run";
  const isDog = activity === "dog";
  const isBike = activity === "bike";
  const isHike = activity === "hike";
  const top = topFor(feel, activity);
  const bottom = bottomFor(feel, activity);

  const categories: OutfitCategory[] = [
    { emoji: "👕", label: "상의", value: top.value, reason: top.reason },
    { emoji: "🩳", label: "하의", value: bottom.value, reason: bottom.reason }
  ];

  if (feel < 3) {
    categories.push({ emoji: "🧤", label: "손·목", value: "장갑 + 넥워머", reason: "손끝과 목이 가장 먼저 시려요." });
    categories.push({ emoji: "🧣", label: "머리", value: "비니 / 귀마개", reason: "귀·머리 보온으로 체온을 지켜요." });
  } else if (feel < 8) {
    categories.push({ emoji: "🧤", label: "손", value: "얇은 장갑", reason: isRun ? "초반 10분 손 시림을 막아줘요." : "주머니 대신 장갑이 안전해요." });
  }

  if (current.windSpeed >= 8 && feel < 20) {
    categories.push({
      emoji: "💨",
      label: "바람막이",
      value: isRun ? "얇은 바람막이" : "바람 막는 겉옷",
      reason: `바람 ${current.windSpeed.toFixed(0)}m/s로 체감이 더 낮아요.`
    });
  }

  if (current.precipitation >= 0.3 || (current.precipitationProbability ?? 0) >= 60) {
    categories.push({
      emoji: isRun ? "🧥" : "☂️",
      label: "비 대비",
      value: isRun ? "방수 자켓 + 챙 모자" : isDog ? "우산 + 강아지 우비" : "우산 + 방수 신발",
      reason: isRun ? "지금 비가 올 수 있어요. 젖으면 체온이 확 떨어져요." : "비 소식이 있어요. 젖지 않게 챙기세요."
    });
  }

  // 애견산책 전용 준비물
  if (isDog) {
    categories.push({ emoji: "🐕", label: "산책 준비물", value: "배변봉투 + 물", reason: "기본 매너와 강아지 수분 보충은 필수예요." });
    if (feel >= 26) {
      categories.push({ emoji: "🐾", label: "발바닥 보호", value: "그늘길·흙길 코스", reason: "뜨거운 아스팔트는 발바닥 화상 위험이 있어요." });
    }
  }

  // 등산 전용 준비물
  if (isHike) {
    categories.push({ emoji: "🎒", label: "필수 준비물", value: "물 + 간식 + 보조배터리", reason: "산에서는 체력과 연락 수단이 곧 안전이에요." });
    categories.push({ emoji: "🥾", label: "발·무릎", value: "등산화 + 스틱", reason: "미끄럼 방지와 무릎 보호에 가장 큰 차이를 만들어요." });
    if (feel < 10 || current.windSpeed >= 8) {
      categories.push({ emoji: "🧥", label: "정상 방한", value: "플리스·바람막이 한 겹", reason: "정상부는 여기보다 6~10°C 낮고 바람이 강해요." });
    }
  }

  // 자전거 전용 안전 장비
  if (isBike) {
    categories.push({ emoji: "⛑️", label: "안전 장비", value: "헬멧 + 장갑", reason: "라이딩 안전의 기본이에요." });
    if (current.uvIndex >= 3 || feel >= 20) {
      categories.push({ emoji: "🕶️", label: "아이웨어", value: "라이딩 고글", reason: "바람·벌레·자외선에서 눈을 지켜요." });
    }
    if (current.precipitation >= 0.3 || (current.precipitationProbability ?? 0) >= 60 || current.uvIndex <= 1) {
      categories.push({ emoji: "🔦", label: "라이트", value: "전조등 + 후미등", reason: "흐리거나 비 오면 시야 확보가 안전을 좌우해요." });
    }
  }

  // ── 햇빛·자외선 (낮 시간용, 선글라스 적극 활용) ──
  const dayUv = Math.max(0, ...slots.filter((s) => s.hour >= 8 && s.hour <= 18).map((s) => s.uvIndex));
  let sun: OutfitPlan["sun"] = null;
  if (dayUv >= 3) {
    const items: OutfitItem[] = [
      {
        emoji: "🕶️",
        label: isRun ? "스포츠 선글라스" : "선글라스",
        reason: isRun ? "눈부심과 눈 피로를 줄여 더 편하게 달려요." : "눈부심을 줄여 한결 편하게 다닐 수 있어요."
      }
    ];
    if (dayUv >= 5) items.push({ emoji: "🧢", label: "챙 모자 + 선크림", reason: "얼굴·두피 자외선을 막아줘요." });
    if (dayUv >= 6 && feel >= 16 && isRun) items.push({ emoji: "🧴", label: "팔토시(쿨토시)", reason: "팔 자외선을 막고 시원하게 유지돼요." });
    if (dayUv >= 6 && isDog) items.push({ emoji: "🐾", label: "지면 온도 확인", reason: "볕 강한 날 아스팔트는 발바닥에 위험해요. 손등 5초 테스트." });
    if (dayUv >= 8) items.push({ emoji: "🌳", label: "그늘 코스 선택", reason: "자외선이 매우 강해 그늘길이 훨씬 안전해요." });
    const level = dayUv >= 8 ? "매우 강함" : dayUv >= 6 ? "강함" : dayUv >= 3 ? "보통" : "약함";
    sun = { level, items };
  }

  // ── 오늘 날씨 변화 ──
  const changes: WeatherChange[] = [];
  const dry = current.precipitation < 0.3 && (current.precipitationProbability ?? 0) < 60;
  const rainSlot = slots
    .filter((s) => s.hour > current.hour && s.hour <= 23)
    .find((s) => s.precipitation >= 0.5 || (s.precipitationProbability ?? 0) >= 60);
  if (!dry) {
    changes.push({
      emoji: "☔",
      text: isRun
        ? "지금 비가 와요. 방수 자켓과 밝은 옷, 미끄럼 주의는 필수예요."
        : "지금 비가 와요. 우산 챙기고 미끄러운 곳을 조심하세요.",
      tone: "rain"
    });
  } else if (rainSlot) {
    changes.push({
      emoji: "🌧",
      text: isRun
        ? `${fmtH(rainSlot.hour)}부터 비 소식이 있어요. 그 전에 뛰거나 방수 자켓을 챙기세요.`
        : isDog
        ? `${fmtH(rainSlot.hour)}부터 비 소식이 있어요. 산책은 그 전에 다녀오세요.`
        : `${fmtH(rainSlot.hour)}부터 비 소식이 있어요. 우산을 미리 챙겨 나가세요.`,
      tone: "rain"
    });
  }

  const uvPeak = slots
    .filter((s) => s.hour >= 10 && s.hour <= 16)
    .reduce<RunningSlot | null>((best, s) => (!best || s.uvIndex > best.uvIndex ? s : best), null);
  if (uvPeak && uvPeak.uvIndex >= 6) {
    changes.push({
      emoji: "😎",
      text: isDog
        ? `${fmtH(uvPeak.hour)}쯤 볕이 가장 세요(UVI ${uvPeak.uvIndex.toFixed(0)}). 이 시간대 산책은 피하는 게 좋아요.`
        : `${fmtH(uvPeak.hour)}쯤 자외선이 가장 강해요(UVI ${uvPeak.uvIndex.toFixed(0)}). 이 시간대엔 선글라스·모자 필수.`,
      tone: "sun"
    });
  }

  const noon = slots.find((s) => s.hour === 14);
  const evening = slots.find((s) => s.hour === 19);
  if (noon && evening && noon.apparentTemperature - evening.apparentTemperature >= 4) {
    changes.push({
      emoji: "🌆",
      text: isRun
        ? `저녁엔 체감 ${Math.round(evening.apparentTemperature)}°로 선선해져요. 늦게 뛴다면 얇은 긴팔 하나 챙기면 좋아요.`
        : `저녁엔 체감 ${Math.round(evening.apparentTemperature)}°로 선선해져요. 늦게 나간다면 겉옷 하나 챙기세요.`,
      tone: "temp"
    });
  }

  const laterWind = Math.max(0, ...slots.filter((s) => s.hour > current.hour && s.hour <= 21).map((s) => s.windSpeed));
  if (laterWind >= 9 && current.windSpeed < 8) {
    changes.push({
      emoji: "💨",
      text: isRun ? "오후엔 바람이 강해져요. 얇은 바람막이 하나면 후반이 편해요." : "오후엔 바람이 강해져요. 겉옷 하나 챙기면 든든해요.",
      tone: "wind"
    });
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
      if (s.precipitation >= 0.5 || (s.precipitationProbability ?? 0) >= 60) note = isRun ? "방수 챙기기" : "우산 챙기기";
      else if (s.uvIndex >= 5) note = isDog ? "그늘길로" : "선글라스·모자";
      else if (s.apparentTemperature <= 12) note = isRun ? "긴팔 여분" : "겉옷 챙기기";
      else if (s.windSpeed >= 8) note = isRun ? "바람막이" : "겉옷 한 겹";
      return { label: p.label, emoji: p.emoji, feel: Math.round(s.apparentTemperature), main: getOutfit(s, activity).main, note };
    })
    .filter((p): p is OutfitTime => p !== null);

  return {
    main: getOutfit(current, activity).main,
    feels: feel,
    headline: headlineFor(feel, activity),
    categories,
    sun,
    changes: changes.slice(0, 4),
    byTime
  };
}
