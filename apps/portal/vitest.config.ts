import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Same plugins and aliases as the app build, plus a DOM for component tests.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      // A file with no test must fail the run instead of passing silently
      // (that is how lib/files.test.ts went unexecuted).
      passWithNoTests: false,
      restoreMocks: true,
    },
  }),
);
