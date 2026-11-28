import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Everything is inlined into one HTML file. A mission analyst should be able
// to email the tool to a colleague, open it on a laptop with no internet and
// no install rights, and have it work. Observation data never leaves the
// machine, which rules out anything server-side.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: { target: 'es2022', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 8000 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Building a whole deck takes a couple of seconds on its own and
    // longer with the rest of the suite running beside it, so the
    // default five seconds had the deck tests failing on load rather
    // than on anything wrong with them.
    testTimeout: 30_000,
  },
});
