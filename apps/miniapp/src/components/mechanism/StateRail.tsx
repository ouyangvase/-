const states = ["LOBBY", "BANKER_BIDDING", "BETTING", "PACKET_SENT", "CLAIMING", "EVALUATING", "SETTLING", "ROUND_COMPLETE"] as const;

export function StateRail({ state }: { state: string }) {
  const current = Math.max(0, states.indexOf(state as typeof states[number]));
  return <div className="mechanism-state-rail" aria-label="回合状态机">{states.map((item, index) => <span key={item} className={state === item ? "active" : index < current ? "done" : ""}><i>{String(index + 1).padStart(2, "0")}</i>{item}</span>)}</div>;
}
