/**
 * registry.tsx — maps component names (strings from the backend) to React components.
 *
 * Why a registry instead of dynamic imports:
 *   The LangSmith approach uses LoadExternalComponent to fetch JS bundles from
 *   their CDN at runtime. We're self-hosted, so all components are bundled with
 *   the app and registered here. The dispatch pattern is identical — the backend
 *   names a component, the frontend picks it from this map.
 *
 * Adding a new component:
 *   1. Build it in src/components/
 *   2. Import it here and add to REGISTRY below
 *   3. Have a graph node call writer({"name": "<key>", "props": {...}})
 */

import type { ComponentType } from "react";
import { AnswerCard } from "@/components/AnswerCard";
import { WeatherCard } from "@/components/WeatherCard";

// Keyed by the name string emitted by the backend via get_stream_writer().
// Every component must accept `props: Record<string, unknown>` at minimum.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Record<string, ComponentType<any>> = {
  AnswerCard,
  WeatherCard,
};

interface ComponentRendererProps {
  name: string;
  props: Record<string, unknown>;
}

/**
 * ComponentRenderer — looks up `name` in the registry and renders it with `props`.
 *
 * Falls back to AnswerCard if the name is unknown, treating props.content as
 * markdown. This ensures a node emitting an unrecognised component name still
 * produces visible output rather than a blank gap.
 */
export function ComponentRenderer({ name, props }: ComponentRendererProps) {
  const Component = REGISTRY[name] ?? REGISTRY["AnswerCard"];
  // If an unknown component has no `content` prop, show its name as a fallback.
  const safeProps =
    !REGISTRY[name] && !props.content
      ? { content: `[Unknown component: ${name}]` }
      : props;
  return <Component {...safeProps} />;
}
