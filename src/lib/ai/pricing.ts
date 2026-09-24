/**
 * USD per 1M tokens (OpenAI list prices, checked Sep 2026). Unknown models are
 * costed at Terra rates so the budget guard errs on the side of stopping early.
 */
export const PRICES: Record<string, { input: number; cached: number; output: number }> = {
  "gpt-5.6-luna": { input: 0.2, cached: 0.02, output: 1.2 },
  "gpt-5.6-terra": { input: 2, cached: 0.2, output: 12 },
  "gpt-5.6-sol": { input: 5, cached: 0.5, output: 30 },
};
const FALLBACK = PRICES["gpt-5.6-terra"];

export function costUsd(model: string, usage: { input: number; cached: number; output: number }) {
  const p = PRICES[model] ?? PRICES[model.replace(/-\d{4}-\d{2}-\d{2}$/, "")] ?? FALLBACK;
  const uncached = Math.max(0, usage.input - usage.cached);
  return (uncached * p.input + usage.cached * p.cached + usage.output * p.output) / 1_000_000;
}
