import { useEffect, useRef } from "react";
import { motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";

/**
 * Scroll-scrubbed playback of the reference clip (public/earbud/earbud-reveal.mp4),
 * rendered as a 30fps frame sequence on a <canvas> — the same technique the
 * public/3dwebsite-main reference site uses for its exploded-view scrub —
 * rather than seeking a real <video>, which has noticeable per-seek latency
 * and produced visibly "stuck" frames while scrolling. Every draw is driven
 * imperatively off a ref (no React state per scroll tick), so scrubbing never
 * triggers a re-render.
 *
 * Frames were extracted from the source video at 30fps (300 frames for its
 * ~10s runtime) via a one-off script — see public/earbud-frames/.
 */
const FRAME_COUNT = 300;
const FRAME_PATH = (n: number) => `/earbud-frames/frame-${String(n).padStart(4, "0")}.jpg`;
const PRELOAD_BATCH = 16;

const TRACK_HEIGHT_VH = 220;
const PIN_RELEASE_AT = (TRACK_HEIGHT_VH - 100) / TRACK_HEIGHT_VH;

export default function EarbudVideoReveal() {
  const trackRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<Array<HTMLImageElement | null>>(new Array(FRAME_COUNT).fill(null));
  const currentFrameRef = useRef(0);

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });
  const progress = useTransform(scrollYProgress, [0, PIN_RELEASE_AT, 1], [0, 1, 1]);
  const hintOpacity = useTransform(progress, [0, 0.02], [1, 0]);

  const drawFrame = (index: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Fall back to the nearest already-loaded earlier frame so a slow network
    // never shows a blank canvas mid-scrub.
    let img: HTMLImageElement | null = null;
    for (let i = index; i >= 0; i--) {
      if (framesRef.current[i]) {
        img = framesRef.current[i];
        break;
      }
    }
    if (!img) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  };

  // Preload: first frame immediately, then the rest in background batches.
  useEffect(() => {
    let cancelled = false;

    const loadBatch = (from: number, to: number) => {
      let cur = from;
      const next = () => {
        if (cancelled || cur > to) return;
        const end = Math.min(cur + PRELOAD_BATCH - 1, to);
        let pending = end - cur + 1;
        for (let n = cur; n <= end; n++) {
          const img = new Image();
          img.src = FRAME_PATH(n);
          img.onload = img.onerror = () => {
            if (!cancelled) framesRef.current[n - 1] = img.complete && img.naturalWidth ? img : framesRef.current[n - 1];
            if (--pending === 0) next();
          };
        }
        cur = end + 1;
      };
      next();
    };

    const first = new Image();
    first.src = FRAME_PATH(1);
    first.onload = () => {
      if (cancelled) return;
      framesRef.current[0] = first;
      drawFrame(0);
      loadBatch(2, FRAME_COUNT);
    };

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `html { scroll-behavior: smooth }` (styles.css, for anchor-link nav
  // elsewhere on this page) makes the browser animate/coalesce scroll
  // position updates instead of tracking input 1:1 — exactly what makes a
  // scroll-scrubbed section feel laggy/stepped. Disable it only while this
  // section is actually in view, so anchor-link smooth scrolling elsewhere
  // on the page is unaffected.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const html = document.documentElement;
    const observer = new IntersectionObserver(([entry]) => {
      html.style.scrollBehavior = entry.isIntersecting ? "auto" : "";
    });
    observer.observe(track);
    return () => {
      observer.disconnect();
      html.style.scrollBehavior = "";
    };
  }, []);

  // Keep the canvas's pixel buffer matched to its displayed size.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(wrap.clientWidth * dpr);
      canvas.height = Math.round(wrap.clientHeight * dpr);
      drawFrame(currentFrameRef.current);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMotionValueEvent(progress, "change", (latest) => {
    const idx = Math.min(FRAME_COUNT - 1, Math.max(0, Math.round(latest * (FRAME_COUNT - 1))));
    if (idx !== currentFrameRef.current) {
      currentFrameRef.current = idx;
      drawFrame(idx);
    }
  });

  return (
    <section ref={trackRef} className="relative" style={{ height: `${TRACK_HEIGHT_VH}vh` }}>
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden px-5 sm:px-8">
        <div
          ref={wrapRef}
          className="soft-card-lg relative aspect-video w-full max-w-4xl overflow-hidden rounded-3xl border border-border/50 bg-[#e9edf2] lg:rounded-[3rem]"
        >
          <canvas ref={canvasRef} className="absolute inset-0 size-full" />

          {/* Progress bar, mirroring the reference site's scrub indicator */}
          <div className="absolute inset-x-0 bottom-5 flex justify-center">
            <div className="h-[3px] w-24 overflow-hidden rounded-full bg-black/15">
              <motion.div
                className="h-full rounded-full bg-primary"
                style={{ scaleX: progress, transformOrigin: "left" }}
              />
            </div>
          </div>
        </div>
      </div>

      <motion.p
        style={{ opacity: hintOpacity }}
        className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70"
      >
        Scroll to explore
      </motion.p>
    </section>
  );
}
