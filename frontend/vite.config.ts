import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Ports are allocated per session by scripts/alloc-ports.ps1 into the repo-root
// .env.local (one level up from this frontend/ dir). Fall back to the classic
// fixed ports when no .env.local is present (e.g. a plain `vite` with no allocator).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(process.cwd(), ".."), "");
  const frontendPort = Number(env.FRONTEND_PORT) || 5173;
  const backendPort = Number(env.BACKEND_PORT) || 8000;
  return {
    plugins: [react()],
    server: {
      port: frontendPort,
      strictPort: true,
      proxy: { "/api": `http://localhost:${backendPort}` },
    },
  };
});
