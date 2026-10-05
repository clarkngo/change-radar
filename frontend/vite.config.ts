import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// VITE_BASE is set to /change-radar/ for the GitHub Pages build.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://localhost:${process.env.BACKEND_PORT ?? 8080}`,
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
