import { useEffect, useRef } from "react";

/**
 * Premium animated backdrop:
 *   Layer 0 (CSS)  — four slow gradient nebula blobs + dot-grid
 *   Layer 1 (Canvas) — ~12 large, slow, glowing nebula orbs
 *   Layer 2 (Canvas) — ~55 constellation nodes connected by neural-network lines
 *   Layer 3 (Canvas) — ~30 small fast-twinkle sparkles
 *
 * Purely decorative. Zero state. Zero data. Nothing that can block the UI.
 * Respects prefers-reduced-motion: renders one static frame then stops.
 */
export default function AnimatedBackground() {
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
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // ── Color readers ────────────────────────────────────────────────────────
    const css = (v: string, fallback: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fallback;

    let colNode = css("--particle-color", "oklch(0.85 0.06 285 / 55%)");
    let colOrb  = css("--blob-a",         "oklch(0.55 0.18 291 / 32%)");
    let colLine = css("--particle-color", "oklch(0.85 0.06 285 / 55%)");

    const readColors = () => {
      colNode = css("--particle-color", "oklch(0.85 0.06 285 / 55%)");
      colOrb  = css("--blob-a",         "oklch(0.55 0.18 291 / 32%)");
      colLine = css("--particle-color", "oklch(0.85 0.06 285 / 55%)");
    };

    // ── Layer 1: large glowing nebula orbs (very slow, blurred via ctx) ──────
    const ORB_COUNT = 10;
    type Orb = { x: number; y: number; r: number; vx: number; vy: number; phase: number; speed: number; hue: number };
    const orbs: Orb[] = Array.from({ length: ORB_COUNT }, () => ({
      x:     Math.random() * (typeof window !== "undefined" ? window.innerWidth  : 1440),
      y:     Math.random() * (typeof window !== "undefined" ? window.innerHeight : 900),
      r:     Math.random() * 90 + 60,          // 60–150 px radius
      vx:    (Math.random() - 0.5) * 0.018,
      vy:    (Math.random() - 0.5) * 0.018,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.0008 + 0.0004,
      hue:   [260, 280, 300, 250, 320][Math.floor(Math.random() * 5)], // violet/blue/purple range
    }));

    // ── Layer 2: constellation nodes with connection lines ───────────────────
    const NODE_COUNT = 60;
    type Node = { x: number; y: number; r: number; vx: number; vy: number; phase: number; speed: number };
    const nodes: Node[] = Array.from({ length: NODE_COUNT }, () => ({
      x:     Math.random() * (typeof window !== "undefined" ? window.innerWidth  : 1440),
      y:     Math.random() * (typeof window !== "undefined" ? window.innerHeight : 900),
      r:     Math.random() * 1.4 + 0.6,        // 0.6–2 px
      vx:    (Math.random() - 0.5) * 0.05,
      vy:    (Math.random() - 0.5) * 0.05,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.0035 + 0.002,
    }));
    const CONNECTION_DIST = 160; // px — max distance for drawing a line

    // ── Layer 3: small fast sparkles ─────────────────────────────────────────
    const SPARKLE_COUNT = 32;
    type Sparkle = { x: number; y: number; r: number; vx: number; vy: number; phase: number; speed: number };
    const sparkles: Sparkle[] = Array.from({ length: SPARKLE_COUNT }, () => ({
      x:     Math.random() * (typeof window !== "undefined" ? window.innerWidth  : 1440),
      y:     Math.random() * (typeof window !== "undefined" ? window.innerHeight : 900),
      r:     Math.random() * 0.9 + 0.3,        // tiny
      vx:    (Math.random() - 0.5) * 0.12,
      vy:    (Math.random() - 0.5) * 0.12,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.012 + 0.006,
    }));

    // ── Wrap around helper ───────────────────────────────────────────────────
    const wrap = (p: { x: number; y: number }, pad = 20) => {
      if (p.x < -pad) p.x = width + pad;
      if (p.x > width + pad) p.x = -pad;
      if (p.y < -pad) p.y = height + pad;
      if (p.y > height + pad) p.y = -pad;
    };

    // ── Main draw loop ───────────────────────────────────────────────────────
    let raf = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(now - last, 50); // clamp at 50ms to prevent spiral on tab-switch
      last = now;
      ctx.clearRect(0, 0, width, height);

      // ─ Layer 1: nebula orbs ─────────────────────────────────────────────
      for (const o of orbs) {
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        o.phase += o.speed * dt;
        wrap(o, 200);

        const pulse = 0.55 + Math.sin(o.phase) * 0.25; // 0.3–0.8
        const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        // Use hsl so we can tint each orb slightly differently
        grad.addColorStop(0,   `hsla(${o.hue}, 70%, 65%, ${0.18 * pulse})`);
        grad.addColorStop(0.5, `hsla(${o.hue}, 60%, 55%, ${0.08 * pulse})`);
        grad.addColorStop(1,   `hsla(${o.hue}, 50%, 45%, 0)`);
        ctx.beginPath();
        ctx.fillStyle = grad;
        ctx.globalAlpha = 1;
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ─ Layer 2: constellation lines ─────────────────────────────────────
      ctx.save();
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST) * 0.28; // max 28% opacity
            ctx.beginPath();
            ctx.strokeStyle = colLine;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 0.6;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      ctx.restore();

      // ─ Layer 2: constellation nodes ─────────────────────────────────────
      for (const n of nodes) {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        n.phase += n.speed * dt;
        wrap(n);

        const twinkle = 0.4 + Math.abs(Math.sin(n.phase)) * 0.6;

        // Tiny inner glow
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 3.5);
        g.addColorStop(0,   `${colNode.replace(/[\d.]+\)$/, `${0.85 * twinkle})`)}`);
        g.addColorStop(1,   `${colNode.replace(/[\d.]+\)$/, "0)")}`);
        ctx.beginPath();
        ctx.fillStyle = g;
        ctx.globalAlpha = 1;
        ctx.arc(n.x, n.y, n.r * 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Solid core
        ctx.beginPath();
        ctx.fillStyle = colNode;
        ctx.globalAlpha = twinkle * 0.9;
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ─ Layer 3: sparkles ────────────────────────────────────────────────
      for (const s of sparkles) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.phase += s.speed * dt;
        wrap(s);

        const t = Math.abs(Math.sin(s.phase));
        ctx.beginPath();
        ctx.fillStyle = colNode;
        ctx.globalAlpha = t * 0.55;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      if (!reduceMotion) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    // Theme-switch color re-read
    const observer = new MutationObserver(readColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="ambient-bg" aria-hidden="true">
      {/* CSS nebula blobs */}
      <div className="ambient-blob ambient-blob--a" />
      <div className="ambient-blob ambient-blob--b" />
      <div className="ambient-blob ambient-blob--c" />
      <div className="ambient-blob ambient-blob--d" />
      <div className="ambient-blob ambient-blob--e" />
      {/* Dot-grid overlay */}
      <div className="ambient-dotgrid" />
      {/* Radial depth vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 75% 70% at 50% 38%, transparent 35%, oklch(0 0 0 / 8%) 100%)",
        }}
      />
      {/* Canvas layers 1-3 */}
      <canvas ref={canvasRef} className="ambient-canvas" />
    </div>
  );
}
