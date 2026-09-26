import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Brain,
  ChevronDown,
  Eye,
  Heart,
  Menu,
  Radio,
  Shield,
  Sparkles,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import DnaHelixHero from "@/components/DnaHelixHero";
import Reveal from "@/components/Reveal";
import { useAuthSession } from "@/lib/auth";

/* ═══════════════════════════════════════════════════════════════════════ */
/* Navbar                                                                  */
/* ═══════════════════════════════════════════════════════════════════════ */

const NAV_LINKS = [
  { label: "Home",        href: "#top"         },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Technology",  href: "#technology"  },
  { label: "About",       href: "#about"       },
];

function LandingNav() {
  const { status } = useAuthSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setMobileOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled
          ? "bg-background/80 backdrop-blur-2xl border-b border-border/40 shadow-[0_2px_24px_-6px_oklch(0_0_0/22%)]"
          : "bg-transparent",
      )}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-8 lg:py-5">
        {/* ── Logo ── */}
        <Link to="/" className="flex shrink-0 items-center gap-2.5 group">
          <span className="glow-primary grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-[var(--primary-2)] text-primary-foreground transition group-hover:brightness-110">
            <Heart size={16} fill="currentColor" strokeWidth={0} />
          </span>
          <span className={cn("font-display text-[15px] font-bold tracking-tight", !scrolled ? "text-white" : "text-foreground")}>SmartSense</span>
        </Link>

        {/* ── Desktop nav links ── */}
        <ul className="hidden items-center gap-0.5 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
                  scrolled
                    ? "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
                    : "text-white/75 hover:bg-white/10 hover:text-white",
                )}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* ── Desktop CTAs ── */}
        <div className="hidden items-center gap-3 md:flex">
          {status !== "signed-in" && (
            <Link
              to="/login"
              className={cn(
                "text-sm font-medium transition",
                scrolled ? "text-muted-foreground hover:text-foreground" : "text-white/75 hover:text-white",
              )}
            >
              Sign in
            </Link>
          )}
          <Link
            to="/overview"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-[var(--primary-2)] px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_4px_20px_-6px_var(--glow-primary)] transition hover:brightness-110 hover:-translate-y-px active:scale-95"
          >
            {status === "signed-in" ? "Dashboard" : "Dashboard"} <ArrowRight size={13} />
          </Link>
        </div>

        {/* ── Mobile hamburger ── */}
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className={cn(
            "grid size-9 place-items-center rounded-xl border transition md:hidden",
            scrolled || mobileOpen
              ? "border-border/50 bg-secondary/50 text-muted-foreground hover:bg-accent"
              : "border-white/25 bg-white/10 text-white hover:bg-white/20",
          )}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={17} /> : <Menu size={17} />}
        </button>
      </nav>

      {/* ── Mobile dropdown ── */}
      <div
        className={cn(
          "overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out md:hidden",
          mobileOpen ? "max-h-[480px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="border-t border-border/40 bg-background/90 backdrop-blur-2xl px-5 pb-6 pt-3">
          <ul className="space-y-0.5">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-accent/70 hover:text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2.5 border-t border-border/40 pt-4">
            {status !== "signed-in" && (
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="block rounded-2xl border border-border/60 px-4 py-3 text-center text-sm font-medium transition hover:bg-accent/70"
              >
                Sign in
              </Link>
            )}
            <Link
              to="/overview"
              onClick={() => setMobileOpen(false)}
              className="block rounded-2xl bg-gradient-to-br from-primary to-[var(--primary-2)] px-4 py-3 text-center text-sm font-semibold text-primary-foreground shadow-[0_4px_20px_-6px_var(--glow-primary)]"
            >
              Open Dashboard
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
/* Hero                                                                    */
/* ═══════════════════════════════════════════════════════════════════════ */

function HeroSection() {
  return (
    <section id="top" className="dark relative flex min-h-screen items-center justify-center overflow-hidden bg-background text-foreground">
      {/* ── DNA double-helix backdrop (procedural, canvas-rendered) ── */}
      <DnaHelixHero />

      {/* ── Dark gradient overlay ── */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-black/15 to-background/95" />

      {/* ── Radial primary glow ── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(ellipse 65% 55% at 50% 62%, var(--glow-primary) 0%, transparent 70%)",
        }}
      />

      {/* ── Hero content ── */}
      <div className="page-arrive relative z-10 mx-auto max-w-5xl px-5 pt-28 pb-20 text-center sm:px-8 sm:pt-32">
        {/* Eyebrow badge */}
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/12 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary backdrop-blur-sm">
          <Sparkles size={10} />
          AI-Powered Driver Safety
        </div>

        {/* H1 — cinematic split */}
        <h1 className="font-display font-extrabold leading-[1.04] tracking-tight">
          <span className="block gradient-text text-[clamp(3rem,10vw,6.5rem)]">Stay Alert.</span>
          <span className="block text-[clamp(3rem,10vw,6.5rem)] text-foreground">Stay Safe.</span>
        </h1>

        {/* Brand name sub-label */}
        <p className="mt-4 font-display text-base font-semibold tracking-[0.18em] text-muted-foreground uppercase sm:text-lg">
          SmartSense
        </p>

        {/* Description */}
        <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-[17px]">
          AI-powered driver monitoring using{" "}
          <span className="font-semibold text-foreground">EEG</span> and{" "}
          <span className="font-semibold text-foreground">EOG</span>{" "}
          signals to detect drowsiness and support safer driving.
        </p>

        {/* CTA buttons */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            to="/overview"
            className="inline-flex items-center gap-2.5 rounded-full bg-gradient-to-br from-primary to-[var(--primary-2)] px-9 py-4 text-[15px] font-bold text-primary-foreground shadow-[0_8px_36px_-8px_var(--glow-primary)] transition hover:brightness-110 hover:-translate-y-0.5 active:scale-95"
          >
            Explore SmartSense <ArrowRight size={15} />
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2.5 rounded-full border border-border/60 bg-secondary/40 px-9 py-4 text-[15px] font-semibold text-foreground backdrop-blur-sm transition hover:bg-secondary/70 hover:-translate-y-0.5 active:scale-95"
          >
            How It Works
          </a>
        </div>

        {/* Key stats */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-10">
          {[
            { value: "128 Hz",    label: "EEG Sampling Rate"  },
            { value: "< 2s",      label: "Detection Latency"  },
            { value: "EEG + EOG", label: "Multimodal Signals" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1.5">
              <span className="font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                {stat.value}
              </span>
              <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll chevron */}
      <a
        href="#philosophy"
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-[11px] font-medium text-muted-foreground/60 transition hover:text-muted-foreground"
        aria-label="Scroll down"
      >
        <span className="hidden sm:block">Scroll to explore</span>
        <ChevronDown size={20} className="animate-bounce" />
      </a>
    </section>
  );
}

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
    <section id="how-it-works" className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">How It Works</p>
        <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          Predict before it happens.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-[15px] text-muted-foreground">
          SmartSense monitors the direction of the drowsiness trend — giving you time to act safely.
        </p>
      </Reveal>

      <div className="mt-16 grid gap-6 sm:grid-cols-3">
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
    icon:  Brain,
    color: "text-primary",
    bg:    "bg-primary/12",
    title: "EEG Monitoring",
    desc:  "Electroencephalography captures brainwave patterns. Delta waves and sleep spindles reveal true cognitive state beyond visible behaviour.",
  },
  {
    icon:  Eye,
    color: "text-success",
    bg:    "bg-success/12",
    title: "EOG Eye Tracking",
    desc:  "Electrooculography tracks PERCLOS (eye closure) and slow eye movements — key indicators of microsleep onset, caught early.",
  },
  {
    icon:  Wifi,
    color: "text-[var(--primary-2)]",
    bg:    "bg-primary/12",
    title: "Wi-Fi Telemetry",
    desc:  "An ESP32-powered wearable streams 128 Hz signal data over Wi-Fi in real time — no cloud dependency, no latency.",
  },
  {
    icon:  Zap,
    color: "text-warning",
    bg:    "bg-warning/12",
    title: "ML Inference",
    desc:  "Multimodal fusion models produce a continuous vigilance score — not a binary alarm — so you see the trend before it becomes a crisis.",
  },
] as const;

function TechSection() {
  return (
    <section id="technology" className="relative bg-secondary/25 py-24 lg:py-32">
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

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TECH_CARDS.map((card, i) => (
            <Reveal key={card.title} delay={i * 80}>
              <div className="soft-card group rounded-[1.75rem] bg-card p-6 transition hover:-translate-y-1">
                <div className={cn("mb-4 grid size-11 place-items-center rounded-2xl", card.bg)}>
                  <card.icon size={20} className={card.color} />
                </div>
                <h3 className="font-display text-base font-bold">{card.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{card.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
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
      <LandingNav />
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
