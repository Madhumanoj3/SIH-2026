import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Brain,
  Cpu,
  Eye,
  Heart,
  Radio,
  Shield,
  ShieldCheck,
  Sparkles,
  Wifi,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HeroSection } from "@/components/HeroSection5";
import Reveal from "@/components/Reveal";
import { CardStack, type CardStackItem } from "@/components/ui/card-stack";

/* ═══════════════════════════════════════════════════════════════════════ */
/* Philosophy Infinite Strip                                               */
/* ═══════════════════════════════════════════════════════════════════════ */

const STRIP_WORDS: Array<{ word: string; accent?: boolean }> = [
  { word: "PREVENT" },
  { word: "✦", accent: true },
  { word: "PREDICT" },
  { word: "✦", accent: true },
  { word: "PROTECT" },
  { word: "✦", accent: true },
  { word: "RECOVER" },
  { word: "✦", accent: true },
  { word: "RESUME"  },
  { word: "✦", accent: true },
];

function PhilosophyStrip() {
  // Build one full pass — duplicated 4× inside to fill the -50% translateX slot
  const items = Array.from({ length: 4 }, (_, pass) =>
    STRIP_WORDS.map((item, i) => (
      <span
        key={`${pass}-${i}`}
        className={cn(
          "shrink-0 select-none px-4",
          item.accent
            ? "font-display text-xl text-primary/50"
            : "font-display text-[13px] font-bold tracking-[0.2em] text-foreground/75 sm:text-[15px]",
        )}
      >
        {item.word}
      </span>
    )),
  );

  return (
    <section
      id="philosophy"
      className="relative overflow-hidden border-y border-border/40 bg-background/70 py-5 backdrop-blur-sm"
    >
      {/* Edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background to-transparent" />

      <div
        className="marquee-track flex items-center"
        aria-label="SmartSense philosophy: Prevent, Predict, Protect, Recover, Resume"
      >
        {items}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
/* How It Works                                                            */
/* ═══════════════════════════════════════════════════════════════════════ */

const HOW_STEPS = [
  {
    num:   "01",
    icon:  Brain,
    color: "text-primary",
    bg:    "bg-primary/12",
    title: "Sense",
    desc:  "A lightweight EEG + EOG wearable continuously captures brain activity and eye movement signals at 128 Hz via the ESP32 module.",
  },
  {
    num:   "02",
    icon:  Activity,
    color: "text-success",
    bg:    "bg-success/12",
    title: "Analyze",
    desc:  "Trained ML models fuse both signal channels into a continuous 0–100 vigilance score — predicting fatigue before it peaks, not just detecting it.",
  },
  {
    num:   "03",
    icon:  Shield,
    color: "text-warning",
    bg:    "bg-warning/12",
    title: "Act",
    desc:  "SmartSense alerts the driver in real time and surfaces the nearest safe rest stop — so the response happens before the danger does.",
  },
] as const;

function HowItWorks() {
  return (
    <section id="how-it-works" className="dark relative overflow-hidden mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32 text-foreground">
      {/* The actual original Hero Section 5 video — the same CDN asset from
          the reference template, before the truck hero replaced it there.
          The canvas-based DnaHelixHero.tsx (still restored, just unused here)
          was a misread of what "the spiral" meant; this black/gold clip is
          the real thing. `dark` scopes this section's own tokens so the
          existing text-foreground/text-primary/text-muted-foreground classes
          below resolve to their light, on-dark values automatically —
          no per-element color changes needed. */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="pointer-events-none absolute inset-0 size-full object-cover opacity-70"
        src="https://cdn.21st.dev/assets/mirror/4b/4bc542f7d287b18d595da8e796a834608a5cf10ef3618e191bdc524ce712ba67.mp4"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-background/95" />

      <Reveal className="relative z-10 mx-auto max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">How It Works</p>
        <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          Predict before it happens.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-[15px] text-muted-foreground">
          SmartSense monitors the direction of the drowsiness trend — giving you time to act safely.
        </p>
      </Reveal>

      <div className="relative z-10 mt-16 grid gap-6 sm:grid-cols-3">
        {HOW_STEPS.map((step, i) => (
          <Reveal key={step.num} delay={i * 90}>
            <div className="soft-card group relative rounded-[1.75rem] bg-card p-7 transition hover:-translate-y-1">
              <div className="flex items-start justify-between">
                <div className={cn("grid size-12 place-items-center rounded-2xl", step.bg)}>
                  <step.icon size={22} className={step.color} />
                </div>
                <span className="font-display text-5xl font-extrabold text-muted-foreground/15 leading-none">
                  {step.num}
                </span>
              </div>
              <h3 className="mt-5 font-display text-xl font-bold">{step.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
/* Technology                                                              */
/* ═══════════════════════════════════════════════════════════════════════ */

const TECH_CARDS = [
  {
    icon:     Brain,
    gradient: "bg-gradient-to-br from-primary to-[var(--primary-2)]",
    title:    "EEG Monitoring",
    desc:     "Electroencephalography captures brainwave patterns. Delta waves and sleep spindles reveal true cognitive state beyond visible behaviour.",
  },
  {
    icon:     Eye,
    gradient: "bg-gradient-to-br from-success to-primary",
    title:    "EOG Eye Tracking",
    desc:     "Electrooculography tracks PERCLOS (eye closure) and slow eye movements — key indicators of microsleep onset, caught early.",
  },
  {
    icon:     Wifi,
    gradient: "bg-gradient-to-tr from-[var(--primary-2)] to-primary",
    title:    "Wi-Fi Telemetry",
    desc:     "An ESP32-powered wearable streams 128 Hz signal data over Wi-Fi in real time — no cloud dependency, no latency.",
  },
  {
    icon:     Zap,
    gradient: "bg-gradient-to-br from-warning to-primary",
    title:    "ML Inference",
    desc:     "Multimodal fusion models produce a continuous vigilance score — not a binary alarm — so you see the trend before it becomes a crisis.",
  },
  {
    icon:     Cpu,
    gradient: "bg-gradient-to-tr from-primary via-[var(--primary-2)] to-success",
    title:    "Edge Compute",
    desc:     "Inference runs directly on the wearable's onboard processor — sub-second response, even with no connection.",
  },
  {
    icon:     ShieldCheck,
    gradient: "bg-gradient-to-br from-success to-[var(--primary-2)]",
    title:    "Privacy by Design",
    desc:     "Raw EEG/EOG signals never leave the device unencrypted — only the computed vigilance score is ever transmitted.",
  },
] as const;

type TechCard = (typeof TECH_CARDS)[number];
type TechCardStackItem = CardStackItem & { card: TechCard };

const TECH_CARD_STACK_ITEMS: TechCardStackItem[] = TECH_CARDS.map((card) => ({
  id: card.title,
  title: card.title,
  description: card.desc,
  card,
}));

// Vivid, on-brand gradient card faces (matching the reference component's own
// "colorful photo + white text overlay" composition) instead of external
// stock imagery — no unrelated assets, same tokens used across the rest of
// the site (--primary / --primary-2 / --success / --warning).
function TechCardFace({ item }: { item: TechCardStackItem; active: boolean }) {
  const { card } = item;
  return (
    <div className={cn("relative flex h-full w-full flex-col justify-end overflow-hidden p-6 text-white", card.gradient)}>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
      <div className="relative z-10 mb-4 grid size-11 shrink-0 place-items-center rounded-2xl bg-white/20 backdrop-blur-sm">
        <card.icon size={20} className="text-white" />
      </div>
      <h3 className="relative z-10 font-display text-lg font-bold">{card.title}</h3>
      <p className="relative z-10 mt-2.5 text-sm leading-relaxed text-white/85">{card.desc}</p>
    </div>
  );
}

function TechSection() {
  return (
    <section id="technology" className="relative overflow-hidden bg-secondary/25 py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Technology</p>
          <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
            Science-backed. Real-time.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] text-muted-foreground">
            Every layer of SmartSense is built on peer-reviewed physiological signals — not guesswork.
          </p>
        </Reveal>

        <Reveal delay={100} className="mt-14">
          <CardStack
            items={TECH_CARD_STACK_ITEMS}
            renderCard={(item, state) => <TechCardFace item={item} active={state.active} />}
            cardWidth={320}
            cardHeight={260}
            overlap={0.55}
            spreadDeg={34}
            perspectivePx={1000}
            depthPx={90}
            tiltXDeg={8}
            maxVisible={5}
            autoAdvance
            intervalMs={3600}
            pauseOnHover
            showDots
          />
        </Reveal>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
/* 3D Earpiece Placeholder                                                 */
/* — Drop in Three.js / React Three Fiber here when ready                 */
/* ═══════════════════════════════════════════════════════════════════════ */

function Earpiece3DSlot() {
  return (
    <section
      id="product-3d"
      className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32"
      aria-label="Interactive product preview — coming soon"
    >
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Coming Soon</p>
        <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          Meet the Wearable
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-[15px] text-muted-foreground">
          An interactive 3D showcase of the SmartSense EEG + EOG wearable earpiece — explore every sensor.
        </p>
      </Reveal>

      {/* ── Placeholder canvas area — replace with <Canvas>...</Canvas> ── */}
      <Reveal delay={100} className="mt-12 flex justify-center">
        <div className="soft-card-lg relative flex h-80 w-full max-w-2xl items-center justify-center overflow-hidden rounded-[2rem] border-2 border-dashed border-primary/30 bg-card/50 sm:h-96">
          {/* Ambient glow */}
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              background: "radial-gradient(circle at 50% 50%, var(--glow-primary), transparent 65%)",
            }}
          />
          {/* Rotating ring decoration */}
          <div className="spin-slow pointer-events-none absolute inset-8 rounded-full border border-primary/20 border-dashed" />
          <div className="relative flex flex-col items-center gap-4 text-center">
            <div className="glow-primary grid size-18 place-items-center rounded-full bg-gradient-to-br from-primary/25 to-primary/8 p-5">
              <Radio size={32} className="text-primary" />
            </div>
            <div>
              <p className="font-display text-lg font-bold">SmartSense Wearable</p>
              <p className="mt-1 text-sm text-muted-foreground">
                3D Interactive Preview — Arriving Soon
              </p>
            </div>
          </div>
        </div>
      </Reveal>
      {/* END placeholder — future: <Canvas camera={{ fov: 40 }}><EarpieceModel /></Canvas> */}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
/* CTA Banner                                                              */
/* ═══════════════════════════════════════════════════════════════════════ */

function CTABanner() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary via-[var(--primary-2)] to-primary py-20">
      {/* Dot texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "34px 34px",
        }}
      />
      {/* Glow */}
      <div className="pointer-events-none absolute inset-0 opacity-30" style={{ background: "radial-gradient(ellipse 60% 50% at 50% 100%, white, transparent)" }} />

      <Reveal className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
        <Sparkles size={30} className="mx-auto mb-5 text-primary-foreground/60" />
        <h2 className="font-display text-4xl font-extrabold tracking-tight text-primary-foreground sm:text-5xl">
          Ready to drive safer?
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-[16px] leading-relaxed text-primary-foreground/80">
          Open the SmartSense dashboard and start monitoring your vigilance in real time — with simulated data or a live wearable.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            to="/overview"
            className="inline-flex items-center gap-2.5 rounded-full bg-white px-9 py-4 text-[15px] font-bold text-primary shadow-[0_8px_32px_-8px_rgba(0,0,0,0.35)] transition hover:bg-white/90 hover:-translate-y-0.5 active:scale-95"
          >
            Open Dashboard <ArrowRight size={15} />
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center gap-2.5 rounded-full border-2 border-white/40 px-9 py-4 text-[15px] font-semibold text-white transition hover:border-white/70 hover:bg-white/10 hover:-translate-y-0.5 active:scale-95"
          >
            Create Account
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
/* Footer                                                                  */
/* ═══════════════════════════════════════════════════════════════════════ */

function LandingFooter() {
  return (
    <footer id="about" className="border-t border-border/40 bg-background/80 py-14 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-3">
          {/* Brand column */}
          <div className="sm:col-span-1">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="glow-primary grid size-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-[var(--primary-2)] text-primary-foreground">
                <Heart size={13} fill="currentColor" strokeWidth={0} />
              </span>
              <span className="font-display text-sm font-bold">SmartSense</span>
            </Link>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              AI-powered driver safety using EEG and EOG signals. Predict fatigue before it peaks.
            </p>
            <p className="mt-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
              Predict · Rest · Recover
            </p>
          </div>

          {/* Links column */}
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
              Explore
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#how-it-works" className="hover:text-foreground transition">How It Works</a></li>
              <li><a href="#technology" className="hover:text-foreground transition">Technology</a></li>
              <li><a href="#product-3d" className="hover:text-foreground transition">Wearable</a></li>
            </ul>
          </div>

          {/* Account column */}
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
              Account
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/login"    className="hover:text-foreground transition">Sign In</Link></li>
              <li><Link to="/register" className="hover:text-foreground transition">Create Account</Link></li>
              <li><Link to="/login"    className="hover:text-foreground transition">Dashboard</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border/40 pt-6 text-center text-[12px] text-muted-foreground">
          <p>This is a research demonstration. SmartSense is <strong>not</strong> a certified medical device.</p>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
/* Root export                                                             */
/* ═══════════════════════════════════════════════════════════════════════ */

/**
 * Public landing page — shown to signed-out users at "/".
 * Does not import or touch any auth/ML/backend logic.
 * All existing authenticated routes remain completely unchanged.
 */
export default function HomePage() {
  return (
    <div className="min-h-screen text-foreground antialiased">
      <HeroSection />
      <PhilosophyStrip />
      <HowItWorks />
      <TechSection />
      <Earpiece3DSlot />
      <CTABanner />
      <LandingFooter />
    </div>
  );
}
