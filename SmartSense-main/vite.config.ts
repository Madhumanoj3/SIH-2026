import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    // Fail loudly instead of silently moving to 5174+ if 5173 is occupied.
    // The backend's CORS allowlist (backend/main.py) only accepts
    // localhost:5173 / 127.0.0.1:5173 — a silent port bump here is exactly
    // what causes the browser's real Origin to stop matching it, which
    // Starlette reports as "OPTIONS -> 400 Bad Request, Disallowed CORS origin".
    strictPort: true,
  },
});
