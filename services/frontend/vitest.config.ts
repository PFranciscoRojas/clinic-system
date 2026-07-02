import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts on purpose: the build config carries the
// PWA plugin and its service-worker generation, none of which belongs in the
// unit-test pipeline.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
