import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: "127.0.0.1",
    port: 49411,
    proxy: {
      "/api": "http://127.0.0.1:49410",
    },
  },
});
