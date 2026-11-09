import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { experimentAssets } from '../../scripts/experiment-assets.js';

export default defineConfig(() => {
  const assets = experimentAssets(resolve(import.meta.dirname, '../..'));
  return {
    plugins: [
      {
        name: 'validated-experiment-archive',
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            const path = request.url?.split('?')[0]?.replace(/^\//, '');
            const source = path === undefined ? undefined : assets.get(path);
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
          for (const [fileName, source] of assets)
            this.emitFile({ type: 'asset', fileName, source });
        },
      },
    ],
  };
});
