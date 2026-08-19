import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type Props = { children: ReactNode; onActivate: () => void; disabled?: boolean; tone?: "brass" | "amber" };

export function HoldAction({ children, onActivate, disabled = false, tone = "brass" }: Props) {
  const [progress, setProgress] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const started = useRef(0);
  const clear = () => { if (timer.current) window.clearInterval(timer.current); timer.current = undefined; setProgress(0); };
  const start = () => { if (disabled) return; started.current = Date.now(); timer.current = window.setInterval(() => { const next = Math.min(100, ((Date.now() - started.current) / 650) * 100); setProgress(next); if (next >= 100) { clear(); onActivate(); } }, 16); };
  useEffect(() => () => clear(), []);
  return <button type="button" className={`hold-action hold-${tone}`} disabled={disabled} onPointerDown={start} onPointerUp={clear} onPointerCancel={clear} onPointerLeave={clear} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") start(); }} onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") clear(); }}>
    <span className="hold-progress" style={{ width: `${progress}%` }} />
    <span className="hold-copy">{children}</span>
  </button>;
}
