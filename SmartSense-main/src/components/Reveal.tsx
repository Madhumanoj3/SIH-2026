import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll-triggered entrance wrapper — fades/slides children in every time
 * they cross into the viewport (IntersectionObserver), instead of animating
 * once on mount like `.card-enter*`. Re-hides when scrolled back out so it
 * replays on the way back down. Respects prefers-reduced-motion by
 * rendering permanently visible.
 */
export default function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setVisible(entry.isIntersecting);
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", visible && "reveal-visible", className)}
      style={{ "--reveal-y": `${y}px`, transitionDelay: visible ? `${delay}ms` : "0ms" } as CSSProperties}
    >
      {children}
    </div>
  );
}
