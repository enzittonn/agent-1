/**
 * useAgentStream — SSE client that drives the generative UI state machine.
 *
 * Why fetch + ReadableStream instead of EventSource:
 *   The native EventSource API only supports GET requests with no body.
 *   Our /api/run endpoint requires POST so the task is in the request body,
 *   not a query string. We manually parse the SSE wire format instead.
 *
 * SSE wire format per frame:
 *   event: <type>\n
 *   data: <JSON string>\n
 *   \n
 */

import { useState, useCallback } from "react";
import { flushSync } from "react-dom";

// Why flushSync: React 18 batches all setState calls in the same synchronous
// execution block. On localhost, multiple SSE frames arrive in one TCP chunk,
// so the for-loop processes them all before React gets a chance to render —
// the whole flow appears done at once. flushSync forces a paint after each
// event so node rows appear and animate incrementally.

export type StepStatus = "pending" | "running" | "done";

export interface PlanStep {
  text: string;          // raw "[tool_tag] Step text" from backend
  status: StepStatus;
  resultPreview?: string;
}

// FlowEntry tracks each node_start event as a row in the trace panel.
// stepIndex is only set for executor entries (used to compute "Step N/Total" label).
// endedAt is set client-side when the next node_start arrives, freezing the elapsed display.
export type FlowNodeName = "classifier" | "planner" | "executor" | "synthesiser" | "chat";

export interface FlowEntry {
  node: FlowNodeName;
  stepIndex?: number;
  status: "active" | "done";
  startedAt: number;
  endedAt?: number;
}

// A single UI component event emitted by a graph node via get_stream_writer().
// `name` must match a key in the frontend component registry.
// `props` is passed verbatim as the component's props.
export interface UIComponent {
  name: string;
  props: Record<string, unknown>;
}

export interface AgentStreamState {
  plan: PlanStep[];
  // Ordered list of UI components to render in the main content area.
  // Replaces the single `answer` string — nodes can now dispatch any named component.
  components: UIComponent[];
  // Legacy: kept for the error/empty-state fallback check in App.tsx.
  answer: string | null;
  status: "idle" | "running" | "done" | "error";
  errorMessage?: string;
  flowLog: FlowEntry[];
  // Intent the classifier chose — "planning" routes to planner, "chatting" to chat node.
  classifierIntent?: "planning" | "chatting";
  // The submitted task string — stored here because App.tsx clears its input field
  // immediately after submit, but FlowPanel needs it for per-node I/O inspection.
  task: string;
}

const INITIAL: AgentStreamState = {
  plan: [],
  components: [],
  answer: null,
  status: "idle",
  flowLog: [],
  classifierIntent: undefined,
  task: "",
};

export function useAgentStream() {
  const [state, setState] = useState<AgentStreamState>(INITIAL);

  const run = useCallback(async (task: string) => {
    setState({ ...INITIAL, status: "running", task });

    // Use absolute URL to bypass Vite's proxy, which buffers SSE responses.
    // VITE_API_URL is read from the root .env via Vite's envDir config.
    const apiBase = import.meta.env.VITE_API_URL as string ?? "http://localhost:8000";
    const response = await fetch(`${apiBase}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task }),
    }).catch((err: unknown) => {
      console.error("[SSE] fetch error:", err);
      setState(s => ({ ...s, status: "error", errorMessage: String(err) }));
      return null;
    });
    if (!response) return;

    if (!response.body) {
      setState(s => ({ ...s, status: "error", errorMessage: "No response body" }));
      return;
    }

    console.log("[SSE] connected, reading stream...");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // sse-starlette uses \r\n line endings (DEFAULT_SEPARATOR).
      // Normalize to \n so split("\n\n") finds frame boundaries correctly.
      const chunk = decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      console.log("[SSE] raw chunk:", JSON.stringify(chunk));
      buffer += chunk;
      console.log("[SSE] buffer:", JSON.stringify(buffer));

      // SSE frames are separated by double newline.
      // The last slice may be an incomplete frame — keep it in buffer.
      const frames = buffer.split("\n\n");
      buffer = frames.pop()!;
      console.log("[SSE] frames found:", frames.length, frames.map(f => JSON.stringify(f)));

      for (const frame of frames) {
        const lines = frame.split("\n");
        const eventLine = lines.find(l => l.startsWith("event:"));
        const dataLine  = lines.find(l => l.startsWith("data:"));
        if (!eventLine || !dataLine) continue;

        const eventType = eventLine.slice("event:".length).trim();
        const payload   = JSON.parse(dataLine.slice("data:".length).trim()) as Record<string, unknown>;

        console.log("[SSE]", eventType, payload);
        flushSync(() => applyEvent(eventType, payload));
      }
    }
  }, []);

  function applyEvent(type: string, payload: Record<string, unknown>) {
    setState(prev => {
      switch (type) {
        case "plan": {
          const steps = (payload.steps as string[]).map(
            (text): PlanStep => ({ text, status: "pending" })
          );
          // Mark first step as running immediately — executor will start on it
          if (steps.length > 0) steps[0].status = "running";
          return { ...prev, plan: steps };
        }
        case "step_done": {
          const idx = payload.index as number;
          const preview = payload.result_preview as string | undefined;
          const plan = prev.plan.map((s, i): PlanStep => {
            if (i === idx) return { ...s, status: "done", resultPreview: preview };
            // Advance the running indicator to the next pending step
            if (i === idx + 1 && s.status === "pending") return { ...s, status: "running" };
            return s;
          });
          return { ...prev, plan };
        }
        case "node_start": {
          const node = payload.node as FlowNodeName;
          const stepIndex = payload.step_index as number | undefined;
          const now = Date.now();
          // Freeze the previous active entry's elapsed time before appending the new one
          const updated = prev.flowLog.map(e =>
            e.status === "active" ? { ...e, status: "done" as const, endedAt: now } : e
          );
          return {
            ...prev,
            flowLog: [...updated, { node, stepIndex, status: "active", startedAt: now }],
          };
        }
        case "classifier_result":
          return { ...prev, classifierIntent: payload.intent as "planning" | "chatting" };
        case "component": {
          // New path: node emitted a typed component via get_stream_writer().
          // Append to `components` so App.tsx can dispatch to the registry.
          const incoming: UIComponent = {
            name: payload.name as string,
            props: payload.props as Record<string, unknown>,
          };
          // Also set `answer` for the legacy fallback (e.g. AnswerCard content check)
          const legacyAnswer =
            incoming.name === "AnswerCard"
              ? (incoming.props.content as string)
              : prev.answer;
          return {
            ...prev,
            components: [...prev.components, incoming],
            answer: legacyAnswer,
          };
        }
        case "answer":
          // Legacy fallback: server.py emits this when the writer path is unavailable.
          // Wrap in an AnswerCard component so the render path stays unified.
          return {
            ...prev,
            answer: payload.content as string,
            components: [
              ...prev.components,
              { name: "AnswerCard", props: { content: payload.content as string } },
            ],
          };
        case "done":
          return {
            ...prev,
            status: "done",
            // Freeze any remaining active entry (synthesiser has no node_start after it)
            flowLog: prev.flowLog.map(e =>
              e.status === "active" ? { ...e, status: "done" as const, endedAt: Date.now() } : e
            ),
          };
        case "error":
          return { ...prev, status: "error", errorMessage: payload.message as string };
        default:
          return prev;
      }
    });
  }

  return { state, run };
}
