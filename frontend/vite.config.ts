declare const process: { env: Record<string, string | undefined> };
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    host: "0.0.0.0",
    watch: {
      usePolling: true
    },
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://localhost:8081",
        changeOrigin: true
      }
    }
  }
});
