import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { InfiniteSlider } from "@/components/ui/infinite-slider";
import { ProgressiveBlur } from "@/components/ui/progressive-blur";
import { cn } from "@/lib/utils";
import { Heart, Menu, Moon, Sun, X } from "lucide-react";
import { useScroll, motion } from "motion/react";
import { TruckScrollHero } from "@/components/TruckScrollHero";
import type { ThemeMode } from "@/lib/smartsense";

export function HeroSection({
  setTheme,
  dark,
}: {
  setTheme: (theme: ThemeMode) => void;
  dark: boolean;
}) {
  return (
    <>
      <HeroHeader setTheme={setTheme} dark={dark} />
      {/* Rendered outside <main> on purpose: `overflow-x-hidden` below computes
          `overflow-y: auto` per the CSS overflow spec (a non-"visible" x-axis
          forces the y-axis off "visible" too), which makes <main> register as
          a scroll container and silently breaks `position: sticky` on any
          descendant — exactly what TruckScrollHero needs to pin while
          scrubbing. Moving it here has no visual effect; <main> and everything
          inside it (the reference's own markup) is unchanged. */}
      <TruckScrollHero />
      <main className="overflow-x-hidden">
        <section className="bg-background pb-2">
          <div className="group relative m-auto max-w-7xl px-6">
            <div className="flex flex-col items-center md:flex-row">
              <div className="md:max-w-44 md:border-r md:pr-6">
                <p className="text-end text-sm">Powering the best teams</p>
              </div>

              <div className="relative py-6 md:w-[calc(100%-11rem)]">
                <InfiniteSlider speedOnHover={20} speed={40} gap={112}>
                  <div className="flex">
                    <img className="mx-auto h-5 w-fit dark:invert" src="https://cdn.simpleicons.org/nvidia/000000" alt="Nvidia Logo" height="20" width="auto" />
                  </div>

                  <div className="flex">
                    <img className="mx-auto h-4 w-fit dark:invert" src="https://cdn.simpleicons.org/stripe/000000" alt="Stripe Logo" height="16" width="auto" />
                  </div>

                  <div className="flex">
                    <img className="mx-auto h-4 w-fit dark:invert" src="https://cdn.simpleicons.org/github/000000" alt="GitHub Logo" height="16" width="auto" />
                  </div>

                  <div className="flex">
                    <img className="mx-auto h-5 w-fit dark:invert" src="https://cdn.simpleicons.org/nike/000000" alt="Nike Logo" height="20" width="auto" />
                  </div>

                  <div className="flex">
                    <img
                      className="mx-auto h-5 w-fit dark:invert"
                      src="https://cdn.simpleicons.org/lemonsqueezy/000000"
                      alt="Lemon Squeezy Logo"
                      height="20"
                      width="auto"
                    />
                  </div>

                  <div className="flex">
                    <img className="mx-auto h-4 w-fit dark:invert" src="https://cdn.simpleicons.org/laravel/000000" alt="Laravel Logo" height="16" width="auto" />
                  </div>

                  <div className="flex">
                    <img className="mx-auto h-7 w-fit dark:invert" src="https://cdn.simpleicons.org/figma/000000" alt="Figma Logo" height="28" width="auto" />
                  </div>

                  <div className="flex">
                    <img className="mx-auto h-6 w-fit dark:invert" src="https://cdn.simpleicons.org/vercel/000000" alt="Vercel Logo" height="24" width="auto" />
                  </div>
                </InfiniteSlider>

                <div className="bg-linear-to-r from-background absolute inset-y-0 left-0 w-20"></div>
                <div className="bg-linear-to-l from-background absolute inset-y-0 right-0 w-20"></div>

                <ProgressiveBlur className="pointer-events-none absolute left-0 top-0 h-full w-20" direction="left" blurIntensity={1} />

                <ProgressiveBlur className="pointer-events-none absolute right-0 top-0 h-full w-20" direction="right" blurIntensity={1} />
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

const menuItems = [
  { name: "How It Works", href: "#how-it-works" },
  { name: "Technology", href: "#technology" },
  { name: "Wearable", href: "#product-3d" },
  { name: "About", href: "#about" },
];

const HeroHeader = ({
  setTheme,
  dark,
}: {
  setTheme: (theme: ThemeMode) => void;
  dark: boolean;
}) => {
  const [menuState, setMenuState] = React.useState(false);
  const toggleTheme = () => setTheme(dark ? "light" : "dark");
  const [scrolled, setScrolled] = React.useState(false);
  const { scrollYProgress } = useScroll();

  React.useEffect(() => {
    const unsubscribe = scrollYProgress.on("change", (latest) => {
      setScrolled(latest > 0.05);
    });

    return () => unsubscribe();
  }, [scrollYProgress]);

  return (
    <header>
      <nav data-state={menuState && "active"} className="group fixed z-20 w-full pt-2">
        <div className={cn("mx-auto max-w-7xl rounded-3xl px-6 transition-all duration-300 lg:px-12", scrolled && "bg-background/50 backdrop-blur-2xl")}>
          <motion.div
            key={1}
            className={cn("relative flex flex-wrap items-center justify-between gap-6 py-3 duration-200 lg:gap-0 lg:py-6", scrolled && "lg:py-4")}
          >
            <div className="flex w-full items-center justify-between gap-12 lg:w-auto">
              <Link to="/" aria-label="home" className="flex items-center gap-2.5">
                <span className="glow-primary grid size-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-[var(--primary-2)] text-primary-foreground">
                  <Heart size={13} fill="currentColor" strokeWidth={0} />
                </span>
                <span className="font-display text-sm font-bold">SmartSense</span>
              </Link>

              <button
                onClick={() => setMenuState(!menuState)}
                aria-label={menuState == true ? "Close Menu" : "Open Menu"}
                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
              >
                <Menu className="group-data-[state=active]:rotate-180 group-data-[state=active]:scale-0 group-data-[state=active]:opacity-0 m-auto size-6 duration-200" />

                <X className="group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
              </button>

              <div className="hidden lg:block">
                <ul className="flex gap-8 text-sm">
                  {menuItems.map((item, index) => (
                    <li key={index}>
                      <a href={item.href} className="text-muted-foreground hover:text-accent-foreground block duration-150">
                        <span>{item.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="bg-background group-data-[state=active]:block lg:group-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent">
              <div className="lg:hidden">
                <ul className="space-y-6 text-base">
                  {menuItems.map((item, index) => (
                    <li key={index}>
                      <a href={item.href} className="text-muted-foreground hover:text-accent-foreground block duration-150">
                        <span>{item.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex w-full flex-col space-y-3 sm:flex-row sm:items-center sm:gap-3 sm:space-y-0 md:w-fit">
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
                  className="grid size-9 shrink-0 place-items-center self-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground"
                >
                  {dark ? <Sun size={15} /> : <Moon size={15} />}
                </button>

                <Button asChild variant="outline" size="sm">
                  <Link to="/login">
                    <span>Login</span>
                  </Link>
                </Button>

                <Button asChild size="sm">
                  <Link to="/register">
                    <span>Sign Up</span>
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </nav>
    </header>
  );
};

