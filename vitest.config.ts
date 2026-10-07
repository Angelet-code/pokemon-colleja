import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{packages,apps,tools}/*/test/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
