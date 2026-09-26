import { useEffect, useRef } from "react";

/**
 * DNA double-helix hero backdrop — two glossy metallic strands coiling
 * around a common axis, connected by periodic rungs (base pairs), flowing
 * and morphing continuously through the scene. Canvas 2D + hand-rolled
 * perspective projection (no WebGL/three.js dependency).
 *
 * The coiling axis itself is not a straight line: it's a "render window"
 * sliding along an unbounded curve built from layered, slowly-drifting sine
 * waves (cheap pseudo-noise), so the whole helix bends and drifts through
 * 3D space rather than spinning in place around a fixed center. Fresh
 * geometry continuously enters one side while old geometry exits the other
 * — there is no loop point. The camera only sways gently (bounded
 * oscillation) and tracks the primary helix's own drift so the structure
 * never runs off-screen for good; it never completes a rotation itself.
 *
 * Purely decorative. Zero state, zero data, cannot block the UI.
 * Respects prefers-reduced-motion: renders one static frame then stops.
 */

type Vec3 = [number, number, number];

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const normalize = (v: Vec3): Vec3 => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Perpendicular-to-tangent reference vector — the "up" direction for a
 * tube's cross-section, picked by a stable reference axis so it doesn't
 * degenerate when the tangent points straight up. */
function referenceNormal(tangent: Vec3): Vec3 {
  const upRef: Vec3 = Math.abs(tangent[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalize(cross(cross(tangent, upRef), tangent));
}

interface Wave {
  amp: number;
  freq: number;
  phase: number;
  timeDrift: number; // rad/s added to the wave's argument — makes the curve's own shape slowly morph, not just slide
}

interface HelixConfig {
  flowAxis: Vec3;
  flowScale: number; // world units per unit t
  flowSpeed: number; // how fast this helix's render window slides along t (units/s)
  zBias: number;
  wavesX: Wave[];
  wavesY: Wave[];
  wavesZ: Wave[];
  startOffset: number;
  helixRadius: number;
  turnsPerUnit: number; // full coil turns per unit t
  strandHalfWidth: number;
  rungSpacingT: number;
  colorA: [number, number, number];
  colorB: [number, number, number];
  colorRung: [number, number, number];
  opacityMul: number;
}

const HELICES: HelixConfig[] = [
  {
    flowAxis: normalize([1, -0.25, 0.1]),
    flowScale: 640,
    flowSpeed: 0.07,
    zBias: -40,
    wavesX: [
      { amp: 190, freq: 0.5, phase: 0, timeDrift: 0 },
      { amp: 70, freq: 1.3, phase: 1.1, timeDrift: 0.02 },
      { amp: 26, freq: 2.7, phase: 2.4, timeDrift: 0 },
    ],
    wavesY: [
      { amp: 140, freq: 0.6, phase: 0.6, timeDrift: 0 },
      { amp: 55, freq: 1.6, phase: 2.0, timeDrift: -0.015 },
    ],
    wavesZ: [
      { amp: 120, freq: 0.45, phase: 1.7, timeDrift: 0.01 },
      { amp: 40, freq: 1.9, phase: 0.3, timeDrift: 0 },
    ],
    startOffset: 0,
    helixRadius: 120,
    turnsPerUnit: 1.5,
    strandHalfWidth: 17,
    rungSpacingT: 0.14,
    colorA: [150, 122, 246], // violet — var(--primary) family
    colorB: [104, 172, 250], // blue — var(--primary-2) family
    colorRung: [205, 198, 250],
    opacityMul: 1,
  },
  {
    // Shares helix 0's exact flow axis/scale/speed on purpose — see the
    // camera-follow note above `project()`: only a shared drift rate stays
    // bounded relative to the follow-camera forever.
    flowAxis: normalize([1, -0.25, 0.1]),
    flowScale: 640,
    flowSpeed: 0.07,
    zBias: 230,
    wavesX: [
      { amp: 160, freq: 0.62, phase: 2.1, timeDrift: 0 },
      { amp: 60, freq: 1.5, phase: 0.4, timeDrift: 0.018 },
    ],
    wavesY: [
      { amp: 120, freq: 0.5, phase: 1.4, timeDrift: 0 },
      { amp: 45, freq: 1.8, phase: 3.0, timeDrift: 0 },
    ],
    wavesZ: [
      { amp: 100, freq: 0.7, phase: 0.2, timeDrift: -0.012 },
      { amp: 35, freq: 2.1, phase: 1.0, timeDrift: 0 },
    ],
    startOffset: 1.3,
    helixRadius: 78,
    turnsPerUnit: 1.3,
    strandHalfWidth: 10,
    rungSpacingT: 0.16,
    colorA: [110, 95, 190],
    colorB: [80, 120, 190],
    colorRung: [150, 145, 205],
    opacityMul: 0.7,
  },
];

const HALF_RANGE = 1.7; // render window half-width, in t
const SEGMENTS = 140;
const TANGENT_EPS = 0.01;
const HELIX_SPIN_SPEED = 0.1; // rad/s — slow extra unwind, on top of the coil geometry itself
const LIGHT_DIR = normalize([0.5, -0.7, 0.55]);
const RIM_DIR = normalize([-0.45, 0.35, -0.6]);
const PAGE_BG: [number, number, number] = [24, 23, 34]; // matches the dark hero's --background
const FOG_NEAR = 650;
const FOG_FAR = 1500;

/** World-space point on a helix's coiling axis at parameter t and time — an
 * unbounded curve (layered sines), not a periodic loop within the render
 * window. */
function axisAt(cfg: HelixConfig, t: number, time: number): Vec3 {
  let x = cfg.flowAxis[0] * t * cfg.flowScale;
  let y = cfg.flowAxis[1] * t * cfg.flowScale;
  let z = cfg.flowAxis[2] * t * cfg.flowScale + cfg.zBias;
  for (const w of cfg.wavesX) x += w.amp * Math.sin(t * w.freq + w.phase + time * w.timeDrift);
  for (const w of cfg.wavesY) y += w.amp * Math.sin(t * w.freq + w.phase + time * w.timeDrift);
  for (const w of cfg.wavesZ) z += w.amp * Math.sin(t * w.freq + w.phase + time * w.timeDrift);
  return [x, y, z];
}

/** A point on one strand of the double helix: offset from the (organically
 * curving) axis by helixRadius, rotating around it. strandPhase is 0 or π
 * for the two strands — always on opposite sides of the axis, so a line
 * between them at the same t reads as a DNA rung. */
function helixPointAt(cfg: HelixConfig, t: number, time: number, strandPhase: number): Vec3 {
  const center = axisAt(cfg, t, time);
  const axisTangent = normalize(sub(axisAt(cfg, t + TANGENT_EPS, time), axisAt(cfg, t - TANGENT_EPS, time)));
  const axisNormal = referenceNormal(axisTangent);
  const axisBinormal = normalize(cross(axisTangent, axisNormal));
  const angle = t * cfg.turnsPerUnit * Math.PI * 2 + time * HELIX_SPIN_SPEED + strandPhase;
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  return [
    center[0] + (axisNormal[0] * cosA + axisBinormal[0] * sinA) * cfg.helixRadius,
    center[1] + (axisNormal[1] * cosA + axisBinormal[1] * sinA) * cfg.helixRadius,
    center[2] + (axisNormal[2] * cosA + axisBinormal[2] * sinA) * cfg.helixRadius,
  ];
}

function strandHalfWidthAt(cfg: HelixConfig, t: number, time: number): number {
  return cfg.strandHalfWidth * (1 + 0.14 * Math.sin(t * 0.55 + time * 0.05) + 0.05 * Math.sin(t * 2.3 + time * 0.11));
}

/** Shadow -> base -> highlight tri-stop lerp for a glassy metallic feel,
 * plus a specular hot streak and a cool rim fill, then fogged toward the
 * background with depth. */
function shadeMetallic(
  color: [number, number, number],
  brightness: number,
  rim: number,
  spec: number,
  fogT: number,
): [number, number, number] {
  const [r0, g0, b0] = color;
  const tBright = brightness * 0.5 + 0.5;
  let r: number, g: number, bl: number;
  if (tBright < 0.5) {
    const k = tBright * 2;
    r = mix(r0 * 0.12, r0 * 0.75, k);
    g = mix(g0 * 0.12, g0 * 0.75, k);
    bl = mix(b0 * 0.12, b0 * 0.75, k);
  } else {
    const k = (tBright - 0.5) * 2;
    r = mix(r0 * 0.75, r0, k);
    g = mix(g0 * 0.75, g0, k);
    bl = mix(b0 * 0.75, b0, k);
  }
  r = mix(r, 255, spec * 0.85);
  g = mix(g, 255, spec * 0.85);
  bl = mix(bl, 255, spec * 0.85);
  r = mix(r, r0 * 0.55, rim * 0.4);
  g = mix(g, g0 * 0.6, rim * 0.4);
  bl = mix(bl, b0 * 0.9, rim * 0.4);
  return [mix(r, PAGE_BG[0], fogT), mix(g, PAGE_BG[1], fogT), mix(bl, PAGE_BG[2], fogT)];
}

export default function DnaHelixHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      width = rect?.width ?? window.innerWidth;
      height = rect?.height ?? window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    const start = performance.now();
    const FOCAL = 640;
    const CAMERA_DIST = 1000;

    type DrawItem =
      | { kind: "quad"; poly: [number, number][]; depth: number; color: [number, number, number]; alpha: number }
      | { kind: "line"; a: [number, number]; b: [number, number]; depth: number; color: [number, number, number]; alpha: number; width: number };

    const draw = (now: number) => {
      const time = (now - start) / 1000;
      ctx.clearRect(0, 0, width, height);

      // Gentle bounded camera sway — never a full rotation, just a slow
      // observing drift, layered at two speeds so it doesn't read as a
      // metronomic back-and-forth.
      const yaw = Math.sin(time * 0.018) * 0.1 + Math.sin(time * 0.041 + 1.1) * 0.04;
      const tilt = Math.sin(time * 0.023 + 0.7) * 0.06;
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
      const cosT = Math.cos(tilt), sinT = Math.sin(tilt);

      const rotate = (p: Vec3): Vec3 => {
        const x1 = p[0] * cosY + p[2] * sinY;
        const z1 = -p[0] * sinY + p[2] * cosY;
        const y1 = p[1];
        const y2 = y1 * cosT - z1 * sinT;
        const z2 = y1 * sinT + z1 * cosT;
        return [x1, y2, z2];
      };

      const scaleBase = Math.min(width, height) * 1.3;
      const centerX = width * (0.52 + 0.018 * Math.sin(time * 0.015));
      const centerY = height * (0.46 + 0.014 * Math.sin(time * 0.021 + 0.8));

      // Camera-follow: the axis includes an unbounded linear drift term
      // (flowAxis * t * flowScale) so the geometry never repeats or resets.
      // Left unchecked that drift would eventually carry the whole
      // structure off-screen for good. A real cinematographer tracking a
      // flowing river solves this by panning with it — so here the
      // "camera" subtracts helix 0's own drift from every point before
      // projecting. That exactly cancels helix 0's runaway motion (it's
      // left coiling around a fixed point via its bounded noise wobble
      // alone), and because every helix shares the same flow axis/scale/
      // speed, the second helix stays bounded relative to it too.
      const followT = HELICES[0].startOffset + time * HELICES[0].flowSpeed;
      const followOffset: Vec3 = [
        HELICES[0].flowAxis[0] * followT * HELICES[0].flowScale,
        HELICES[0].flowAxis[1] * followT * HELICES[0].flowScale,
        HELICES[0].flowAxis[2] * followT * HELICES[0].flowScale,
      ];

      const project = (p: Vec3) => {
        const rel: Vec3 = [p[0] - followOffset[0], p[1] - followOffset[1], p[2] - followOffset[2]];
        const r = rotate(rel);
        const depth = CAMERA_DIST + r[2];
        const persp = FOCAL / depth;
        const sx = centerX + (r[0] * persp * scaleBase) / 900;
        const sy = centerY - (r[1] * persp * scaleBase) / 900;
        return { sx, sy, depth };
      };

      const items: DrawItem[] = [];
      const dt = (HALF_RANGE * 2) / SEGMENTS;

      for (const cfg of HELICES) {
        const tCenter = cfg.startOffset + time * cfg.flowSpeed;

        // ── The two strands ────────────────────────────────────────────
        for (const strandPhase of [0, Math.PI]) {
          const color = strandPhase === 0 ? cfg.colorA : cfg.colorB;
          let prevNormal: Vec3 | null = null;
          let prev: { left: Vec3; right: Vec3; normalOut: Vec3 } | null = null;

          for (let i = 0; i <= SEGMENTS; i++) {
            const t = tCenter - HALF_RANGE + i * dt;
            const point = helixPointAt(cfg, t, time, strandPhase);
            const tangent = normalize(
              sub(helixPointAt(cfg, t + TANGENT_EPS, time, strandPhase), helixPointAt(cfg, t - TANGENT_EPS, time, strandPhase)),
            );
            let normalV = referenceNormal(tangent);
            if (prevNormal && dot(normalV, prevNormal) < 0) normalV = [-normalV[0], -normalV[1], -normalV[2]];
            prevNormal = normalV;

            const hw = strandHalfWidthAt(cfg, t, time);
            const left: Vec3 = [point[0] + normalV[0] * hw, point[1] + normalV[1] * hw, point[2] + normalV[2] * hw];
            const right: Vec3 = [point[0] - normalV[0] * hw, point[1] - normalV[1] * hw, point[2] - normalV[2] * hw];
            const normalOut = normalize(cross(tangent, normalV));

            const cur = { left, right, normalOut };

            if (prev) {
              const Pl0 = project(prev.left);
              const Pl1 = project(cur.left);
              const Pr1 = project(cur.right);
              const Pr0 = project(prev.right);
              const depth = (Pl0.depth + Pl1.depth + Pr1.depth + Pr0.depth) / 4;

              const rotatedNormal = rotate(cur.normalOut);
              const brightness = dot(rotatedNormal, LIGHT_DIR);
              const rim = Math.max(0, dot(rotatedNormal, RIM_DIR));
              const spec = Math.pow(Math.max(0, brightness), 7);
              const fogT = clamp01((depth - FOG_NEAR) / (FOG_FAR - FOG_NEAR));

              items.push({
                kind: "quad",
                poly: [
                  [Pl0.sx, Pl0.sy],
                  [Pl1.sx, Pl1.sy],
                  [Pr1.sx, Pr1.sy],
                  [Pr0.sx, Pr0.sy],
                ],
                depth,
                color: shadeMetallic(color, brightness, rim, spec, fogT),
                alpha: 0.94 * (1 - fogT * 0.5) * cfg.opacityMul,
              });
            }
            prev = cur;
          }
        }

        // ── Rungs (base pairs) — thin connectors between the two strands ──
        const rungStart = Math.ceil((tCenter - HALF_RANGE) / cfg.rungSpacingT) * cfg.rungSpacingT;
        for (let t = rungStart; t <= tCenter + HALF_RANGE; t += cfg.rungSpacingT) {
          const a = helixPointAt(cfg, t, time, 0);
          const b = helixPointAt(cfg, t, time, Math.PI);
          const Pa = project(a);
          const Pb = project(b);
          const depth = (Pa.depth + Pb.depth) / 2;
          const fogT = clamp01((depth - FOG_NEAR) / (FOG_FAR - FOG_NEAR));
          const [rr, rg, rb] = cfg.colorRung;
          items.push({
            kind: "line",
            a: [Pa.sx, Pa.sy],
            b: [Pb.sx, Pb.sy],
            depth,
            color: [mix(rr, PAGE_BG[0], fogT), mix(rg, PAGE_BG[1], fogT), mix(rb, PAGE_BG[2], fogT)],
            alpha: 0.5 * (1 - fogT * 0.6) * cfg.opacityMul,
            width: Math.max(1.4, 5.5 * (750 / depth)),
          });
        }
      }

      // Painter's algorithm: farthest first.
      items.sort((a, b) => b.depth - a.depth);

      for (const item of items) {
        const [r, g, bl] = item.color;
        ctx.globalAlpha = item.alpha;
        if (item.kind === "quad") {
          ctx.beginPath();
          ctx.moveTo(item.poly[0][0], item.poly[0][1]);
          for (let i = 1; i < item.poly.length; i++) ctx.lineTo(item.poly[i][0], item.poly[i][1]);
          ctx.closePath();
          ctx.fillStyle = `rgb(${r | 0}, ${g | 0}, ${bl | 0})`;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(item.a[0], item.a[1]);
          ctx.lineTo(item.b[0], item.b[1]);
          ctx.lineWidth = item.width;
          ctx.lineCap = "round";
          ctx.strokeStyle = `rgb(${r | 0}, ${g | 0}, ${bl | 0})`;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      if (!reduceMotion) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full opacity-95"
        style={{
          filter:
            "blur(0.4px) drop-shadow(0 0 60px var(--glow-primary)) drop-shadow(0 0 130px var(--glow-primary))",
        }}
      />
    </div>
  );
}
