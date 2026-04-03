/**
 * FlowPanel — fixed right sidebar showing real-time agent execution trace.
 *
 * Each node_start event adds a collapsible row. The row expands to show
 * node-specific detail inline:
 *   - classifier: the intent it routed to (Planning / Chat)
 *   - planner: live plan steps with status indicators (pending/running/done)
 *   - executor: the specific step text this entry is handling
 *   - synthesiser: generation status / answer ready confirmation
 *
 * Why all detail lives here and not in the main content area:
 *   The chat column should only show input + final answer. Everything about
 *   "how the agent is thinking" belongs in the trace sidebar so it never
 *   interrupts the conversation flow.
 *
 * Why fixed position (not in document flow): the panel is a debug/trace overlay.
 * Keeping it outside the layout avoids pushing the main column left.
 */

import { useState, useEffect, useRef } from "react";
import type { FlowEntry, PlanStep, UIComponent } from "@/hooks/useAgentStream";

interface Props {
  flowLog: FlowEntry[];
  plan: PlanStep[];
  answer: string | null;
  classifierIntent?: "planning" | "chatting";
  // task and components feed the per-node I/O inspector panels.
  task: string;
  components: UIComponent[];
}

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

// Strip [tool_tag] prefixes — internal executor routing hints, not user-facing.
function stripTag(text: string): string {
  return text.replace(/^\[[\w_]+\]\s*/, "");
}

function nodeLabel(entry: FlowEntry, totalSteps: number): string {
  if (entry.node === "executor") {
    const n = (entry.stepIndex ?? 0) + 1;
    const total = totalSteps > 0 ? `/${totalSteps}` : "";
    return `Executor: Step ${n}${total}`;
  }
  return entry.node.charAt(0).toUpperCase() + entry.node.slice(1);
}

// ── Per-node expanded detail ──────────────────────────────────────────────────

/** Shows which route classifier chose. Only renders once intent is received. */
function ClassifierDetail({ intent }: { intent?: "planning" | "chatting" }) {
  if (!intent) return null;
  return (
    <p className="mt-1 ml-[18px] text-xs text-neutral-400 dark:text-neutral-500">
      Route:{" "}
      <span className="font-medium text-neutral-600 dark:text-neutral-400">
        {intent === "planning" ? "Planner" : "Chat"}
      </span>
    </p>
  );
}

/**
 * Shows all plan steps with live status badges inside the Planner row.
 * Steps animate pending → running (pulsing blue) → done (green ✓) as
 * executor step_done events arrive from the backend.
 */
function PlannerDetail({ plan }: { plan: PlanStep[] }) {
  if (plan.length === 0) return null;
  return (
    <ol className="mt-1.5 ml-[18px] space-y-1.5">
      {plan.map((step, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span
            className={`mt-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center
                        text-[8px] font-bold shrink-0
              ${step.status === "done"
                ? "bg-emerald-500 text-white"
                : step.status === "running"
                ? "bg-blue-500 text-white animate-pulse"
                : "bg-neutral-200 dark:bg-neutral-700 text-neutral-400"}`}
          >
            {step.status === "done" ? "✓" : i + 1}
          </span>
          <span
            className={`text-xs leading-snug
              ${step.status === "done"
                ? "line-through text-neutral-400 dark:text-neutral-600"
                : step.status === "running"
                ? "text-neutral-800 dark:text-neutral-200 font-medium"
                : "text-neutral-500 dark:text-neutral-500"}`}
          >
            {stripTag(step.text)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Shows the specific step this executor entry is handling.
 * When active: full-brightness text. When done: dimmed.
 */
function ExecutorDetail({ entry, plan }: { entry: FlowEntry; plan: PlanStep[] }) {
  const step = plan[entry.stepIndex ?? 0];
  if (!step) return null;
  return (
    <p
      className={`mt-1 ml-[18px] text-xs leading-snug
        ${entry.status === "active"
          ? "text-neutral-700 dark:text-neutral-300"
          : "text-neutral-400 dark:text-neutral-600"}`}
    >
      {stripTag(step.text)}
    </p>
  );
}

/** Shows generating state or confirms answer is ready. */
function SynthesiserDetail({ entry, answer }: { entry: FlowEntry; answer: string | null }) {
  const label = entry.status === "active"
    ? "Generating answer…"
    : answer ? "Answer ready" : "";
  if (!label) return null;
  return (
    <p className="mt-1 ml-[18px] text-xs text-neutral-400 dark:text-neutral-500">
      {label}
    </p>
  );
}

// ── I/O inspector ────────────────────────────────────────────────────────────

/**
 * Two-section monospace block showing the raw input and output for a node.
 * Rendered only when the user clicks the expand chevron on a row.
 */
function InspectBlock({ input, output }: { input: string; output: string }) {
  return (
    <div className="mt-2 rounded border border-neutral-200 dark:border-neutral-700
                    bg-neutral-100 dark:bg-neutral-950 text-xs font-mono overflow-hidden">
      <div className="border-b border-neutral-200 dark:border-neutral-700 px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest
                         text-neutral-400 dark:text-neutral-500">Input</span>
        <pre className="mt-0.5 whitespace-pre-wrap break-all text-neutral-700 dark:text-neutral-300
                        max-h-32 overflow-y-auto leading-relaxed">{input || "(empty)"}</pre>
      </div>
      <div className="px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest
                         text-neutral-400 dark:text-neutral-500">Output</span>
        <pre className="mt-0.5 whitespace-pre-wrap break-all text-neutral-700 dark:text-neutral-300
                        max-h-40 overflow-y-auto leading-relaxed">{output || "(pending…)"}</pre>
      </div>
    </div>
  );
}

/** Builds the input/output string pair for a given node entry. */
function getNodeIO(
  entry: FlowEntry,
  task: string,
  plan: PlanStep[],
  classifierIntent: "planning" | "chatting" | undefined,
  components: UIComponent[],
): { input: string; output: string } {
  switch (entry.node) {
    case "classifier":
      return {
        input: task,
        output: classifierIntent
          ? `Intent: ${classifierIntent}\nRoute: ${classifierIntent === "planning" ? "Planner" : "Chat"}`
          : "",
      };
    case "planner":
      return {
        input: task,
        output: plan.length > 0
          ? plan.map((s, i) => `${i + 1}. ${stripTag(s.text)}`).join("\n")
          : "",
      };
    case "executor": {
      const step = plan[entry.stepIndex ?? 0];
      return {
        input: step ? stripTag(step.text) : "",
        output: step?.resultPreview ?? "",
      };
    }
    case "synthesiser":
    case "chat": {
      // Input: original task + how many steps were executed (gives context on what the node synthesised).
      const stepSummary = plan.length > 0 ? `\n\n[${plan.length} step(s) executed]` : "";
      const lastComp = components.length > 0 ? components[components.length - 1] : null;
      const outputStr = lastComp
        ? `Component: ${lastComp.name}\n\n${JSON.stringify(lastComp.props, null, 2).slice(0, 800)}`
        : "";
      return { input: task + stepSummary, output: outputStr };
    }
    default:
      return { input: task, output: "" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 200;
const MAX_WIDTH = 640;

export function FlowPanel({ flowLog, plan, answer, classifierIntent, task, components }: Props) {
  const [now, setNow] = useState(Date.now());
  // Set of row indices currently expanded in the I/O inspector.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Panel open/closed — collapsed by default so the main view is uncluttered.
  const [isOpen, setIsOpen] = useState(false);

  // Panel width in px — user can drag the left edge handle to resize.
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  // Drag state in a ref so the mousemove handler always reads current values
  // without stale closures — no need to recreate the effect on width changes.
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current) return;
      // Moving left increases width — panel is right-anchored so delta is inverted.
      const delta = dragRef.current.startX - e.clientX;
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, dragRef.current.startWidth + delta)));
    }
    function onMouseUp() {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function toggle(i: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  // Tick only while there is an active entry — stops timer when all are frozen.
  useEffect(() => {
    if (!flowLog.some(e => e.status === "active")) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [flowLog]);

  // ── Collapsed state — slim tab on the right edge ──────────────────────────
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-20
                   flex flex-col items-center justify-center gap-1.5
                   w-6 py-5 rounded-l-md
                   border border-r-0 border-neutral-200 dark:border-neutral-700
                   bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm
                   hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors
                   text-neutral-400 dark:text-neutral-500
                   hover:text-neutral-700 dark:hover:text-neutral-300"
        title="Open flow inspector"
      >
        {/* Vertical FLOW label */}
        <span
          className="text-[9px] font-semibold uppercase tracking-widest
                     [writing-mode:vertical-rl] [text-orientation:mixed] rotate-180"
        >
          Flow
        </span>
        {/* Pulsing dot when agent is actively running */}
        {flowLog.some(e => e.status === "active") && (
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
        )}
      </button>
    );
  }

  // ── Open state — full panel with resize handle + close button ─────────────
  return (
    <div
      style={{ width }}
      className="fixed right-0 top-16 h-[calc(100vh-4rem)]
                 border-l border-neutral-200 dark:border-neutral-800
                 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm
                 overflow-y-auto z-20 flex flex-col"
    >
      {/* Drag handle — 4px strip on the left edge.
           Dragging leftward increases width (panel is right-anchored). */}
      <div
        onMouseDown={startDrag}
        className="absolute left-0 top-0 h-full w-1 cursor-col-resize
                   hover:bg-blue-400/40 active:bg-blue-500/60 transition-colors z-10"
        title="Drag to resize"
      />

      <div className="flex flex-col gap-0.5 px-4 py-4 flex-1">
        {/* Header: FLOW label + close button */}
        <div className="flex items-center mb-3">
          <h3 className="text-xs font-semibold text-neutral-400 dark:text-neutral-500
                         uppercase tracking-widest flex-1">
            Flow
          </h3>
          <button
            onClick={() => setIsOpen(false)}
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300
                       transition-colors text-xs leading-none"
            title="Close panel"
          >
            ✕
          </button>
        </div>

        {flowLog.length === 0 && (
          <p className="text-xs text-neutral-400 dark:text-neutral-600 italic">
            Send a message to trace the agent flow.
          </p>
        )}

        {flowLog.map((entry, i) => {
          const endTs    = entry.status === "active" ? now : (entry.endedAt ?? now);
          const elapsed  = formatElapsed(endTs - entry.startedAt);
          const isActive = entry.status === "active";

          return (
            <div
              key={i}
              className={`rounded-md px-2 py-1.5 transition-colors
                ${isActive ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}
            >
              {/* Header: dot + node name + elapsed + expand chevron */}
              <div className="flex items-center gap-2.5 text-sm">
                <span
                  className={`h-2 w-2 rounded-full shrink-0
                    ${isActive ? "bg-blue-500 animate-pulse" : "bg-emerald-500"}`}
                />
                <span
                  className={`flex-1 truncate
                    ${isActive
                      ? "text-neutral-900 dark:text-neutral-100 font-medium"
                      : "text-neutral-400 dark:text-neutral-600"}`}
                >
                  {nodeLabel(entry, plan.length)}
                </span>
                <span className="text-xs font-mono text-neutral-400 dark:text-neutral-600 shrink-0">
                  {elapsed}
                </span>
                <button
                  onClick={() => toggle(i)}
                  className="shrink-0 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300
                             transition-colors leading-none pl-1"
                  title={expanded.has(i) ? "Collapse inspector" : "Expand I/O inspector"}
                >
                  {expanded.has(i) ? "▾" : "▸"}
                </button>
              </div>

              {/* Per-node status detail */}
              {entry.node === "classifier" && (
                <ClassifierDetail intent={classifierIntent} />
              )}
              {entry.node === "planner" && (
                <PlannerDetail plan={plan} />
              )}
              {entry.node === "executor" && (
                <ExecutorDetail entry={entry} plan={plan} />
              )}
              {entry.node === "synthesiser" && (
                <SynthesiserDetail entry={entry} answer={answer} />
              )}

              {/* I/O inspector — only rendered when this row is expanded */}
              {expanded.has(i) && (() => {
                const { input, output } = getNodeIO(entry, task, plan, classifierIntent, components);
                return <InspectBlock input={input} output={output} />;
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
