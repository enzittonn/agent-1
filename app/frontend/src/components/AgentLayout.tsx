/**
 * AgentLayout — top-level shell with LiveKit Aura visualizer in the header.
 *
 * The Aura responds to agent status via LiveKit's AgentState type:
 *   idle/done/error → 'idle'   (slow, dim)
 *   running         → 'thinking' (fast, pulsing)
 *
 * Phase 2 hook-in: pass audioTrack prop to AgentAudioVisualizerAura once
 * the LiveKit voice pipeline is wired. The layout component doesn't need
 * to change — just add the prop at the call site in App.tsx.
 */

import type { AgentState } from "@livekit/components-react";
import { AgentAudioVisualizerAura } from "@/components/agents-ui/agent-audio-visualizer-aura";

// Maps our internal agent status to LiveKit's AgentState visual states.
// 'thinking' gives the pulsing/fast animation during LLM execution.
const AURA_STATE: Record<string, AgentState> = {
  idle:    "idle",
  running: "thinking",
  done:    "idle",
  error:   "idle",
};

interface Props {
  agentStatus: "idle" | "running" | "done" | "error";
  children: React.ReactNode;
  // footer renders in a sticky bar pinned to the bottom of the viewport.
  // Why a prop: keeps the scrollable main region and the fixed input bar
  // co-located in the layout shell so pb-24 (clearing the bar) is in one place.
  footer?: React.ReactNode;
}

export function AgentLayout({ agentStatus, children, footer }: Props) {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col">
      {/* h-16 enforces exact 64px height to match FlowPanel's hardcoded top-16 offset.
           Without it, py-3 + dynamic Aura content height (~56-60px) leaves a misalignment gap. */}
      <header className="sticky top-0 z-10 h-16 border-b border-neutral-200 dark:border-neutral-800
                         bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm
                         px-6 py-3 flex items-center gap-4">
        {/* Aura visualizer — decorative in Phase 3, audio-reactive in Phase 2 */}
        <AgentAudioVisualizerAura
          state={AURA_STATE[agentStatus] ?? "idle"}
          size="sm"
          themeMode="dark"
          // audioTrack={track}  ← wire in Phase 2 once LiveKit room is connected
        />
        <span className="font-semibold text-base tracking-tight">FRIDAY</span>
        <span className="ml-auto text-xs text-neutral-400 capitalize tabular-nums">
          {agentStatus}
        </span>
      </header>

      {/* pb-24 ensures the last card isn't hidden behind the sticky footer bar */}
      <main className="flex-1 overflow-y-auto px-4 py-6 pb-24">
        <div className="max-w-2xl mx-auto space-y-4">
          {children}
        </div>
      </main>

      {/* Sticky bottom bar — only rendered when footer prop is provided */}
      {footer && (
        <div className="fixed bottom-0 left-0 right-0 z-20
                        border-t border-neutral-200 dark:border-neutral-800
                        bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm
                        px-4 py-3">
          <div className="max-w-2xl mx-auto">
            {footer}
          </div>
        </div>
      )}
    </div>
  );
}
