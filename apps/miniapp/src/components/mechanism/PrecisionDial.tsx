type Props = {
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  label: string;
  onChange: (value: number) => void;
};

export function PrecisionDial({ value, min, max, step, unit = "PT", label, onChange }: Props) {
  const change = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  return <section className="precision-dial" aria-label={label}>
    <div className="precision-dial-head"><span>{label}</span><strong>{value.toLocaleString()} <small>{unit}</small></strong></div>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => change(Number(event.target.value))} />
    <div className="precision-dial-foot"><button type="button" onClick={() => change(value - step)} aria-label={`减少${unit}`}>−</button><span>{min.toLocaleString()} — {max.toLocaleString()}</span><button type="button" onClick={() => change(value + step)} aria-label={`增加${unit}`}>+</button></div>
  </section>;
}
