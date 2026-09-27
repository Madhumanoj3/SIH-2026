import { useEffect, useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";

/**
 * Scroll-scrubbed playback of the actual reference clip (public/earbud/earbud-reveal.mp4):
 * assembled earbud rotating → hard cut to a labelled exploded diagram → closer
 * exploded shot with a signal-flow light sweep → checkmarks settle in. Every
 * label/callout is baked into the video itself, so there is no separate DOM
 * overlay to keep in sync — scroll position maps directly to `video.currentTime`,
 * exactly like TruckScrollHero drives its SVG from scroll instead of time.
 */
const TRACK_HEIGHT_VH = 220;
const PIN_RELEASE_AT = (TRACK_HEIGHT_VH - 100) / TRACK_HEIGHT_VH;

export default function EarbudVideoReveal() {
  const trackRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [progressPct, setProgressPct] = useState(0);

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });
  const videoProgress = useTransform(scrollYProgress, [0, PIN_RELEASE_AT, 1], [0, 1, 1]);

  useMotionValueEvent(videoProgress, "change", (latest) => {
    setProgressPct(latest);
    const video = videoRef.current;
    if (!video || !duration) return;
    const target = latest * duration;
    if (Math.abs(video.currentTime - target) > 0.01) {
      video.currentTime = target;
    }
  });

  useEffect(() => {
    // iOS Safari only allows programmatic seeking after a play/pause cycle.
    const video = videoRef.current;
    if (!video) return;
    video.play().then(() => video.pause()).catch(() => {});
  }, []);

  return (
    <section ref={trackRef} className="relative" style={{ height: `${TRACK_HEIGHT_VH}vh` }}>
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden px-5 sm:px-8">
        <div className="soft-card-lg relative aspect-video w-full max-w-4xl overflow-hidden rounded-3xl border border-border/50 bg-[#e9edf2] lg:rounded-[3rem]">
          <video
            ref={videoRef}
            src="/earbud/earbud-reveal.mp4"
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            className="absolute inset-0 size-full object-cover"
          />

          {/* Progress bar, mirroring the reference site's scrub indicator */}
          <div className="absolute inset-x-0 bottom-5 flex justify-center">
            <div className="h-[3px] w-24 overflow-hidden rounded-full bg-black/15">
              <motion.div
                className="h-full rounded-full bg-primary"
                style={{ scaleX: videoProgress, transformOrigin: "left" }}
              />
            </div>
          </div>
        </div>
      </div>

      {progressPct < 0.02 ? (
        <p className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
          Scroll to explore
        </p>
      ) : null}
    </section>
  );
}
