import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify('test'),
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __NATIVE_BUILD__: 'false',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
