interface AiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }

export function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const outer = value as Record<string, unknown>;
  const nested = outer.result && typeof outer.result === "object" && !Array.isArray(outer.result) ? outer.result as Record<string, unknown> : outer;
  for (const key of ["response", "answer", "text", "description", "caption", "output_text"]) {
    if (typeof nested[key] === "string") return nested[key] as string;
  }
  const choices = (nested.choices || outer.choices) as unknown;
  if (Array.isArray(choices) && choices.length) {
    const first = choices[0] as Record<string, unknown>;
    const message = first?.message as Record<string, unknown> | undefined;
    if (message && typeof message.content === "string") return message.content;
    if (typeof first?.text === "string") return first.text as string;
  }
  return "";
}

export function extractUsage(value: unknown): unknown {
  if (!value || typeof value !== "object") return null;
  const outer = value as Record<string, unknown>;
  if (outer.usage && typeof outer.usage === "object") return outer.usage;
  const nested = outer.result as Record<string, unknown> | undefined;
  if (nested && nested.usage && typeof nested.usage === "object") return nested.usage;
  return null;
}

export interface RunResult { model: string; output: unknown; text: string; usage: unknown; timingMs: number }

export async function runModel(ai: AiBinding, model: string, input: Record<string, unknown>): Promise<RunResult> {
  const started = Date.now();
  const output = await ai.run(model, input);
  const timingMs = Date.now() - started;
  return { model, output, text: extractText(output), usage: extractUsage(output), timingMs };
}

export interface BenchmarkRun { run: number; ok: boolean; timingMs: number | null; usage: unknown; textPreview: string | null; error: string | null }
export interface BenchmarkModelResult { model: string; runs: BenchmarkRun[]; summary: { attempts: number; ok: number; avgMs: number | null; minMs: number | null; maxMs: number | null } }

export function summarize(runs: BenchmarkRun[]) {
  const times = runs.filter(r => r.ok && typeof r.timingMs === "number").map(r => r.timingMs as number);
  return {
    attempts: runs.length,
    ok: runs.filter(r => r.ok).length,
    avgMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    minMs: times.length ? Math.min(...times) : null,
    maxMs: times.length ? Math.max(...times) : null
  };
}

export async function benchmarkModels(ai: AiBinding, models: string[], input: Record<string, unknown>, runs: number): Promise<BenchmarkModelResult[]> {
  const results: BenchmarkModelResult[] = [];
  for (const model of models) {
    const runResults: BenchmarkRun[] = [];
    for (let i = 1; i <= runs; i++) {
      try {
        const r = await runModel(ai, model, input);
        runResults.push({ run: i, ok: true, timingMs: r.timingMs, usage: r.usage, textPreview: r.text.slice(0, 160) || null, error: null });
      } catch (error) {
        runResults.push({ run: i, ok: false, timingMs: null, usage: null, textPreview: null, error: error instanceof Error ? error.message : "unknown error" });
      }
    }
    results.push({ model, runs: runResults, summary: summarize(runResults) });
  }
  return results;
}
