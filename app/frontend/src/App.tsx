/**
 * App — root component that wires the SSE hook to generative UI components.
 *
 * The main content column stays minimal: only the task input and the final AnswerCard.
 * All agent working state (classifier intent, plan steps, executor progress,
 * synthesiser status) lives inside the FlowPanel sidebar — keeping chat clean.
 *
 * This is the generative UI pattern: agent execution state drives the UI directly.
 */

import { useState } from "react";
import { useAgentStream } from "@/hooks/useAgentStream";
import { AgentLayout } from "@/components/AgentLayout";
import { FlowPanel } from "@/components/FlowPanel";
import { ComponentRenderer } from "@/components/registry";

export default function App() {
  const [task, setTask] = useState("");
  const { state, run, threadId, resetThread } = useAgentStream();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = task.trim();
    if (!trimmed || state.status === "running") return;
    setTask("");  // clear immediately so the field feels responsive
    // run() returns a Promise — without .catch(), a rejection (e.g. fetch throws
    // before the response body is readable) is silently swallowed and status stays
    // "running" forever. Catch it here and let useAgentStream's internal handler
    // take precedence; this is a last-resort safety net.
    run(trimmed).catch((err: unknown) => {
      console.error("[App] unhandled run() rejection:", err);
    });
  };

  // Start a new isolated conversation: forget the thread_id and wipe the UI.
  const handleNewConversation = () => {
    resetThread();
    setTask("");
  };

  return (
    <>
    <AgentLayout
      agentStatus={state.status}
      footer={
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={task}
            onChange={e => setTask(e.target.value)}
            placeholder="Ask FRIDAY anything..."
            disabled={state.status === "running"}
            className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700
                       bg-white dark:bg-neutral-900 px-4 py-2.5 text-sm
                       placeholder:text-neutral-400 focus:outline-none focus:ring-2
                       focus:ring-blue-500 disabled:opacity-50 transition"
          />
          {/* New conversation button — only shown when a thread is active.
               Pressing it mints a fresh thread_id on the next submit. */}
          {threadId && state.status !== "running" && (
            <button
              type="button"
              onClick={handleNewConversation}
              className="rounded-lg border border-neutral-200 dark:border-neutral-700
                         bg-white dark:bg-neutral-900 px-4 py-2.5 text-sm
                         text-neutral-600 dark:text-neutral-400
                         hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              title="Start a new conversation (forgets history)"
            >
              New
            </button>
          )}
          <button
            type="submit"
            disabled={state.status === "running" || !task.trim()}
            className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2.5
                       text-sm font-medium text-white dark:text-neutral-900
                       hover:bg-neutral-700 dark:hover:bg-neutral-300
                       disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {state.status === "running" ? "Thinking..." : "Ask"}
          </button>
        </form>
      }
    >

      {/* Component registry dispatch — each item is a typed UI component
           emitted by a graph node via get_stream_writer(). The registry maps
           the name string to the correct React component and passes props. */}
      {state.components.map((c, i) => (
        <ComponentRenderer key={i} name={c.name} props={c.props} />
      ))}

      {/* Error state */}
      {state.status === "error" && (
        <div className="rounded-lg border border-red-200 dark:border-red-900
                        bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm
                        text-red-700 dark:text-red-400">
          {state.errorMessage ?? "Something went wrong."}
        </div>
      )}

    </AgentLayout>
    <FlowPanel
      flowLog={state.flowLog}
      plan={state.plan}
      answer={state.answer}
      classifierIntent={state.classifierIntent}
      task={state.task}
      components={state.components}
    />
    </>
  );
}
