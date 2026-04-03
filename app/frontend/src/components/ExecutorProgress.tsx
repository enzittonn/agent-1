/**
 * ExecutorProgress — compact status bar shown while the agent is executing.
 *
 * Shows how many steps are done out of total, and pulses the current step label.
 * Disappears once status reaches "done" — AnswerCard takes over at that point.
 */

import type { PlanStep } from "@/hooks/useAgentStream";

interface Props {
  plan: PlanStep[];
}

export function ExecutorProgress({ plan }: Props) {
  const total   = plan.length;
  const done    = plan.filter(s => s.status === "done").length;
  const running = plan.find(s => s.status === "running");

  if (total === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
      {/* Animated dot */}
      <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shrink-0" />

      <div className="flex-1 min-w-0">
        {running && (
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300 truncate">
            {running.text.replace(/^\[[\w_]+\]\s*/, "")}
          </p>
        )}
        <p className="text-xs text-blue-500 dark:text-blue-500 mt-0.5">
          Step {done + 1} of {total}
        </p>
      </div>

      {/* Progress fraction */}
      <span className="text-xs font-mono text-blue-400 shrink-0">
        {done}/{total}
      </span>
    </div>
  );
}
