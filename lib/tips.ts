type TipInput = {
  score: number;
  timeLabel: string;
  temperature: number;
  humidity: number;
  pm25: number;
  uvIndex: number;
  precipitation?: number;
  precipitationProbability?: number;
  windSpeed?: number;
};

function pick(variants: string[], seed: number) {
  return variants[Math.abs(seed) % variants.length];
}

export function composeLocalTip(input: TipInput) {
  const t = input.timeLabel;
  // 날짜·조건이 바뀌면 멘트도 자연스럽게 바뀌도록 입력값 기반 시드
  const seed = Math.round(input.score + input.temperature * 3 + input.humidity + input.uvIndex * 7);

  const rainAmount = input.precipitation ?? 0;
  const rainProb = input.precipitationProbability ?? 0;
  const wind = input.windSpeed ?? 0;

  if (rainAmount >= 1) {
    return pick(
      [
        `비가 와요. 오늘은 실내 러닝머신이나 계단 운동으로 대체하는 게 좋겠어요.`,
        `노면이 젖어 미끄러워요. 꼭 나가야 한다면 접지력 좋은 신발과 밝은 옷을 챙기세요.`,
        `빗길 러닝은 부상 위험이 커요. 오늘은 스트레칭과 근력운동으로 몸을 아껴두세요.`
      ],
      seed
    );
  }

  if (rainProb >= 60) {
    return pick(
      [
        `${t} 전후로 비 소식이 있어요. 하늘을 보고 짧은 코스로 계획하세요.`,
        `비 올 확률이 높아요. ${t}에 나간다면 방수 자켓을 걸치고 집 근처를 도는 게 안전해요.`,
        `우산 챙길 날씨예요. 러닝은 비 예보가 지나간 뒤가 나을 수 있어요.`
      ],
      seed
    );
  }

  if (input.pm25 > 35) {
    return pick(
      [
        `미세먼지가 변수예요. ${t}에 뛰더라도 강도는 낮추고 호흡이 답답하면 실내로 바꾸세요.`,
        `공기가 좋지 않아요. 오늘은 큰길보다 공원 안쪽, 짧은 코스를 추천해요.`,
        `미세먼지가 높은 날은 코로 숨쉬기 힘들어요. 가벼운 조깅까지만, 무리는 금물이에요.`
      ],
      seed
    );
  }

  if (input.temperature >= 30) {
    return pick(
      [
        `한낮 더위가 강해요. 해 지기 전후 ${t}에 물병 들고 그늘 코스로 다녀오세요.`,
        `열사병 주의 날씨예요. 페이스를 평소보다 확 낮추고, 어지러우면 바로 멈추세요.`,
        `더위가 만만치 않아요. 러닝 전 500ml 수분 보충, 코스는 짧게 잡는 게 좋아요.`
      ],
      seed
    );
  }

  if (input.uvIndex >= 6) {
    return pick(
      [
        `자외선이 강해요. ${t} 러닝은 모자와 선크림을 챙기고 그늘 코스를 고르세요.`,
        `햇볕이 따가운 시간대예요. 선글라스에 모자까지 챙기면 훨씬 편하게 뛸 수 있어요.`,
        `자외선 지수가 높아요. 노출 부위에 선크림을 바르고, 가로수길 코스를 추천해요.`
      ],
      seed
    );
  }

  if (wind >= 8) {
    return pick(
      [
        `바람이 꽤 불어요. 갈 때 맞바람, 올 때 뒷바람 코스로 계획하면 한결 수월해요.`,
        `강한 바람엔 체감온도가 뚝 떨어져요. 바람막이 하나 걸치고 나가세요.`,
        `바람이 강한 날은 기록 욕심은 접어두고, 몸 풀기 러닝으로 가볍게 다녀오세요.`
      ],
      seed
    );
  }

  if (input.humidity >= 75) {
    return pick(
      [
        `습도가 높아 땀이 잘 안 말라요. ${t}에는 물을 먼저 챙기고 인터벌보다 조깅이 낫습니다.`,
        `끈적한 날씨예요. 통풍 잘 되는 옷을 입고, 평소보다 천천히 달리세요.`,
        `습한 날은 심박수가 빨리 올라가요. 페이스를 10~15% 낮추는 게 요령이에요.`
      ],
      seed
    );
  }

  if (input.temperature <= 0) {
    return pick(
      [
        `기온이 영하권이에요. 실내에서 충분히 몸을 데운 뒤 나가고, 장갑은 필수예요.`,
        `추운 날은 근육 부상이 잦아요. 워밍업 10분 이상, 첫 1km는 아주 천천히요.`,
        `칼바람 부는 날엔 귀마개와 장갑이 러닝의 절반이에요. 보온 챙기고 짧게 다녀오세요.`
      ],
      seed
    );
  }

  if (input.score >= 88) {
    return pick(
      [
        `${t} 전후가 가장 산뜻해요. 가볍게 몸을 풀고 평소 페이스로 달려도 좋습니다.`,
        `오늘 같은 날이 러닝하기 제일 좋은 날이에요. ${t}에 나가서 마음껏 달리세요!`,
        `컨디션 최고의 날! 기록 도전해 보고 싶다면 오늘 ${t}이 기회예요.`,
        `날씨가 러닝을 도와주는 날이에요. ${t}에 나가면 발걸음이 가벼울 거예요.`
      ],
      seed
    );
  }

  if (input.score >= 72) {
    return pick(
      [
        `${t}에 나가면 무리 없이 달리기 좋아요. 초반 10분만 천천히 올려보세요.`,
        `뛰기 좋은 날이에요. ${t} 전후로 5km 정도 가볍게 어떠세요?`,
        `${t}이 오늘의 골든타임이에요. 스트레칭 5분 하고 출발하세요.`,
        `괜찮은 컨디션이에요. ${t}에 나가서 편한 페이스로 즐기다 오세요.`
      ],
      seed
    );
  }

  if (input.score >= 55) {
    return pick(
      [
        `오늘은 컨디션을 보며 짧게 다녀오세요. ${t} 전후로 20~30분 조깅이 적당해요.`,
        `무난한 날씨지만 욕심은 금물이에요. ${t}에 가볍게 몸만 풀고 오세요.`,
        `보통 컨디션이에요. 오늘은 거리보다 자세에 집중하는 러닝 어때요?`
      ],
      seed
    );
  }

  return pick(
    [
      `오늘은 무리하지 않는 게 좋겠어요. 실내 스트레칭이나 근력운동으로 대체해 보세요.`,
      `컨디션이 좋지 않은 날이에요. 휴식도 훈련의 일부라는 걸 기억하세요.`,
      `굳이 나간다면 ${t} 전후로 15분 이내, 아주 가볍게만 다녀오세요.`
    ],
    seed
  );
}
