import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Project root is two levels above app/frontend/ — this is where the single
// .env file lives alongside CLAUDE.md / ROADMAP.md.
const ROOT = path.resolve(__dirname, "../../");

export default defineConfig(({ mode }) => {
  // Load all vars from the root .env (no prefix filter so we get non-VITE_ vars too
  // for use inside this config file; only VITE_* vars are exposed to the browser).
  const env = loadEnv(mode, ROOT, "");

  const backendPort = env.BACKEND_PORT ?? "8000";
  const frontendPort = parseInt(env.FRONTEND_PORT ?? "5173");

  return {
    // Tell Vite where to look for .env files so VITE_* vars reach the browser.
    envDir: ROOT,
    plugins: [react(), tailwindcss()],
    resolve: {
      // @/* maps to src/* — matches tsconfig.json paths so imports are consistent
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: {
      port: frontendPort,
      // Never silently fall back to another port — fail loudly instead.
      // The dev script kills whatever is on this port before starting Vite
      // so this should never be triggered in normal use.
      strictPort: true,
      proxy: {
        // Forward /api calls to FastAPI — object form required for SSE streaming.
        // The simple string shorthand buffers the entire response before forwarding;
        // the object form with configure() disables that buffering so SSE frames
        // reach the browser as they arrive (not all at once when the stream closes).
        "/api": {
          target: `http://localhost:${backendPort}`,
          configure: (proxy) => {
            proxy.on("proxyRes", (proxyRes) => {
              // Prevent Node's http.IncomingMessage from buffering SSE chunks.
              // Without this, the stream is held until the socket closes.
              proxyRes.socket?.setNoDelay(true);
            });
          },
        },
      },
    },
  };
});
