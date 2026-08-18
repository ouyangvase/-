export type LedgerAccount = "USER_AVAILABLE" | "USER_LOCKED" | "USER_LOCKED_BANKER_POOL" | "BANKER_POOL" | "PLATFORM_FEE" | "DEMO_GRANTS" | "CAMPAIGN_REWARD_RESERVE" | "PENDING_ADJUSTMENT";

export interface LedgerLine { account: LedgerAccount; direction: "DEBIT" | "CREDIT"; amount: number; }
export interface Journal { id: string; referenceType: string; referenceId: string; idempotencyKey: string; reason: string; lines: LedgerLine[]; }

export function assertBalanced(journal: Journal): void {
  const debit = journal.lines.filter((line) => line.direction === "DEBIT").reduce((sum, line) => sum + Math.round(line.amount * 100), 0);
  const credit = journal.lines.filter((line) => line.direction === "CREDIT").reduce((sum, line) => sum + Math.round(line.amount * 100), 0);
  if (debit !== credit) throw new Error(`Ledger journal ${journal.id} is unbalanced: ${debit} != ${credit}`);
}

export function createTransferJournal(input: {
  id: string; referenceType: string; referenceId: string; idempotencyKey: string; reason: string;
  from: LedgerAccount; to: LedgerAccount; amount: number;
}): Journal {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || Math.round(input.amount * 100) !== input.amount * 100) throw new Error("Ledger amount must be a positive number with at most two decimals");
  const journal: Journal = {
    id: input.id,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    idempotencyKey: input.idempotencyKey,
    reason: input.reason,
    lines: [
      { account: input.from, direction: "DEBIT", amount: input.amount },
      { account: input.to, direction: "CREDIT", amount: input.amount }
    ]
  };
  assertBalanced(journal);
  return journal;
}

export function applyJournal(balances: Record<LedgerAccount, number>, journal: Journal): Record<LedgerAccount, number> {
  const next = { ...balances };
  for (const line of journal.lines) next[line.account] += line.direction === "DEBIT" ? -line.amount : line.amount;
  if (Object.values(next).some((value) => value < -0.00000001)) throw new Error("Ledger would create a negative balance");
  return next;
}
