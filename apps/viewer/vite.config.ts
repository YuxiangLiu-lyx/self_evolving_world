import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { experimentAssets } from '../../scripts/experiment-assets.js';

export default defineConfig(() => {
  // Preview serves the already validated build; reconstruct archives only when
  // producing assets or serving source in development.
  let assets: ReturnType<typeof experimentAssets> | undefined;
  const archiveAssets = (): ReturnType<typeof experimentAssets> =>
    (assets ??= experimentAssets(resolve(import.meta.dirname, '../..')));
  return {
    build: {
      rolldownOptions: {
        input: {
          main: resolve(import.meta.dirname, 'index.html'),
          classic: resolve(import.meta.dirname, 'classic.html'),
          observatory: resolve(import.meta.dirname, 'observatory.html'),
        },
      },
    },
    plugins: [
      {
        name: 'validated-experiment-archive',
        configureServer(server) {
          const servedAssets = archiveAssets();
          server.middlewares.use((request, response, next) => {
            const path = request.url?.split('?')[0]?.replace(/^\//, '');
            const source =
              path === undefined ? undefined : servedAssets.get(path);
            if (source === undefined) {
              next();
              return;
            }
            response.setHeader(
              'Content-Type',
              path?.endsWith('.svg')
                ? 'image/svg+xml; charset=utf-8'
                : 'application/json; charset=utf-8',
            );
            response.setHeader('Cache-Control', 'no-store');
            response.end(source);
          });
        },
        generateBundle() {
          for (const [fileName, source] of archiveAssets())
            this.emitFile({ type: 'asset', fileName, source });
        },
      },
    ],
  };
});
