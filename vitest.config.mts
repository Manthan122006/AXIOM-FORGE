import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'webview/src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
});
