import { useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";

type Props = { children: ReactNode; onActivate: () => void; disabled?: boolean; tone?: "brass" | "amber" };

export function HoldAction({ children, onActivate, disabled = false, tone = "brass" }: Props) {
  const [progress, setProgress] = useState(0);
  const [pressing, setPressing] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const started = useRef(0);
  const activated = useRef(false);
  const clear = () => { if (timer.current) window.clearInterval(timer.current); timer.current = undefined; setPressing(false); setProgress(0); };
  const activate = () => { if (disabled || activated.current) return; activated.current = true; clear(); onActivate(); };
  const start = (event?: PointerEvent<HTMLButtonElement>) => {
    if (disabled || timer.current) return;
    activated.current = false;
    event?.currentTarget.setPointerCapture?.(event.pointerId);
    started.current = Date.now();
    setPressing(true);
    timer.current = window.setInterval(() => {
      const next = Math.min(100, ((Date.now() - started.current) / 650) * 100);
      setProgress(next);
      if (next >= 100) activate();
    }, 16);
  };
  const click = () => { if (activated.current) { activated.current = false; return; } activate(); };
  useEffect(() => () => clear(), []);
  return <button type="button" className={`hold-action hold-${tone}`} data-pressing={pressing} disabled={disabled} onClick={click} onPointerDown={start} onPointerUp={clear} onPointerCancel={clear} onPointerLeave={clear} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !event.repeat) start(); }} onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") clear(); }}>
    <span className="hold-progress" style={{ width: `${progress}%` }} />
    <span className="hold-copy">{children}</span>
  </button>;
}
