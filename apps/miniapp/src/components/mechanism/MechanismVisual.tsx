import { useState } from "react";

export type MechanismState = "idle" | "bidding" | "betting" | "claiming" | "evaluating" | "settlement" | "setup";

type Props = {
  state?: MechanismState;
  label?: string;
  videoSrc?: string;
  posterSrc?: string;
  compact?: boolean;
};

export function MechanismVisual({ state = "idle", label = "THE 12 MECHANISM", videoSrc, posterSrc = "/motion/12-mechanism-poster.webp", compact = false }: Props) {
  const [videoFailed, setVideoFailed] = useState(false);
  return <div className={`mechanism-visual mechanism-${state}${compact ? " mechanism-compact" : ""}`} aria-label={label} role="img">
    <div className="mechanism-grid" aria-hidden="true" />
    <div className="mechanism-orbit mechanism-orbit-outer" aria-hidden="true" />
    <div className="mechanism-orbit mechanism-orbit-inner" aria-hidden="true" />
    <div className="mechanism-core" aria-hidden="true"><span>12</span></div>
    {!videoFailed && videoSrc ? <video className="mechanism-media" src={videoSrc} poster={posterSrc} muted autoPlay loop playsInline preload="metadata" onError={() => setVideoFailed(true)} aria-hidden="true" /> : <img className="mechanism-poster" src={posterSrc} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
    <div className="mechanism-mark mechanism-mark-top" aria-hidden="true">12 / 01</div>
    <div className="mechanism-mark mechanism-mark-bottom" aria-hidden="true">PRECISION / DEMO</div>
    <span className="mechanism-label">{label}</span>
  </div>;
}
