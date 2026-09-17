import { listGenerationLogs, type GenerationLogEntry } from "./kv";

/**
 * Claude Sonnet 5 standard API pricing (no prompt caching used by this app).
 * Verify against https://www.anthropic.com/pricing before relying on this for
 * real budgeting - rates change.
 * Last verified: 2026-09-17.
 */
export const PRICE_PER_MILLION_INPUT_TOKENS = 2;
export const PRICE_PER_MILLION_OUTPUT_TOKENS = 10;

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * PRICE_PER_MILLION_INPUT_TOKENS +
    (outputTokens / 1_000_000) * PRICE_PER_MILLION_OUTPUT_TOKENS
  );
}

export interface MonthlyUsageSummary {
  month: string; // YYYY-MM
  generations: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface UsageReport {
  currentMonth: MonthlyUsageSummary;
  byMonth: MonthlyUsageSummary[];
  byUser: { userEmail: string; generations: number; estimatedCostUsd: number }[];
  byClient: { clientName: string; generations: number; estimatedCostUsd: number }[];
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export async function buildUsageReport(): Promise<UsageReport> {
  const logs = await listGenerationLogs();
  const currentMonthKey = monthKey(new Date().toISOString());

  const byMonthMap = new Map<string, MonthlyUsageSummary>();
  const byUserMap = new Map<string, { generations: number; cost: number }>();
  const byClientMap = new Map<string, { generations: number; cost: number }>();

  function addToMonth(entry: GenerationLogEntry, cost: number) {
    const key = monthKey(entry.timestamp);
    const existing = byMonthMap.get(key) ?? {
      month: key,
      generations: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    };
    existing.generations += 1;
    existing.inputTokens += entry.inputTokens;
    existing.outputTokens += entry.outputTokens;
    existing.estimatedCostUsd += cost;
    byMonthMap.set(key, existing);
  }

  for (const entry of logs) {
    const cost = estimateCostUsd(entry.inputTokens, entry.outputTokens);
    addToMonth(entry, cost);

    const userExisting = byUserMap.get(entry.userEmail) ?? { generations: 0, cost: 0 };
    userExisting.generations += 1;
    userExisting.cost += cost;
    byUserMap.set(entry.userEmail, userExisting);

    const clientName = entry.clientName ?? "No brand profile";
    const clientExisting = byClientMap.get(clientName) ?? { generations: 0, cost: 0 };
    clientExisting.generations += 1;
    clientExisting.cost += cost;
    byClientMap.set(clientName, clientExisting);
  }

  const byMonth = Array.from(byMonthMap.values()).sort((a, b) => b.month.localeCompare(a.month));
  const currentMonth =
    byMonth.find((m) => m.month === currentMonthKey) ?? {
      month: currentMonthKey,
      generations: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    };

  return {
    currentMonth,
    byMonth,
    byUser: Array.from(byUserMap.entries())
      .map(([userEmail, v]) => ({ userEmail, generations: v.generations, estimatedCostUsd: v.cost }))
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd),
    byClient: Array.from(byClientMap.entries())
      .map(([clientName, v]) => ({ clientName, generations: v.generations, estimatedCostUsd: v.cost }))
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd),
  };
}
