import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5177,
    open: false,
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
  optimizeDeps: {
    include: ["genlayer-js", "viem"],
  },
});
