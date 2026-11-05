import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { useOptionalI18n } from "../contexts/I18nContext";
import { useSettings } from "../contexts/SettingsContext";
import propertyMark from "../assets/property-mark.svg";
import { BRAND_BUSY, firstOpen, playBrandMotion, takeBrandTurn, type BrandCue, type BrandMotion } from "../lib/brandMotion";
import "./app-brand.css";

type Play = { motion: BrandMotion; on: BrandCue };
const WORD = "PROPERTY";

/** The system's reduced motion; the app's own setting comes from the settings (Settings → Reduce motion). */
function systemReducesMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

interface AppBrandProps {
  onHome: () => void;
}

/**
 * The top of the chat list: the Property Direct mark and wordmark, which go home. Its accessible label names Property Direct;
 * "Go home" is its tooltip and description. The logo moves briefly when the app opens and
 * when the pointer comes over it, then rests; nothing loops, and with reduced motion it stays still. Wallets say their
 * own network on their cards: nothing here is about money.
 */
export function AppBrand({ onHome }: AppBrandProps) {
  const home = useOptionalI18n()?.t("common.goHome") ?? "Go home";
  const moves = !useSettings().settings.reduceMotion && !systemReducesMotion();
  const root = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState<Play | null>(null);

  // The logo rests when its motion ends. The timer goes with the list: left running after the list is gone, it set
  // state on nothing (and, after a test file's teardown, failed the run). An effect of `play`, so a list whose effects
  // run again (StrictMode) starts it again instead of staying busy for good.
  useEffect(() => {
    if (!play) return;
    const timer = setTimeout(() => setPlay(null), BRAND_BUSY[play.motion][play.on]);
    return () => clearTimeout(timer);
  }, [play]);

  // Before the first paint, so the letters don't show and then vanish to come in.
  useLayoutEffect(() => {
    if (!firstOpen() || !moves || !root.current) return;
    const motion = takeBrandTurn();
    playBrandMotion(root.current, motion, "open");
    setPlay({ motion, on: "open" });
  }, [moves]);

  const hover = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || play || !moves || !root.current) return;
    const motion = takeBrandTurn();
    playBrandMotion(root.current, motion, "hover");
    setPlay({ motion, on: "hover" });
  };

  return (
    <div ref={root} className="app-brand relative flex shrink-0 items-center" data-testid="app-brand" data-motion={play?.motion} data-on={play?.on}
      onPointerEnter={hover}>
      <Link to="/" onClick={(e) => { e.preventDefault(); onHome(); }} aria-label="Property" title={home} className="sidebar-home flex items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <img src={propertyMark} width="36" height="36" className="app-brand-ghost shrink-0" alt="" />
        <span className="sidebar-wordmark whitespace-nowrap text-accent font-bold text-[1.0625rem] leading-6 tracking-tight">
          {/* One span per letter, so they can come in one after another; inline, so the word keeps its kerning. */}
          {[...WORD].map((letter, i) => <span key={i} className="app-brand-letter">{letter}</span>)}
        </span>
      </Link>
    </div>
  );
}
