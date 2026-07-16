import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-only proxy: the dashboard calls /api/*, which is forwarded to the
// Habitat REST server so no CORS setup is needed. In production the built
// assets are served by the Habitat server itself (same origin, no /api prefix).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://localhost:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
