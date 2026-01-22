import type { Express } from 'express';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { listExpressRoutes, toOpenApiRoute } from './expressRoutes';
import { apiV1Mounts } from './apiMounts';

const buildServerUrl = () => {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const host = process.env.SWAGGER_HOST || `localhost:${port}`;
  const protocol = process.env.SWAGGER_PROTOCOL || 'http';
  return `${protocol}://${host}`;
};

export const createOpenApiSpec = () => {
  return swaggerJSDoc({
    definition: {
      openapi: '3.0.3',
      info: {
        title: 'Store Chain API',
        version: '1.0.0',
      },
      servers: [
        {
          url: `${buildServerUrl()}`,
          description: 'Root',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
    apis: ['src/docs/openapi.annotations.ts', 'src/routes/**/*.ts', 'src/modules/**/*.ts', 'src/app.ts'],
  });
};

const inferTagFromPath = (path: string) => {
  const parts = path.split('/').filter(Boolean);
  const apiIdx = parts.findIndex((p) => p === 'api');
  const v1Idx = parts.findIndex((p) => p === 'v1');
  const startIdx = v1Idx >= 0 ? v1Idx + 1 : apiIdx >= 0 ? apiIdx + 1 : 0;
  const first = parts[startIdx] || 'System';
  return first
    .split('-')
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s))
    .join(' ');
};

const mergeDiscoveredRoutesIntoSpec = (spec: any, app: Express) => {
  const discovered: Array<{ method: string; path: string; tag: string }> = [];

  // Root endpoints (non /api/v1)
  discovered.push({ method: 'get', path: '/health', tag: 'System' });

  // /api/v1 root
  discovered.push({ method: 'get', path: '/api/v1', tag: 'System' });
  discovered.push({ method: 'get', path: '/api/v1/', tag: 'System' });

  // All mounted /api/v1 routers
  for (const mount of apiV1Mounts) {
    const mountRoutes = listExpressRoutes(mount.router);
    for (const r of mountRoutes) {
      const fullPath = `${mount.basePath}${r.path === '/' ? '' : r.path}`;
      discovered.push({ method: r.method.toLowerCase(), path: fullPath, tag: mount.tag });
    }
  }

  const routes = discovered
    .map((r) => ({ ...toOpenApiRoute({ method: r.method.toUpperCase(), path: r.path }), tag: r.tag }))
    .filter((r) => !r.path.startsWith('/api-docs'))
    .filter((r) => r.path !== '/api-docs.json');

  spec.paths = spec.paths || {};

  for (const r of routes) {
    if (!spec.paths[r.path]) spec.paths[r.path] = {};
    if (!spec.paths[r.path][r.method]) {
      spec.paths[r.path][r.method] = {
        tags: [r.tag || inferTagFromPath(r.path)],
        summary: `${r.method.toUpperCase()} ${r.path}`,
        responses: {
          200: { description: 'OK' },
        },
      };
    }
  }

  return spec;
};

export const setupSwagger = (app: Express) => {
  app.get('/api-docs.json', (_req, res) => {
    const spec = mergeDiscoveredRoutesIntoSpec(createOpenApiSpec(), app);
    res.json(spec);
  });

  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      explorer: true,
      customSiteTitle: 'Store Chain API Docs',
      swaggerOptions: {
        url: '/api-docs.json',
      },
    }),
  );
};
