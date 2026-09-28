import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset paths, so the build runs from any folder or subdomain.
  base: './',
  server: {
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 8001,
    strictPort: true,
  },
})