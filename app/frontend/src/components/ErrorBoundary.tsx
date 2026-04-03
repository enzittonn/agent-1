/**
 * ErrorBoundary — generic React error boundary for isolating subtree crashes.
 *
 * Why a class component: React's getDerivedStateFromError / componentDidCatch
 * lifecycle hooks that power error boundaries cannot be expressed as hooks.
 * A class component is the only way to intercept render-time throws in children.
 *
 * Usage:
 *   <ErrorBoundary fallback={<div>Widget unavailable</div>}>
 *     <SomeCrashyComponent />
 *   </ErrorBoundary>
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  // Rendered in place of the crashed subtree.
  // Keep it lightweight — it renders during the React error recovery phase.
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    // Flip the flag synchronously so the next render shows fallback.
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log the error so it's still visible in the console for debugging.
    console.error("[ErrorBoundary] caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
