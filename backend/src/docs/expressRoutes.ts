import type { Express, Router } from 'express';

export type ExpressRouteInfo = {
  method: string;
  path: string;
};

const normalizePath = (raw: string) => {
  if (!raw) return '/';
  let path = raw;
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/+/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
};

const toOpenApiPath = (expressPath: string) => {
  return normalizePath(expressPath).replace(/:([^/]+)/g, '{$1}');
};

const parseMountPathFromRegexp = (regexp: RegExp | undefined) => {
  if (!regexp) return '';

  // Typical express regexp source for mounted path:
  //   ^\\/api\\/v1\\/?(?=\\/|$)
  //   ^\\/sales\\/?(?=\\/|$)
  const source = regexp.source;
  if (source === '^\\/?$') return '';

  let cleaned = source;
  cleaned = cleaned
    .replace('^\\/', '/')
    .replace('(?=\\/|$)', '')
    .replace('\\/?(?=\\/|$)', '')
    .replace('\\/?', '')
    .replace('$', '')
    .replace(/\\\//g, '/');

  // If mount uses dynamic segments, the regexp becomes complex; best-effort only.
  if (cleaned.includes('(?:') || cleaned.includes('(?')) return '';

  return normalizePath(cleaned);
};

const getRoutePaths = (routePath: unknown): string[] => {
  if (!routePath) return ['/'];
  if (typeof routePath === 'string') return [routePath];
  if (Array.isArray(routePath)) return routePath.filter((p): p is string => typeof p === 'string');
  return ['/'];
};

const walkStack = (stack: any[], prefix: string, out: ExpressRouteInfo[]) => {
  for (const layer of stack) {
    if (!layer) continue;

    // Regular route: layer.route
    if (layer.route) {
      const paths = getRoutePaths(layer.route.path);
      const methods = Object.keys(layer.route.methods || {}).filter((m) => layer.route.methods[m]);
      for (const p of paths) {
        const fullPath = normalizePath(`${prefix}${p}`);
        for (const method of methods) {
          out.push({ method: method.toUpperCase(), path: fullPath });
        }
      }
      continue;
    }

    // Nested router: layer.handle.stack
    const handle = layer.handle as Router | undefined;
    const nestedStack = (handle as any)?.stack as any[] | undefined;
    if (nestedStack && Array.isArray(nestedStack)) {
      const mountPath = parseMountPathFromRegexp(layer.regexp);
      walkStack(nestedStack, normalizePath(`${prefix}${mountPath}`), out);
    }
  }
};

export const listExpressRoutes = (app: Express): ExpressRouteInfo[] => {
  const out: ExpressRouteInfo[] = [];
  const stack = ((app as any)?.stack ?? (app as any)?._router?.stack ?? (app as any)?.router?.stack) as
    | any[]
    | undefined;
  if (!stack) return out;

  walkStack(stack, '', out);

  // de-dup
  const seen = new Set<string>();
  const unique = out.filter((r) => {
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // stable ordering
  unique.sort((a, b) => {
    const pathCmp = a.path.localeCompare(b.path);
    if (pathCmp !== 0) return pathCmp;
    return a.method.localeCompare(b.method);
  });

  return unique;
};

export const toOpenApiRoute = (route: ExpressRouteInfo) => ({
  method: route.method.toLowerCase(),
  path: toOpenApiPath(route.path),
});
