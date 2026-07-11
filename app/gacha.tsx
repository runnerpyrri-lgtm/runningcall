"use client";

// 가챠 카드 히어로 + 추천 시간대 슬롯 릴 — v0.13 리디자인 표현 계층 (점수 로직 lib 불변)
import { useCallback, useEffect, useRef, useState } from "react";
import type { RunningSlot } from "@/lib/scoring";

/* ================= 티어 (80+ 골드 / 10점 간격 / ≤20 재난) ================= */

export type GachaTier = {
  min: number;
  cls: string;
  grade: string;
  color: string;
  ray: string;
  stars: number;
  foil: number;
  odds: string;
  says: string[];
  subs: string[];
};

const TIERS: GachaTier[] = [
  {
    min: 80, cls: "t9", grade: "LEGENDARY", color: "#ffce4a", ray: "#ffce4a", stars: 5, foil: 1,
    odds: "상위 5% 날씨",
    says: ["🏆 오늘은 그냥 전설!", "⚡ 미쳤다, 이 하늘!", "👑 올해 최고의 날 후보!", "✨ 완벽 그 자체!"],
    subs: ["묻지도 따지지도 말고 나가요", "이런 날씨는 소장각이에요", "오늘 나가는 사람이 승자예요", "지금 밖이 곧 선물이에요"]
  },
  {
    min: 70, cls: "t8", grade: "EPIC", color: "#b06aff", ray: "#b06aff", stars: 4, foil: 0.8,
    odds: "상위 15% 날씨",
    says: ["💜 에픽 등급! 아주 훌륭해요", "🔮 보랏빛 행운의 날!"],
    subs: ["저녁까지 쭉 좋아요, 여유롭게 나가요", "이 정도면 코스를 늘려도 돼요"]
  },
  {
    min: 60, cls: "t7", grade: "SUPER RARE", color: "#55e6d0", ray: "#55e6d0", stars: 4, foil: 0.55,
    odds: "상위 30% 날씨",
    says: ["🌊 슈퍼레어! 청량한 날", "✨ 바람이 기분 좋은 날"],
    subs: ["물 한 병 들고 가볍게 나가봐요", "나가기 딱 좋은 공기예요"]
  },
  {
    min: 50, cls: "t6", grade: "RARE", color: "#5aa8ff", ray: "#5aa8ff", stars: 3, foil: 0.35,
    odds: "딱 중간 이상",
    says: ["🔷 레어 — 절반 이상 성공!", "💙 무난 이상, 꽤 좋아요"],
    subs: ["짧은 코스로 기분 전환 어때요", "해 지기 전이 더 좋아요"]
  },
  {
    min: 40, cls: "t5", grade: "UNCOMMON", color: "#6ecb7f", ray: "#6ecb7f", stars: 3, foil: 0,
    odds: "흔하지만 나쁘지 않아요",
    says: ["🍀 평범하지만 나쁘지 않아요", "🌿 짧은 외출은 충분해요"],
    subs: ["동네 한 바퀴 정도가 딱이에요", "무리하지 않는 선에서 즐겨요"]
  },
  {
    min: 30, cls: "t4", grade: "COMMON", color: "#8a8f98", ray: "#8a8f98", stars: 2, foil: 0,
    odds: "하위 35% 날씨",
    says: ["😐 오늘은 그냥 그래요", "🌫 밋밋한 하늘이네요"],
    subs: ["나가도 그만, 안 나가도 그만", "기대 없이 나가면 중간은 가요"]
  },
  {
    min: 21, cls: "t3", grade: "GLOOMY", color: "#616a76", ray: "#616a76", stars: 1, foil: 0,
    odds: "하위 15% 날씨",
    says: ["😶 하늘이 무겁네요…", "☁️ 우중충 그 자체"],
    subs: ["실내 스트레칭이 나은 날이에요", "창밖 구경으로 충분해요"]
  },
  {
    min: 0, cls: "t0", grade: "DISASTER", color: "#7a4a52", ray: "#7a4a52", stars: 0, foil: 0,
    odds: "하위 3% — 재난급",
    says: ["🚨 재난급! 나가지 마세요", "⛔ 오늘은 포기가 승리예요"],
    subs: ["집이 세상에서 제일 안전해요", "이불 밖은 진짜 위험해요"]
  }
];

export function tierOf(score: number): GachaTier {
  for (const tier of TIERS) {
    if (score >= tier.min) return tier;
  }
  return TIERS[TIERS.length - 1];
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/* ================= 실측 날씨 → 카드 연출 파라미터 ================= */

export type CardWeatherFx = {
  mode: "rain" | "snow" | "none";
  count: number;
  sun: boolean;
  cloud: boolean;
  storm: boolean;
  snowpile: boolean;
};

export function weatherFxFrom(slot: RunningSlot): CardWeatherFx {
  const snowAmount = slot.snowfall ?? 0;
  const cold = Math.min(slot.temperature, slot.apparentTemperature) <= 1.5;
  const wetPrecip = slot.precipitation >= 0.1;
  const snow = snowAmount > 0.03 || (wetPrecip && cold);
  const wet = !snow && (wetPrecip || (slot.precipitationProbability ?? 0) >= 60);
  const mode: CardWeatherFx["mode"] = snow ? "snow" : wet ? "rain" : "none";
  const count =
    mode === "rain"
      ? Math.round(Math.min(64, 28 + slot.precipitation * 12 + (slot.precipitationProbability ?? 0) * 0.18))
      : mode === "snow"
      ? Math.round(Math.min(54, 24 + snowAmount * 45))
      : 0;
  const cloud = mode !== "none" || (slot.precipitationProbability ?? 0) >= 25 || (slot.cloudCover ?? 0) >= 55;
  const sun = mode === "none" && (slot.precipitationProbability ?? 0) < 30 && (slot.cloudCover ?? 0) < 70;
  const storm = mode === "rain" && (slot.precipitation >= 8 || (slot.windGust ?? 0) >= 14);
  return { mode, count, sun, cloud, storm, snowpile: mode === "snow" };
}

type SkySet = { sk1: string; sk2: string; gr1: string; gr2: string };

function skyFor(score: number, fx: CardWeatherFx): SkySet {
  if (fx.mode === "snow") return { sk1: "#5f7186", sk2: "#b3c2d1", gr1: "#e9eef4", gr2: "#c3ccd6" };
  if (fx.storm) return { sk1: "#20262f", sk2: "#39424f", gr1: "#232f27", gr2: "#141c15" };
  if (fx.mode === "rain") return { sk1: "#44515f", sk2: "#717d8b", gr1: "#334a3a", gr2: "#213325" };
  if (score >= 80) return { sk1: "#3f93e6", sk2: "#bfe4ff", gr1: "#3f7a4c", gr2: "#2b5638" };
  if (score >= 55) return { sk1: "#6f92b2", sk2: "#cbdae6", gr1: "#3a6647", gr2: "#264631" };
  return { sk1: "#57616e", sk2: "#8b96a3", gr1: "#37503f", gr2: "#22392a" };
}

/* ================= FX 엔진 (싱글턴, 뷰포트 전체) ================= */

type BoomPart = {
  x: number; y: number; vx: number; vy: number; g: number;
  r: number; c: string; life: number; max: number;
  kind: 0 | 1 | 2; // 0 dot, 1 streak, 2 confetti
  rot?: number; vr?: number; w?: number; h?: number;
};

const DPR = () => Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 1.25);

const FX = {
  root: null as HTMLDivElement | null,
  ambient: null as HTMLDivElement | null,
  canvas: null as HTMLCanvasElement | null,
  ctx: null as CanvasRenderingContext2D | null,
  bolts: null as SVGSVGElement | null,
  flash: null as HTMLDivElement | null,
  stampEl: null as HTMLDivElement | null,
  parts: [] as BoomPart[],
  raf: 0,
  rm: false,

  ensure() {
    if (this.root || typeof document === "undefined") return;
    this.rm = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ambient = document.createElement("div");
    ambient.className = "gfx-ambient";
    ambient.innerHTML =
      '<div class="gfx-predark"></div><div class="gfx-vig"></div><div class="gfx-darkveil"></div>' +
      '<div class="gfx-dimflick"></div><div class="gfx-alarm"></div><div class="gfx-goldveil"></div>' +
      '<div class="gfx-aurora"></div><div class="gfx-fog gfx-f1"></div><div class="gfx-fog gfx-f2"></div>';
    document.body.appendChild(ambient);
    this.ambient = ambient;

    const root = document.createElement("div");
    root.className = "gfx-root";
    document.body.appendChild(root);
    this.root = root;

    const canvas = document.createElement("canvas");
    canvas.className = "gfx-boom";
    root.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    const bolts = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    bolts.setAttribute("class", "gfx-bolts");
    root.appendChild(bolts);
    this.bolts = bolts;

    const flash = document.createElement("div");
    flash.className = "gfx-flash";
    root.appendChild(flash);
    this.flash = flash;

    const stamp = document.createElement("div");
    stamp.className = "gfx-stamp";
    root.appendChild(stamp);
    this.stampEl = stamp;

    const resize = () => {
      const d = DPR();
      canvas.width = Math.round(window.innerWidth * d);
      canvas.height = Math.round(window.innerHeight * d);
      this.ctx?.setTransform(d, 0, 0, d, 0, 0);
      bolts.setAttribute("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`);
    };
    resize();
    window.addEventListener("resize", resize);
  },

  loop() {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.985; p.life -= 1;
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 1) {
        ctx.strokeStyle = p.c; ctx.globalAlpha = a; ctx.lineWidth = p.r;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2.6, p.y - p.vy * 2.6); ctx.stroke();
      } else if (p.kind === 2) {
        p.rot = (p.rot ?? 0) + (p.vr ?? 0);
        ctx.save();
        ctx.globalAlpha = Math.min(1, a * 1.6);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        const hw = (p.w ?? 5) / 2;
        const hh = (p.h ?? 8) / 2;
        ctx.fillRect(-hw, -hh, p.w ?? 5, p.h ?? 8);
        ctx.restore();
      } else {
        ctx.globalAlpha = a; ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a + 0.4, 0, 6.3); ctx.fill();
      }
      if (p.life <= 0 || p.y > h + 30) this.parts.splice(i, 1);
    }
    ctx.globalAlpha = 1;
    if (this.parts.length) this.raf = requestAnimationFrame(() => this.loop());
    else ctx.clearRect(0, 0, w, h);
  },

  kick() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.loop());
  },

  clearParts() {
    this.parts.length = 0;
    this.ctx?.clearRect(0, 0, window.innerWidth, window.innerHeight);
  },

  // 파티클 상한 — 저사양 기기에서도 프레임 유지
  cap(add: number) {
    const MAX = 120;
    const room = MAX - this.parts.length;
    return Math.max(0, Math.min(add, room));
  },

  burst(x: number, y: number, n: number, colors: string[], pw: number, g: number) {
    this.ensure(); if (this.rm) return;
    n = this.cap(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const v = (0.25 + Math.random()) * pw;
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - pw * 0.35, g,
        r: 1.4 + Math.random() * 2.6, c: colors[i % colors.length],
        life: 40 + Math.random() * 36, max: 70, kind: Math.random() < 0.45 ? 1 : 0
      });
    }
    this.kick();
  },

  meteor(n: number, colors: string[]) {
    this.ensure(); if (this.rm) return;
    n = this.cap(n);
    const w = window.innerWidth;
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: Math.random() * w, y: -20 - Math.random() * 80,
        vx: -(1.2 + Math.random() * 2), vy: 5.5 + Math.random() * 4, g: 0.015,
        r: 1.6 + Math.random() * 1.6, c: colors[i % colors.length],
        life: 56 + Math.random() * 30, max: 86, kind: 1
      });
    }
    this.kick();
  },

  shootStars(n: number, colors: string[]) {
    this.ensure(); if (this.rm) return;
    n = this.cap(n);
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < n; i++) {
      const fromLeft = Math.random() < 0.5;
      this.parts.push({
        x: fromLeft ? -24 : w + 24, y: h * 0.1 + Math.random() * h * 0.6,
        vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 5), vy: (Math.random() - 0.5) * 1.6, g: 0,
        r: 1.5 + Math.random() * 1.4, c: colors[i % colors.length],
        life: 60 + Math.random() * 20, max: 80, kind: 1
      });
    }
    this.kick();
  },

  fountain(x: number, n: number, colors: string[]) {
    this.ensure(); if (this.rm) return;
    n = this.cap(n);
    const y = window.innerHeight + 4;
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: x + (Math.random() - 0.5) * 34, y,
        vx: (Math.random() - 0.5) * 3.4, vy: -(7 + Math.random() * 6), g: 0.2,
        r: 1.5 + Math.random() * 2.2, c: colors[i % colors.length],
        life: 52 + Math.random() * 26, max: 78, kind: Math.random() < 0.6 ? 1 : 0
      });
    }
    this.kick();
  },

  bubbles(x: number, y: number, n: number, colors: string[]) {
    this.ensure(); if (this.rm) return;
    n = this.cap(n);
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: x + (Math.random() - 0.5) * 180, y: y + Math.random() * 60,
        vx: (Math.random() - 0.5) * 0.8, vy: -(1.2 + Math.random() * 2), g: -0.012,
        r: 1.6 + Math.random() * 2.2, c: colors[i % colors.length],
        life: 50 + Math.random() * 30, max: 80, kind: 0
      });
    }
    this.kick();
  },

  dustFall(x: number, y: number, n: number, colors: string[]) {
    this.ensure(); if (this.rm) return;
    n = this.cap(n);
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: x + (Math.random() - 0.5) * 150, y,
        vx: (Math.random() - 0.5) * 1.2, vy: 0.4 + Math.random() * 1.2, g: 0.05,
        r: 1.2 + Math.random() * 1.8, c: colors[i % colors.length],
        life: 44 + Math.random() * 24, max: 68, kind: 0
      });
    }
    this.kick();
  },

  // 색종이 — 캔버스 파티클(회전 낙하). DOM 노드를 만들지 않아 스폰 시 렉이 없음.
  confetti(n: number, colors?: string[]) {
    this.ensure(); if (this.rm) return;
    n = this.cap(n);
    const cs = colors || ["#ffce4a", "#ff6a5e", "#5ee0b0", "#fff", "#ffa9ec", "#7fc8ff", "#ffb52e"];
    const w = window.innerWidth;
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: Math.random() * w, y: -20 - Math.random() * 60,
        vx: (Math.random() - 0.5) * 2.2, vy: 2.2 + Math.random() * 2.6, g: 0.05,
        r: 0, c: cs[i % cs.length], life: 150 + Math.random() * 60, max: 210, kind: 2,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
        w: 5 + Math.random() * 4, h: 8 + Math.random() * 5
      });
    }
    this.kick();
  },

  ring(x: number, y: number, color: string, scale: number) {
    this.ensure(); if (this.rm || !this.root) return;
    const el = document.createElement("div");
    el.className = "gfx-ring";
    const size = Math.min(window.innerWidth, 430) * 0.92 * scale;
    el.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;--rc:${color}`;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 900);
  },

  edge(color: string) {
    this.ensure(); if (this.rm || !this.root) return;
    const el = document.createElement("div");
    el.className = "gfx-edge";
    el.style.setProperty("--ec", color);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  },

  flashBig(color?: string) {
    this.ensure(); if (!this.flash) return;
    this.flash.classList.remove("go", "mini");
    this.flash.style.background = color || "#fff";
    void this.flash.offsetWidth;
    this.flash.classList.add("go");
  },

  flashMini() {
    this.ensure(); if (!this.flash) return;
    this.flash.classList.remove("go", "mini");
    this.flash.style.background = "#fff";
    void this.flash.offsetWidth;
    this.flash.classList.add("mini");
  },

  shake(cls: "sh-sm" | "sh-lg", el?: HTMLElement | null) {
    if (this.rm) return;
    const target = el || (document.querySelector(".app-shell") as HTMLElement | null);
    if (!target) return;
    target.classList.remove("sh-sm", "sh-lg");
    void target.offsetWidth;
    target.classList.add(cls);
  },

  strike(tx: number, ty: number, big: boolean, color: string, glow: string[]) {
    this.ensure(); if (this.rm || !this.bolts) return;
    const w = window.innerWidth;
    const sx = w * 0.2 + Math.random() * w * 0.6;
    let d = `M${sx} 0`;
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = sx + (tx - sx) * t + (Math.random() - 0.5) * 56 * (1 - t * 0.5);
      const y = ty * t + (Math.random() - 0.5) * 14;
      d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    const filter = `drop-shadow(0 0 7px ${glow[0]}) drop-shadow(0 0 20px ${glow[1]}) drop-shadow(0 0 40px ${glow[2]})`;
    const ns = "http://www.w3.org/2000/svg";
    const main = document.createElementNS(ns, "path");
    main.setAttribute("d", d);
    main.setAttribute("class", "gfx-bolt");
    main.style.stroke = color;
    main.style.filter = filter;
    this.bolts.appendChild(main);
    const bx0 = sx + (tx - sx) * 0.4;
    const by0 = ty * 0.4;
    let d2 = `M${bx0} ${by0}`;
    for (let j = 1; j <= 4; j++) {
      d2 += ` L${bx0 + (Math.random() - 0.5) * 74 - 30 * j * 0.4} ${by0 + j * 27 + (Math.random() - 0.5) * 10}`;
    }
    const branch = document.createElementNS(ns, "path");
    branch.setAttribute("d", d2);
    branch.setAttribute("class", "gfx-bolt thin");
    branch.style.stroke = color;
    branch.style.filter = filter;
    this.bolts.appendChild(branch);
    this.flashMini();
    this.shake(big ? "sh-lg" : "sh-sm");
    this.ring(tx, ty, glow[0], big ? 1.3 : 0.95);
    this.burst(tx, ty, big ? 26 : 14, [color, glow[0], glow[1]], big ? 7 : 5, 0.14);
    setTimeout(() => { main.remove(); branch.remove(); }, 340);
  },

  stamp(text: string, color: string) {
    this.ensure(); if (this.rm || !this.stampEl) return;
    this.stampEl.textContent = text;
    this.stampEl.style.setProperty("--fr", color);
    this.stampEl.classList.remove("slam");
    void this.stampEl.offsetWidth;
    this.stampEl.classList.add("slam");
  },

  predark(on: boolean) {
    this.ensure();
    this.ambient?.classList.toggle("predark-on", on);
  },

  mood(mood: "" | "gold" | "gloom2" | "gloom3") {
    this.ensure(); if (!this.ambient) return;
    this.ambient.classList.remove("mood-gold", "mood-gloom2", "mood-gloom3");
    if (mood) this.ambient.classList.add(`mood-${mood}`);
  },

  aurora(c1: string, c2: string) {
    this.ensure(); if (this.rm || !this.ambient) return;
    const el = this.ambient.querySelector(".gfx-aurora") as HTMLElement | null;
    if (!el) return;
    el.classList.remove("go");
    el.style.setProperty("--au1", c1);
    el.style.setProperty("--au2", c2);
    void el.offsetWidth;
    el.classList.add("go");
  }
};

/* ================= 카드 내부 날씨 캔버스 (실측: 비·눈 3겹 원근) ================= */

type WeatherPart = {
  x: number; y: number; l?: number; v: number;
  r?: number; a?: number; sw?: number; p?: number; tw?: boolean;
};

function CardWeather({ fx }: { fx: CardWeatherFx }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let width = 0;
    let height = 0;
    let raf = 0;
    let parts: WeatherPart[] = [];

    const resize = () => {
      const d = DPR();
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * d);
      canvas.height = Math.round(height * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };

    const spawn = () => {
      parts = [];
      for (let i = 0; i < fx.count; i++) {
        if (fx.mode === "rain") {
          parts.push({ x: Math.random() * width, y: Math.random() * height, l: 9 + Math.random() * 12, v: 7 + Math.random() * 8 });
        } else if (fx.mode === "snow") {
          const layer = i % 3;
          parts.push({
            x: Math.random() * width, y: Math.random() * height,
            r: layer === 0 ? 2.6 + Math.random() * 1.8 : layer === 1 ? 1.6 + Math.random() : 0.8 + Math.random() * 0.6,
            v: layer === 0 ? 1.1 + Math.random() * 0.8 : layer === 1 ? 0.7 + Math.random() * 0.4 : 0.35 + Math.random() * 0.25,
            a: layer === 0 ? 0.95 : layer === 1 ? 0.7 : 0.45,
            sw: layer === 0 ? 1.1 : 0.7, p: Math.random() * 6.28, tw: Math.random() < 0.25
          });
        }
      }
    };

    const frame = () => {
      ctx.clearRect(0, 0, width, height);
      if (fx.mode === "rain") {
        ctx.strokeStyle = "rgba(190,212,242,.55)";
        ctx.lineWidth = 1.3;
        for (const p of parts) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - 0.3 * (p.l ?? 10), p.y + (p.l ?? 10));
          ctx.stroke();
          p.y += p.v; p.x -= 0.3 * p.v * 0.5;
          if (p.y > height) { p.y = -(p.l ?? 10); p.x = Math.random() * width; }
        }
      } else if (fx.mode === "snow") {
        for (const p of parts) {
          const tw = p.tw ? 0.6 + 0.4 * Math.sin((p.p ?? 0) * 3) : 1;
          ctx.globalAlpha = (p.a ?? 1) * tw;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r ?? 1.5, 0, 6.3);
          ctx.fill();
          p.p = (p.p ?? 0) + 0.02;
          p.y += p.v;
          p.x += Math.sin(p.p) * (p.sw ?? 0.8);
          if (p.y > height) { p.y = -4; p.x = Math.random() * width; }
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(frame);
    };

    resize();
    if (fx.mode !== "none" && fx.count > 0) {
      spawn();
      raf = requestAnimationFrame(frame);
    }
    const onResize = () => { resize(); spawn(); };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      ctx.clearRect(0, 0, width, height);
    };
  }, [fx.mode, fx.count]);

  return <canvas ref={canvasRef} className="gcard-fx" aria-hidden="true" />;
}

/* ================= 가챠 카드 히어로 ================= */

export type GachaHeroProps = {
  score: number;
  headline: string;
  slot: RunningSlot;
  place: string;
  actLabel: string;
  isTomorrow: boolean;
};

type RevealState = {
  tier: GachaTier;
  say: string;
  sub: string;
  fx: CardWeatherFx;
  sky: SkySet;
};

const REVEAL_AT = 2380;

export function GachaHero({ score, headline, slot, place, actLabel, isTomorrow }: GachaHeroProps) {
  const [phase, setPhase] = useState<"idle" | "spinning" | "revealed">("idle");
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [popTick, setPopTick] = useState(0);
  const [drawSeq, setDrawSeq] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // 최신 props를 개봉 시점에 읽기 위한 ref (스핀 2.2초 사이 변경 대응)
  const latest = useRef({ score, headline, slot, place, actLabel, isTomorrow });
  latest.current = { score, headline, slot, place, actLabel, isTomorrow };

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }, []);

  const buildReveal = useCallback((): RevealState => {
    const cur = latest.current;
    const tier = tierOf(cur.score);
    const fx = weatherFxFrom(cur.slot);
    return { tier, say: pick(tier.says), sub: pick(tier.subs), fx, sky: skyFor(cur.score, fx) };
  }, []);

  // 풀스핀 개봉 — 최초 마운트 + 카드 탭
  useEffect(() => {
    clearTimers();
    setPhase("spinning");
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      // 모션 최소화 — 스핀 없이 즉시 공개
      const t = window.setTimeout(() => {
        setReveal(buildReveal());
        setPhase("revealed");
      }, 60);
      timersRef.current.push(t);
      return clearTimers;
    }
    const t = window.setTimeout(() => {
      const state = buildReveal();
      setReveal(state);
      setPhase("revealed");
      setPopTick((v) => v + 1);
    }, REVEAL_AT);
    timersRef.current.push(t);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawSeq]);

  // 활동/날짜/위치 전환도 카드가 다시 돌아간 뒤 멈추며 공개된다
  useEffect(() => {
    if (phaseRef.current !== "revealed") return;
    setDrawSeq((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, slot.time, actLabel, isTomorrow]);

  useEffect(() => clearTimers, [clearTimers]);

  const tier = reveal?.tier ?? tierOf(score);
  const fx = reveal?.fx ?? weatherFxFrom(slot);
  const sky = reveal?.sky ?? skyFor(score, fx);
  const revealed = phase === "revealed";
  const dayOfYear = Math.max(1, Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000));

  const stars = [];
  for (let i = 0; i < 5; i++) stars.push(<i key={i} className={i < tier.stars ? "on" : ""}>★</i>);

  return (
    <div
      className={`ghero ${revealed ? `revealed ${tier.cls}` : "charging"} ${fx.snowpile ? "snowmode" : ""} ${tier.min < 30 && revealed ? "gloomcard" : ""}`}
      style={{ "--fr": tier.color, "--rayc": tier.ray, "--foilo": tier.foil, "--glow": tier.foil > 0 ? 1 : 0.25 } as React.CSSProperties}
    >
      <div className="gslot">
        <div className="grays" aria-hidden="true" />
        <div className="grays r2" aria-hidden="true" />
        <div className="ghalo" aria-hidden="true" />
        <div className="gaura" aria-hidden="true" />
        <div
          className="gcard-tap"
          role="button"
          tabIndex={0}
          aria-label="오늘의 날씨 카드 다시 개봉"
          onClick={() => { if (phase === "revealed") setDrawSeq((v) => v + 1); }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            if (phase === "revealed") setDrawSeq((v) => v + 1);
          }}
        >
          <div ref={cardRef} className={`gcard ${phase === "spinning" ? "spinning" : "spun"}`}>
            <div className="gface gback">
              <div className="gb-in">
                <span className="grune t">RUNNINGCALL</span>
                <div className="gb-ring" />
                <div className="gb-ring r2" />
                <span className="gmark">?</span>
                <span className="grune b">DAILY DRAW</span>
              </div>
            </div>
            <div className="gface gfront">
              <div
                className="gf-in"
                style={{ "--sk1": sky.sk1, "--sk2": sky.sk2, "--gr1": sky.gr1, "--gr2": sky.gr2 } as React.CSSProperties}
              >
                <div className={`gsun ${fx.sun ? "on" : ""}`} aria-hidden="true" />
                <div className={`gcloud a ${fx.cloud ? "on" : ""}`} aria-hidden="true" />
                <div className={`gcloud b ${fx.cloud ? "on" : ""}`} aria-hidden="true" />
                <CardWeather fx={revealed ? fx : { ...fx, count: 0 }} />
                <div className={`glight-in ${fx.storm ? "strike" : ""}`} aria-hidden="true" />
                <div className={`gsnowpile ${fx.snowpile ? "on" : ""}`} aria-hidden="true" />
                {fx.snowpile ? (
                  <>
                    <span className="gfrost" style={{ top: "30%", left: "14%" }}>❄</span>
                    <span className="gfrost" style={{ top: "48%", right: "12%", animationDelay: ".9s" }}>❆</span>
                  </>
                ) : null}
              </div>
              <div className="gcorn tl" aria-hidden="true" /><div className="gcorn tr" aria-hidden="true" />
              <div className="gcorn bl" aria-hidden="true" /><div className="gcorn br" aria-hidden="true" />
              <div className="gc-content">
                <span className="gc-grade">{tier.grade}</span>
                <span className="gc-odds">{tier.odds}</span>
                <div className="gc-stars">{stars}</div>
                <div className="gc-score" key={popTick}>
                  {revealed ? (isTomorrow ? latest.current.score : score) : score}
                  <small>점</small>
                </div>
                <div className="gc-verdict">{revealed ? headline : ""}</div>
                <div className="gc-serial">
                  <span>NO.{String(dayOfYear).padStart(3, "0")}</span>
                  <span className="stamp-ic">✦</span>
                  <span>{place} · {actLabel}</span>
                </div>
              </div>
              <div className="gfoil" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
      <div className="gsay" aria-live="polite">{revealed ? reveal?.say : "오늘의 날씨 카드를 개봉하는 중…"}</div>
    </div>
  );
}

/* ================= 추천 시간대 슬롯 릴 ================= */

export type ReelRank = {
  key: string;
  label: string;
  time: string;
  score: number;
  chips: string[];
};

export type TimeReelProps = {
  open: boolean;
  title: string;
  ranks: ReelRank[];
  pool: Array<{ time: string; score: number }>;
  onClose: () => void;
  onPick: (rank: ReelRank) => void;
};

const ROW_H = 64;
const WIN_ROWS = 42;
const MEDAL_LABEL = ["🥇 금메달!!", "🥈 은메달!", "🥉 동메달!"];
const MEDAL_CLS = ["g", "s", "b"];

function scoreColor(score: number) {
  return score >= 85 ? "#ffce4a" : score >= 70 ? "#5ee0b0" : score >= 45 ? "#9db6d8" : "#ff8f6b";
}

export function TimeReel({ open, title, ranks, pool, onClose, onPick }: TimeReelProps) {
  const [shown, setShown] = useState<number>(-1); // 시상대에 공개된 마지막 인덱스
  const [hint, setHint] = useState("");
  const [bigHint, setBigHint] = useState(false);
  const [subText, setSubText] = useState("");
  const [spinningIdx, setSpinningIdx] = useState(-1);
  const [done, setDone] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const runIdRef = useRef(0);
  const doneRef = useRef(false);
  const skipRef = useRef(false);
  const wakeRef = useRef<null | (() => void)>(null);
  doneRef.current = done;

  // 스핀 중 탭 → 즉시 전체 순위 공개
  const skip = useCallback(() => {
    if (doneRef.current || skipRef.current) return;
    skipRef.current = true;
    wakeRef.current?.();
  }, []);

  useEffect(() => {
    if (!open || ranks.length === 0) return;
    const runId = ++runIdRef.current;
    const alive = () => runIdRef.current === runId;
    // 취소 가능한 sleep — skip 시 즉시 깨어남
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = window.setTimeout(() => { wakeRef.current = null; resolve(); }, ms);
        wakeRef.current = () => { window.clearTimeout(t); wakeRef.current = null; resolve(); };
      });

    const buildStrip = (winner: ReelRank) => {
      const strip = stripRef.current;
      if (!strip) return;
      const source = pool.length > 2 ? pool : ranks.map((r) => ({ time: r.time, score: r.score }));
      let rows = "";
      for (let i = 0; i < WIN_ROWS; i++) {
        const item = source[Math.floor(Math.random() * source.length)];
        rows += `<div class="grow" style="--dc:${scoreColor(item.score)}"><span class="gdot"></span><span class="grt">${item.time}</span><span class="grs">${item.score}</span></div>`;
      }
      rows += `<div class="grow win" style="--dc:${scoreColor(winner.score)}"><span class="gdot"></span><span class="grt">${winner.time}</span><span class="grs">${winner.score}점</span></div>`;
      for (let i = 0; i < 2; i++) {
        const item = source[Math.floor(Math.random() * source.length)];
        rows += `<div class="grow" style="--dc:${scoreColor(item.score)}"><span class="gdot"></span><span class="grt">${item.time}</span><span class="grs">${item.score}</span></div>`;
      }
      strip.innerHTML = rows;
    };

    const spinStrip = () => {
      const strip = stripRef.current;
      if (!strip) return;
      strip.style.transition = "none";
      strip.style.transform = `translateY(${ROW_H}px)`;
      void strip.offsetWidth;
      strip.style.transition = "transform 2.05s cubic-bezier(.12,.7,.14,1.06)";
      strip.style.transform = `translateY(-${(WIN_ROWS - 1) * ROW_H}px)`;
    };

    const finalize = () => {
      setSpinningIdx(-1);
      setShown(ranks.length - 1);
      doneRef.current = true;
      setDone(true);
      setBigHint(false);
      setSubText(`좋은 시간대 TOP ${ranks.length}`);
      setHint("");
    };

    (async () => {
      skipRef.current = false;
      setDone(false);
      setShown(-1);
      setBigHint(false);
      setSubText("릴을 돌려 순위를 뽑는 중… (탭하면 바로 결과)");
      await sleep(440);
      if (!alive()) return;
      for (let i = 0; i < ranks.length; i++) {
        if (skipRef.current) break;
        setBigHint(false);
        setHint(`🎰 ${i + 1}순위 뽑는 중…`);
        setSpinningIdx(i);
        buildStrip(ranks[i]);
        await sleep(70);
        if (!alive()) return;
        if (skipRef.current) break;
        spinStrip();
        await sleep(2060);
        if (!alive()) return;
        if (skipRef.current) break;
        setSpinningIdx(-1);
        setBigHint(true);
        setHint(`✦ ${MEDAL_LABEL[i]} ✦`);
        await sleep(560);
        if (!alive()) return;
        if (skipRef.current) break;
        setShown(i);
        await sleep(640);
        if (!alive()) return;
      }
      if (!alive()) return;
      finalize();
    })();

    return () => {
      runIdRef.current++;
      wakeRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="greel-ov open"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest(".gpod")) return; // 순위 카드는 알림 예약
        if (!doneRef.current) { skip(); return; } // 진행 중이면 결과로 건너뛰기
        onClose(); // 완료 후 아무 곳이나 탭 → 닫기
      }}
    >
      <div className="gro-top"><div className="gro-title">{title}</div></div>
      <div className="gro-sub">{subText}</div>
      <div className="gpodium">
        {ranks.map((rank, index) => (
          <button
            type="button"
            key={rank.key}
            className={`gpod r${index + 1} ${shown >= index ? "show" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onPick(rank);
            }}
          >
            <div className={`gmedal ${MEDAL_CLS[index]}`}>{index + 1}</div>
            <div className="gpod-mid">
              <div className="gpod-time">
                {rank.time}
                {index === 0 ? <em>{rank.label === "내일" ? "👑 내일 베스트" : "👑 오늘 베스트"}</em> : null}
                <span className="gpod-part">{rank.label}</span>
              </div>
              <div className="gpod-stats">
                {rank.chips.map((chip, chipIndex) => (
                  <span key={chip} className={chipIndex === 0 ? "wet" : ""}>{chip}</span>
                ))}
              </div>
            </div>
            <div className="gpod-score" style={{ "--sccol": scoreColor(rank.score) } as React.CSSProperties}>
              <b>{rank.score}</b><span>SCORE</span>
            </div>
          </button>
        ))}
      </div>
      {done ? (
        <div className="gdone">
          <div className="gdone-emoji" aria-hidden="true">🔔</div>
          <p className="gdone-title">시간대 뽑기 완료!</p>
          <p className="gdone-sub">위 순위를 탭하면 그 시간에 맞춰 알림을 예약해요</p>
          <button type="button" className="gdone-close" onClick={onClose}>닫기</button>
        </div>
      ) : (
        <>
          <div className="greelframe">
            <div className={`greelbox ${spinningIdx >= 0 ? "spinningR" : ""}`}>
              <div className="gled t" aria-hidden="true">
                {Array.from({ length: 12 }, (_, i) => <i key={i} />)}
              </div>
              <div className="gspeedfx" aria-hidden="true" />
              <div ref={bandRef} className="greel-band" aria-hidden="true" />
              <div ref={stripRef} className="gstrip" />
              <div className="gled b" aria-hidden="true">
                {Array.from({ length: 12 }, (_, i) => <i key={i} />)}
              </div>
            </div>
          </div>
          <div className={`greel-hint ${bigHint ? "bighint" : ""}`}>{hint}</div>
        </>
      )}
    </div>
  );
}
