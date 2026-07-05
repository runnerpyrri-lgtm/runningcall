import { NextResponse } from "next/server";
import { composeLocalTip } from "@/lib/tips";

type TipRequest = {
  locationName?: string;
  score?: number;
  timeLabel?: string;
  comment?: string;
  temperature?: number;
  humidity?: number;
  pm10?: number;
  pm25?: number;
  uvIndex?: number;
  precipitation?: number;
  precipitationProbability?: number;
  windSpeed?: number;
};

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function buildFallback(body: TipRequest) {
  return composeLocalTip({
    score: numberOrZero(body.score),
    timeLabel: body.timeLabel || "추천 시간",
    temperature: numberOrZero(body.temperature),
    humidity: numberOrZero(body.humidity),
    pm25: numberOrZero(body.pm25),
    uvIndex: numberOrZero(body.uvIndex),
    precipitation: numberOrZero(body.precipitation),
    precipitationProbability: numberOrZero(body.precipitationProbability),
    windSpeed: numberOrZero(body.windSpeed)
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as TipRequest;
  const fallback = buildFallback(body);
  const apiKey = process.env.AI_GATEWAY_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ tip: fallback, source: "local" });
  }

  const model = process.env.AI_GATEWAY_MODEL || "anthropic/claude-sonnet-4.6";

  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content:
              "너는 한국어 러닝 컨디션 코치다. 날씨 데이터를 바탕으로 안전하고 실용적인 한 문장 조언만 쓴다. 과장하지 말고 90자 안팎으로 답한다."
          },
          {
            role: "user",
            content: JSON.stringify({
              locationName: body.locationName,
              score: body.score,
              bestTime: body.timeLabel,
              comment: body.comment,
              temperatureC: body.temperature,
              humidityPercent: body.humidity,
              pm10: body.pm10,
              pm25: body.pm25,
              uvIndex: body.uvIndex,
              precipitationMm: body.precipitation,
              precipitationProbability: body.precipitationProbability,
              windSpeedMs: body.windSpeed
            })
          }
        ]
      })
    });

    if (!response.ok) {
      return NextResponse.json({ tip: fallback, source: "local" });
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const tip = data.choices?.[0]?.message?.content?.trim();

    return NextResponse.json({ tip: tip || fallback, source: tip ? "ai" : "local" });
  } catch {
    return NextResponse.json({ tip: fallback, source: "local" });
  }
}
