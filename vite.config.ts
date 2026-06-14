import { defineConfig } from 'vite'

import { cloudflare } from "@cloudflare/vite-plugin";

// `plugins: []` is required so Cloudflare Pages' auto-config can inject its
// own plugin during deploy. Without it the deploy errors with
// "Cannot modify Vite config: could not find a valid plugins array".
export default defineConfig({
  base: './',
  plugins: [cloudflare()],
  server: { port: 5180, open: true },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
})