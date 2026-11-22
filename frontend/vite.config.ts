declare const process: { env: Record<string, string | undefined> };
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      // OCR remains optional; this routes only requests explicitly targeting the BFF.
      "^/api/v1/contracts/[^/]+/ingest": {
        target: process.env.VITE_BFF_TARGET || "http://localhost:8000",
        changeOrigin: true
      },
      "/api/bff": {
        target: process.env.VITE_BFF_TARGET || "http://localhost:8000",
        changeOrigin: true
      },
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://localhost:8080",
        changeOrigin: true
      }
    }
  }
});
