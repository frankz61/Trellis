import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Local debug ports are stable so browser launch URLs and the API proxy do not
// change between sessions. Root-level env files may still override them explicitly.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(process.cwd(), ".."), "");
  const frontendPort = Number(env.FRONTEND_PORT) || 57701;
  const backendPort = Number(env.BACKEND_PORT) || 57702;
  return {
    plugins: [react()],
    server: {
      port: frontendPort,
      strictPort: true,
      proxy: { "/api": `http://localhost:${backendPort}` },
    },
  };
});
