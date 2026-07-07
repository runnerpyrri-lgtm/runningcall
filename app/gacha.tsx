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
  const wet = !snow && (wetPrecip || slot.precipitationProbability >= 60);
  const mode: CardWeatherFx["mode"] = snow ? "snow" : wet ? "rain" : "none";
  const count =
    mode === "rain"
      ? Math.round(Math.min(300, 70 + slot.precipitation * 45 + slot.precipitationProbability * 0.6))
      : mode === "snow"
      ? Math.round(Math.min(200, 90 + snowAmount * 140))
      : 0;
  const cloud = mode !== "none" || slot.precipitationProbability >= 25 || (slot.cloudCover ?? 0) >= 55;
  const sun = mode === "none" && slot.precipitationProbability < 30 && (slot.cloudCover ?? 0) < 70;
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

/* ================= FX 팔레트 ================= */

const GOLD = ["#fff6d8", "#ffe083", "#ffce4a", "#ff9d2e", "#fff"];
const PURP = ["#f0e2ff", "#d0a8ff", "#b06aff", "#8a4ae0", "#fff"];
const TEAL = ["#d8fff6", "#7df5df", "#3ddfc0", "#fff"];
const BLUE = ["#d5e8ff", "#8fc0ff", "#5aa8ff", "#fff"];
const GREEN = ["#dfffe6", "#9de8ac", "#6ecb7f", "#fff"];
const GREY = ["#9aa0a8", "#7a8088", "#5a6068"];
const REDG = ["#ff8a8a", "#c05a5a", "#8a5058", "#6a4048"];
const ICE = ["#ffffff", "#dff2ff", "#a8d8f0", "#7fc0e8"];
const SILVER = ["#ffffff", "#ccd6e0", "#aebbcc"];
const BRONZE = ["#ffdfba", "#d09055", "#ffffff"];
const GOLD_STRIKE: [string, string[]] = ["#fff2c8", ["#ffe083", "#ffb52e", "#c8860f"]];
const DOOM_STRIKE: [string, string[]] = ["#c8a0a8", ["#8a5058", "#5a3038", "#301820"]];

/* ================= FX 엔진 (싱글턴, 뷰포트 전체) ================= */

type BoomPart = {
  x: number; y: number; vx: number; vy: number; g: number;
  r: number; c: string; life: number; max: number; streak: boolean;
};

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
      const d = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * d;
      canvas.height = window.innerHeight * d;
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
      if (p.streak) {
        ctx.strokeStyle = p.c; ctx.globalAlpha = a; ctx.lineWidth = p.r;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2.6, p.y - p.vy * 2.6); ctx.stroke();
      } else {
        ctx.globalAlpha = a; ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a + 0.4, 0, 6.3); ctx.fill();
      }
      if (p.life <= 0) this.parts.splice(i, 1);
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
    this.root?.querySelectorAll(".gcf").forEach((n) => n.remove());
  },

  burst(x: number, y: number, n: number, colors: string[], pw: number, g: number) {
    this.ensure(); if (this.rm) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const v = (0.25 + Math.random()) * pw;
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - pw * 0.35, g,
        r: 1.4 + Math.random() * 2.6, c: colors[i % colors.length],
        life: 40 + Math.random() * 36, max: 70, streak: Math.random() < 0.45
      });
    }
    this.kick();
  },

  meteor(n: number, colors: string[]) {
    this.ensure(); if (this.rm) return;
    const w = window.innerWidth;
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: Math.random() * w, y: -20 - Math.random() * 80,
        vx: -(1.2 + Math.random() * 2), vy: 5.5 + Math.random() * 4, g: 0.015,
        r: 1.6 + Math.random() * 1.6, c: colors[i % colors.length],
        life: 56 + Math.random() * 30, max: 86, streak: true
      });
    }
    this.kick();
  },

  shootStars(n: number, colors: string[]) {
    this.ensure(); if (this.rm) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < n; i++) {
      const fromLeft = Math.random() < 0.5;
      this.parts.push({
        x: fromLeft ? -24 : w + 24, y: h * 0.1 + Math.random() * h * 0.6,
        vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 5), vy: (Math.random() - 0.5) * 1.6, g: 0,
        r: 1.5 + Math.random() * 1.4, c: colors[i % colors.length],
        life: 60 + Math.random() * 20, max: 80, streak: true
      });
    }
    this.kick();
  },

  fountain(x: number, n: number, colors: string[]) {
    this.ensure(); if (this.rm) return;
    const y = window.innerHeight + 4;
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: x + (Math.random() - 0.5) * 34, y,
        vx: (Math.random() - 0.5) * 3.4, vy: -(7 + Math.random() * 6), g: 0.2,
        r: 1.5 + Math.random() * 2.2, c: colors[i % colors.length],
        life: 52 + Math.random() * 26, max: 78, streak: Math.random() < 0.6
      });
    }
    this.kick();
  },

  bubbles(x: number, y: number, n: number, colors: string[]) {
    this.ensure(); if (this.rm) return;
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: x + (Math.random() - 0.5) * 180, y: y + Math.random() * 60,
        vx: (Math.random() - 0.5) * 0.8, vy: -(1.2 + Math.random() * 2), g: -0.012,
        r: 1.6 + Math.random() * 2.2, c: colors[i % colors.length],
        life: 50 + Math.random() * 30, max: 80, streak: false
      });
    }
    this.kick();
  },

  dustFall(x: number, y: number, n: number, colors: string[]) {
    this.ensure(); if (this.rm) return;
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: x + (Math.random() - 0.5) * 150, y,
        vx: (Math.random() - 0.5) * 1.2, vy: 0.4 + Math.random() * 1.2, g: 0.05,
        r: 1.2 + Math.random() * 1.8, c: colors[i % colors.length],
        life: 44 + Math.random() * 24, max: 68, streak: false
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

  confetti(n: number, colors?: string[]) {
    this.ensure(); if (this.rm || !this.root) return;
    const cs = colors || ["#ffce4a", "#ff6a5e", "#5ee0b0", "#fff", "#ffa9ec", "#7fc8ff", "#ffb52e"];
    for (let i = 0; i < n; i++) {
      const el = document.createElement("i");
      el.className = "gcf";
      const w = 5 + Math.random() * 6;
      el.style.cssText =
        `left:${Math.random() * 100}%;width:${w}px;height:${w * 1.5}px;background:${cs[i % cs.length]};` +
        `border-radius:${Math.random() < 0.4 ? "50%" : "2px"};` +
        `animation-delay:${Math.random() * 0.55}s;animation-duration:${1.7 + Math.random() * 1.5}s`;
      this.root.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }
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

/* ================= 티어별 개봉 연출 ================= */

function cardCenter(card: HTMLElement | null) {
  if (!card) return { x: window.innerWidth / 2, y: window.innerHeight * 0.4 };
  const rect = card.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function preSpinFx(tier: GachaTier, card: HTMLElement | null, timers: number[]) {
  const c = () => cardCenter(card);
  if (tier.cls === "t9") {
    FX.predark(true);
    timers.push(window.setTimeout(() => { const p = c(); FX.strike(p.x, p.y, false, GOLD_STRIKE[0], GOLD_STRIKE[1]); }, 950));
    timers.push(window.setTimeout(() => { const p = c(); FX.strike(p.x, p.y, false, GOLD_STRIKE[0], GOLD_STRIKE[1]); }, 1380));
    timers.push(window.setTimeout(() => { const p = c(); FX.strike(p.x, p.y, true, "#fff8dc", GOLD_STRIKE[1]); }, 1780));
  } else if (tier.cls === "t8") {
    timers.push(window.setTimeout(() => { FX.meteor(12, PURP); FX.flashMini(); }, 1300));
    timers.push(window.setTimeout(() => { const p = c(); FX.ring(p.x, p.y, "#b06aff", 1); }, 1720));
  } else if (tier.cls === "t7") {
    timers.push(window.setTimeout(() => { const p = c(); FX.ring(p.x, p.y, "#55e6d0", 1.05); FX.flashMini(); }, 1600));
  } else if (tier.cls === "t0") {
    timers.push(window.setTimeout(() => { const p = c(); FX.strike(p.x, p.y, false, DOOM_STRIKE[0], DOOM_STRIKE[1]); }, 1450));
  }
}

function revealFx(tier: GachaTier, card: HTMLElement | null, isSnow: boolean, quick = false) {
  const { x, y } = cardCenter(card);
  const colors = isSnow ? ICE : null;
  const scale = quick ? 0.6 : 1;
  FX.predark(false);
  FX.mood(tier.cls === "t9" ? "gold" : tier.cls === "t3" ? "gloom2" : tier.cls === "t0" ? "gloom3" : "");
  switch (tier.cls) {
    case "t9":
      if (!quick) {
        FX.flashBig(); FX.shake("sh-lg");
        FX.stamp("LEGENDARY", "#ffce4a");
        FX.ring(x, y, "#ffce4a", 1.7);
        setTimeout(() => FX.ring(x, y, "#fff", 1.25), 120);
        setTimeout(() => FX.ring(x, y, "#ffce4a", 2.1), 260);
        FX.burst(x, y, 150, colors || GOLD, 9.5, 0.16);
        setTimeout(() => FX.burst(x, y, 70, colors || GOLD, 6, 0.15), 280);
        setTimeout(() => {
          FX.fountain(window.innerWidth * 0.12, 55, colors || GOLD);
          FX.fountain(window.innerWidth * 0.88, 55, colors || GOLD);
        }, 380);
        setTimeout(() => FX.shootStars(16, colors || GOLD), 520);
        FX.confetti(70); setTimeout(() => FX.confetti(40), 520);
        FX.edge("#ffce4a");
      } else {
        FX.ring(x, y, "#ffce4a", 1.1);
        FX.burst(x, y, 50, colors || GOLD, 6, 0.15);
        FX.confetti(20);
      }
      break;
    case "t8":
      FX.flashBig("#e8d8ff"); FX.shake(quick ? "sh-sm" : "sh-lg");
      FX.aurora("rgba(176,106,255,.32)", "rgba(255,140,220,.2)");
      FX.ring(x, y, "#b06aff", 1.4 * scale);
      FX.meteor(Math.round(34 * scale), colors || PURP);
      FX.burst(x, y, Math.round(85 * scale), colors || PURP, 7.5, 0.15);
      if (!quick) {
        setTimeout(() => FX.meteor(20, colors || PURP), 420);
        FX.confetti(32, ["#d0a8ff", "#b06aff", "#fff", "#8a4ae0", "#ffa9ec"]);
      }
      FX.edge("#b06aff");
      break;
    case "t7":
      if (!quick) FX.flashBig();
      FX.shake("sh-sm");
      FX.aurora("rgba(85,230,208,.32)", "rgba(120,180,255,.22)");
      FX.ring(x, y, "#55e6d0", 1.25 * scale);
      FX.bubbles(x, y + 80, Math.round(40 * scale), colors || TEAL);
      FX.burst(x, y, Math.round(55 * scale), colors || TEAL, 6, 0.15);
      if (!quick) FX.confetti(18, ["#7df5df", "#3ddfc0", "#fff"]);
      FX.edge("#55e6d0");
      break;
    case "t6":
      FX.flashMini(); FX.shake("sh-sm");
      FX.shootStars(Math.round(16 * scale), colors || BLUE);
      FX.ring(x, y, "#5aa8ff", 1.1 * scale);
      FX.burst(x, y, Math.round(40 * scale), colors || BLUE, 5, 0.14);
      FX.edge("#5aa8ff");
      break;
    case "t5":
      FX.flashMini();
      FX.ring(x, y, "#6ecb7f", 0.9 * scale);
      FX.burst(x, y, Math.round(26 * scale), colors || GREEN, 4.2, 0.1);
      if (!quick) FX.confetti(14, ["#9de8ac", "#6ecb7f", "#dfffe6"]);
      break;
    case "t4":
      FX.flashMini();
      FX.burst(x, y, Math.round(10 * scale), colors || GREY, 3, 0.12);
      break;
    case "t3":
      FX.shake("sh-sm");
      FX.dustFall(x, y + 30, Math.round(16 * scale), GREY);
      break;
    case "t0":
      FX.shake("sh-lg");
      FX.ring(x, y, "#ff5a5f", 1.35 * scale);
      FX.edge("#ff3a3f");
      if (!quick) {
        setTimeout(() => FX.strike(x, y, true, DOOM_STRIKE[0], DOOM_STRIKE[1]), 300);
        setTimeout(() => FX.strike(x, y, false, DOOM_STRIKE[0], DOOM_STRIKE[1]), 750);
      }
      FX.dustFall(x, y + 30, Math.round(30 * scale), REDG);
      break;
  }
  if (isSnow && tier.cls !== "t9" && tier.cls !== "t8") {
    FX.ring(x, y, "#cfeaff", 1.15 * scale);
    FX.burst(x, y, Math.round(30 * scale), ICE, 4.5, 0.05);
  }
}

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
      const d = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * d;
      canvas.height = height * d;
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
  subline: string;
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

const SPIN_MS = 2250;
const REVEAL_AT = 2200;

export function GachaHero({ score, headline, subline, slot, place, actLabel, isTomorrow }: GachaHeroProps) {
  const [phase, setPhase] = useState<"idle" | "spinning" | "revealed">("idle");
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [popTick, setPopTick] = useState(0);
  const [drawSeq, setDrawSeq] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // 최신 props를 개봉 시점에 읽기 위한 ref (스핀 2.2초 사이 변경 대응)
  const latest = useRef({ score, headline, subline, slot, place, actLabel, isTomorrow });
  latest.current = { score, headline, subline, slot, place, actLabel, isTomorrow };

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
    FX.ensure();
    clearTimers();
    FX.clearParts();
    FX.mood("");
    const next = buildReveal();
    const isSnow = next.fx.mode === "snow";
    setPhase("spinning");
    if (FX.rm) {
      // 모션 최소화 — 스핀 없이 즉시 공개
      const t = window.setTimeout(() => {
        setReveal(buildReveal());
        setPhase("revealed");
        FX.mood(next.tier.cls === "t9" ? "gold" : next.tier.cls === "t3" ? "gloom2" : next.tier.cls === "t0" ? "gloom3" : "");
      }, 60);
      timersRef.current.push(t);
      return clearTimers;
    }
    preSpinFx(next.tier, cardRef.current, timersRef.current);
    const t = window.setTimeout(() => {
      const state = buildReveal();
      setReveal(state);
      setPhase("revealed");
      setPopTick((v) => v + 1);
      revealFx(state.tier, cardRef.current, state.fx.mode === "snow", false);
    }, REVEAL_AT);
    timersRef.current.push(t);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawSeq]);

  // 퀵 리빌 — 활동/날짜/위치 전환 (스핀 없이 내용 갱신 + 축소 연출)
  useEffect(() => {
    if (phaseRef.current !== "revealed") return;
    const state = buildReveal();
    setReveal(state);
    setPopTick((v) => v + 1);
    revealFx(state.tier, cardRef.current, state.fx.mode === "snow", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, slot.time, actLabel, isTomorrow]);

  // 언마운트 시 앰비언트 정리
  useEffect(() => () => { FX.mood(""); FX.predark(false); FX.clearParts(); clearTimers(); }, [clearTimers]);

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
        <button
          type="button"
          className="gcard-tap"
          aria-label="오늘의 날씨 카드 다시 개봉"
          onClick={() => { if (phase === "revealed") setDrawSeq((v) => v + 1); }}
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
        </button>
      </div>
      <div className="gsay" aria-live="polite">{revealed ? reveal?.say : "오늘의 날씨 카드를 개봉하는 중…"}</div>
      <div className="gsub">{revealed ? subline : ""}</div>
      <div className="gsub2">{revealed ? reveal?.sub : ""}</div>
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
  const overlayRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const runIdRef = useRef(0);

  const bandCenter = useCallback(() => {
    const band = bandRef.current;
    if (!band) return { x: window.innerWidth / 2, y: window.innerHeight * 0.75 };
    const rect = band.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, []);

  useEffect(() => {
    if (!open || ranks.length === 0) return;
    const runId = ++runIdRef.current;
    const alive = () => runIdRef.current === runId;
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
      strip.classList.add("blur");
      void strip.offsetWidth;
      strip.style.transition = "transform 2.05s cubic-bezier(.12,.7,.14,1.06)";
      strip.style.transform = `translateY(-${(WIN_ROWS - 1) * ROW_H}px)`;
    };

    (async () => {
      setShown(-1);
      setBigHint(false);
      setSubText("릴을 돌려 순위를 뽑는 중… (빈 곳을 탭하면 닫혀요)");
      await sleep(460);
      for (let i = 0; i < ranks.length && alive(); i++) {
        setBigHint(false);
        setHint(`🎰 ${i + 1}순위 뽑는 중…`);
        setSpinningIdx(i);
        buildStrip(ranks[i]);
        await sleep(70);
        if (!alive()) return;
        spinStrip();
        await sleep(2080);
        if (!alive()) return;
        stripRef.current?.classList.remove("blur");
        setSpinningIdx(-1);
        const band = bandRef.current;
        if (band) {
          band.classList.remove("hit");
          void band.offsetWidth;
          band.classList.add("hit");
        }
        const bc = bandCenter();
        if (i === 0) {
          FX.flashBig();
          FX.shake("sh-lg", overlayRef.current);
          FX.ring(bc.x, bc.y, "#ffce4a", 1.4);
          setTimeout(() => FX.ring(bc.x, bc.y, "#fff", 0.95), 140);
          FX.burst(bc.x, bc.y, 95, GOLD, 9, 0.16);
          FX.fountain(window.innerWidth * 0.12, 45, GOLD);
          FX.fountain(window.innerWidth * 0.88, 45, GOLD);
          FX.shootStars(12, GOLD);
          FX.confetti(50);
          FX.edge("#ffce4a");
        } else if (i === 1) {
          FX.flashMini();
          FX.shake("sh-sm", overlayRef.current);
          FX.ring(bc.x, bc.y, "#ccd6e0", 1.1);
          FX.burst(bc.x, bc.y, 50, SILVER, 6, 0.16);
          FX.confetti(18, SILVER);
        } else {
          FX.shake("sh-sm", overlayRef.current);
          FX.ring(bc.x, bc.y, "#d09055", 1);
          FX.burst(bc.x, bc.y, 34, BRONZE, 5, 0.16);
          FX.confetti(12, BRONZE);
        }
        setBigHint(true);
        setHint(`✦ ${MEDAL_LABEL[i]} ✦`);
        await sleep(600);
        if (!alive()) return;
        setShown(i);
        await sleep(700);
      }
      if (!alive()) return;
      setSubText(`좋은 시간대 TOP ${ranks.length}`);
      setBigHint(false);
      setHint("시간대를 탭하면 알림 예약 · 빈 곳을 탭하면 닫혀요");
    })();

    return () => { runIdRef.current++; };
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
        if (target.closest(".gpod,.greelframe,.gro-title")) return;
        onClose();
      }}
    >
      <div className="gspot s1" aria-hidden="true" /><div className="gspot s2" aria-hidden="true" />
      <div className="gro-top"><div className="gro-title">{title}</div></div>
      <div className="gro-sub">{subText}</div>
      <div className="gpodium">
        {ranks.map((rank, index) => (
          <button
            type="button"
            key={rank.key}
            className={`gpod r${index + 1} ${shown >= index ? "show" : ""}`}
            onClick={() => onPick(rank)}
          >
            <div className={`gmedal ${MEDAL_CLS[index]}`}>{index + 1}</div>
            <div className="gpod-mid">
              <div className="gpod-time">
                {rank.time}
                {index === 0 ? <em>👑 오늘 베스트</em> : null}
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
    </div>
  );
}
