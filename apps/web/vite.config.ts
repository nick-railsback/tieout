import { defineConfig } from "vite";

// Minimal, framework-free config (AD-16/AD-17: honesty over polish). One
// index.html entry drives a vanilla-TS module graph; `public/` holds the
// committed report.json + reportHash assets the surface renders — it renders the
// immutable artifact, it does not re-hash it (AD-13). The web is off the
// canonical hash path, so the bundler cannot affect NFR-0.
export default defineConfig({
  build: {
    target: "es2023",
    sourcemap: true,
  },
});
