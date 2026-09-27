import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";

/**
 * Original delivery-truck illustration, driven entirely by scroll progress
 * (a MotionValue in [0, 1] from the pinned track below) — never by time.
 * Nothing here plays independently: every transform is `useTransform(progress, ...)`,
 * so scrubbing scroll up/down scrubs the drawing directly, and stopping scroll
 * freezes it exactly where it is.
 *
 * The truck/road/pin motion values below are untouched from the previous
 * pass — only their on-screen position/scale changed, to give the truck more
 * presence now that this hero carries no competing marketing copy.
 */
function TruckIllustration({ progress }: { progress: MotionValue<number> }) {
  // Truck drives from the left edge to just short of the pin.
  const truckX = useTransform(progress, [0, 1], ["2%", "70%"]);
  // A gentle scroll-linked bob — a function of progress, not time. Frequency
  // dropped from 9 to 2.5 cycles over the whole drive: at 9 cycles, even a
  // spring-smoothed progress value still produced a fast up/down flicker
  // that read as the truck "jumping" rather than a suspension-style bob.
  const truckY = useTransform(progress, (p) => Math.sin(p * Math.PI * 2.5) * 2);
  // Wheels turn as the truck advances.
  const wheelRotate = useTransform(progress, [0, 1], [0, 1080]);
  // The dashed road scrolls backward under the truck as it advances.
  const roadDashOffset = useTransform(progress, [0, 1], [0, -420]);
  // A soft "arrived" ring blooms in around the pin near the end of the journey.
  const pinRingScale = useTransform(progress, [0.72, 1], [0.4, 1.6]);
  const pinRingOpacity = useTransform(progress, [0.72, 0.88, 1], [0, 0.55, 0.18]);
  const pinBob = useTransform(progress, (p) => Math.sin(p * Math.PI * 4) * 1.5);

  // Three scroll-synced messaging stages, cross-fading over the same
  // continuous truck journey — the drawing above never changes, only which
  // copy is shown fades in/out as `progress` sweeps 0 → 1.
  const stage1Opacity = useTransform(progress, [0, 0.3, 0.36], [1, 1, 0]);
  const stage2Opacity = useTransform(progress, [0.3, 0.36, 0.63, 0.69], [0, 1, 1, 0]);
  const stage3Opacity = useTransform(progress, [0.63, 0.69, 1], [0, 1, 1]);
  const stages = [
    {
      badge: "Live Route",
      heading: "Predict fatigue before it becomes a risk.",
      desc: "SmartSense combines real-time EEG and EOG signals with machine learning to detect drowsiness trends before they become a safety risk.",
      opacity: stage1Opacity,
    },
    {
      badge: "Rest Stop",
      heading: "Smart rest management, right when it matters.",
      desc: "The moment fatigue trends start climbing, SmartSense recommends the nearest safe rest stop — timed to your route, not just the clock.",
      opacity: stage2Opacity,
    },
    {
      badge: "Sleep Insights",
      heading: "Navigate safely, with sleep monitored end to end.",
      desc: "Live route guidance keeps drivers on course, while continuous sleep-quality tracking through every rest stop closes the loop on fatigue recovery.",
      opacity: stage3Opacity,
    },
  ];

  return (
    // No text sits over this anymore, so it no longer needs the heavy dimming
    // that used to protect legibility — just a light touch for softness.
    <div className="relative size-full overflow-hidden bg-gradient-to-b from-secondary/40 via-background to-background">
      {/* Soft ambient glow, on-brand with the rest of the site */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: "radial-gradient(ellipse 65% 60% at 50% 62%, var(--glow-primary) 0%, transparent 70%)" }}
      />

      {/* SmartSense project messaging — plain, percentage-positioned HTML
          (not part of the SVG below) so it's never at the mercy of the
          scene's aspect-ratio cropping. Three stages stack in the same grid
          cell (so the block sizes to the tallest one, no manual height) and
          cross-fade against `progress`, in sync with the truck's continuous
          journey drawn below. */}
      <div className="absolute inset-x-0 top-[12%] z-10 grid px-6 text-center sm:top-[14%]">
        {stages.map((stage) => (
          <motion.div
            key={stage.badge}
            style={{ opacity: stage.opacity }}
            className="col-start-1 row-start-1 mx-auto flex max-w-2xl flex-col items-center"
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background/85 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground shadow-sm backdrop-blur-sm">
              <span className="size-2 rounded-full bg-primary" />
              {stage.badge}
            </div>
            <h2 className="max-w-2xl font-display text-3xl font-extrabold tracking-tight text-balance text-foreground sm:text-4xl lg:text-5xl">
              {stage.heading}
            </h2>
            <p className="mt-4 max-w-xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base">
              {stage.desc}
            </p>
          </motion.div>
        ))}
      </div>

      {/* `xMidYMax` (not `xMidYMid`) anchors the composition to the bottom of
          the box on every aspect ratio — on a wide/short viewport, a
          center-anchored crop was slicing the truck off entirely. The
          trade-off: on a *tall* aspect ratio, the same slice crops from the
          top instead, so nothing that must stay visible can live up there —
          which is why the route chip/graphic below are plain overlays
          positioned by container percentage, not part of this SVG. */}
      <svg viewBox="0 0 400 330" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="truckBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-foreground)" stopOpacity="0.82" />
            <stop offset="100%" stopColor="var(--color-foreground)" />
          </linearGradient>
          <radialGradient id="pinBody" cx="32%" cy="28%" r="80%">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.75" />
            <stop offset="100%" stopColor="var(--color-primary)" />
          </radialGradient>
          <radialGradient id="groundShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="black" stopOpacity="0.22" />
            <stop offset="100%" stopColor="black" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Road */}
        <line
          x1="0"
          y1="272"
          x2="400"
          y2="272"
          stroke="var(--color-border)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <motion.line
          x1="0"
          y1="272"
          x2="400"
          y2="272"
          stroke="var(--color-muted-foreground)"
          strokeWidth="3"
          strokeDasharray="18 16"
          style={{ strokeDashoffset: roadDashOffset }}
          strokeLinecap="round"
        />

        {/* Destination pin */}
        <g transform="translate(350, 272) scale(0.92)">
          <ellipse cx="0" cy="4" rx="16" ry="5" fill="url(#groundShadow)" />
          <motion.circle r={14} fill="var(--color-primary)" style={{ scale: pinRingScale, opacity: pinRingOpacity }} />
          <motion.g style={{ y: pinBob }}>
            <path
              d="M0 -46 C11 -46 20 -37.5 20 -27 C20 -13 0 8 0 8 C0 8 -20 -13 -20 -27 C-20 -37.5 -11 -46 0 -46 Z"
              fill="url(#pinBody)"
            />
            <circle cx="0" cy="-27" r="6.5" fill="var(--color-background)" />
          </motion.g>
        </g>

        {/* Truck */}
        <motion.g style={{ x: truckX, y: truckY }}>
          <g transform="translate(0, 226) scale(0.92)">
            <ellipse cx="66" cy="72" rx="62" ry="7" fill="url(#groundShadow)" />

            {/* speed lines, trailing behind the direction of travel */}
            <g opacity="0.5" stroke="var(--color-primary)" strokeWidth="2.4" strokeLinecap="round">
              <line x1="-34" y1="16" x2="-14" y2="16" />
              <line x1="-28" y1="26" x2="-10" y2="26" />
              <line x1="-20" y1="36" x2="-6" y2="36" />
            </g>

            {/* cargo box */}
            <rect x="0" y="0" width="92" height="46" rx="8" fill="url(#truckBody)" />
            <rect x="8" y="8" width="76" height="6" rx="3" fill="var(--color-primary)" opacity="0.6" />
            {/* cab */}
            <path d="M92 18 H128 a8 8 0 0 1 8 8 V46 H92 Z" fill="url(#truckBody)" />
            <rect x="100" y="24" width="22" height="16" rx="3" fill="var(--color-background)" />
            <rect x="100" y="24" width="22" height="16" rx="3" fill="var(--primary-2)" opacity="0.3" />
            {/* headlight */}
            <rect x="130" y="38" width="6" height="5" rx="1.5" fill="var(--color-primary)" />
            {/* wheels */}
            <g transform="translate(24, 50)">
              <circle r="15.5" fill="none" stroke="var(--color-border)" strokeWidth="2" />
              <circle r="15" fill="var(--color-foreground)" />
              <circle r="6.5" fill="var(--color-background)" />
              <motion.g style={{ rotate: wheelRotate }}>
                <rect x="-1.4" y="-13" width="2.8" height="26" fill="var(--color-primary)" opacity="0.7" />
                <rect x="-13" y="-1.4" width="26" height="2.8" fill="var(--color-primary)" opacity="0.7" />
              </motion.g>
            </g>
            <g transform="translate(108, 50)">
              <circle r="15.5" fill="none" stroke="var(--color-border)" strokeWidth="2" />
              <circle r="15" fill="var(--color-foreground)" />
              <circle r="6.5" fill="var(--color-background)" />
              <motion.g style={{ rotate: wheelRotate }}>
                <rect x="-1.4" y="-13" width="2.8" height="26" fill="var(--color-primary)" opacity="0.7" />
                <rect x="-13" y="-1.4" width="26" height="2.8" fill="var(--color-primary)" opacity="0.7" />
              </motion.g>
            </g>
          </g>
        </motion.g>
      </svg>
    </div>
  );
}

// The track must be taller than one viewport so there's scroll distance to
// scrub through, but a `sticky` element can only stay pinned for
// (track height − 100vh) of that — the final 100vh is inherently spent
// releasing the pin as the next section arrives. `PIN_RELEASE_AT` is that
// boundary as a fraction of the whole track, used below to remap raw scroll
// progress so the truck's journey finishes right as the release begins,
// instead of still animating while the hero slides away.
const TRACK_HEIGHT_VH = 250;
const PIN_RELEASE_AT = (TRACK_HEIGHT_VH - 100) / TRACK_HEIGHT_VH;

/**
 * Section 1 hero — a pinned scroll-track. The outer element provides the
 * scroll distance; the inner content stays sticky at the top of the
 * viewport while the user scrolls through that distance, and scroll progress
 * drives the truck illustration directly. No autoplay, no independent
 * animation — scroll is the only input.
 */
export function TruckScrollHero() {
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });
  // Scroll input arrives in discrete jumps (mouse-wheel ticks, trackpad
  // frames), which made every transform driven straight off it look jerky.
  // Passing it through a spring before deriving anything from it keeps the
  // whole scene scroll-driven (still fully scrubbable, no autoplay) but
  // interpolates between those jumps instead of snapping to each one.
  const smoothedScrollYProgress = useSpring(scrollYProgress, { stiffness: 300, damping: 40, mass: 0.6 });
  // 0 → 1 over the pinned scrubbing phase, then holds at 1 through the release.
  const truckProgress = useTransform(smoothedScrollYProgress, [0, PIN_RELEASE_AT, 1], [0, 1, 1]);

  return (
    <section ref={trackRef} className="relative" style={{ height: `${TRACK_HEIGHT_VH}vh` }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        <div className="aspect-[2/3] absolute inset-1 overflow-hidden rounded-3xl border border-black/10 sm:aspect-video lg:rounded-[3rem] dark:border-white/5">
          <TruckIllustration progress={truckProgress} />
        </div>
      </div>
    </section>
  );
}
