/**
 * PlanView — renders the agent's plan as an ordered checklist.
 *
 * Strips the [tool_tag] prefix from step text — that prefix is an internal
 * executor routing hint, not something the user needs to see.
 * Steps animate through pending → running → done as SSE events arrive.
 */

import type { PlanStep } from "@/hooks/useAgentStream";

function stripTag(text: string): string {
  // Remove "[web_search] " style prefix from display text
  return text.replace(/^\[[\w_]+\]\s*/, "");
}

interface Props {
  plan: PlanStep[];
}

export function PlanView({ plan }: Props) {
  if (plan.length === 0) return null;

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-2">
      <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest">
        Plan
      </h2>
      <ol className="space-y-2">
        {plan.map((step, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            {/* Status icon */}
            <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold
              ${step.status === "done"    ? "bg-emerald-500 text-white" :
                step.status === "running" ? "bg-blue-500 text-white animate-pulse" :
                                            "bg-neutral-200 dark:bg-neutral-700 text-neutral-400"}`}>
              {step.status === "done" ? "✓" : i + 1}
            </span>

            <span className={`leading-snug
              ${step.status === "done"    ? "text-neutral-400 dark:text-neutral-600 line-through" :
                step.status === "running" ? "text-neutral-900 dark:text-neutral-100 font-medium" :
                                            "text-neutral-500 dark:text-neutral-500"}`}>
              {stripTag(step.text)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
