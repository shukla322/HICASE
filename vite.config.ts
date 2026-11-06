import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const repoName = 'HICASE';

// `--mode single` inlines JS, CSS and the Montserrat font into one HTML file
// that opens from disk with no server and no network calls.
export default defineConfig(({ mode }) => ({
  base: process.env.GITHUB_PAGES === 'true' ? `/${repoName}/` : './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
  },
}));
