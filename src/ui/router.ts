export type AppRoute = 'operator' | 'stage' | 'overlay';

export function resolveRoute(hash: string, search: string): AppRoute {
  const h = (hash || '').toLowerCase();
  const params = new URLSearchParams(search || '');
  const queryView = (params.get('view') || '').toLowerCase();

  if (h.includes('/stage') || h.includes('/view') || queryView === 'stage' || queryView === 'view') {
    return 'stage';
  }
  if (h.includes('/overlay') || queryView === 'overlay') {
    return 'overlay';
  }
  return 'operator';
}

export function getCurrentRoute(): AppRoute {
  if (typeof window === 'undefined') return 'operator';
  return resolveRoute(window.location.hash, window.location.search);
}

export function navigateTo(route: AppRoute): void {
  if (typeof window === 'undefined') return;
  if (route === 'stage') {
    window.location.hash = '#/stage';
  } else if (route === 'overlay') {
    window.location.hash = '#/overlay';
  } else {
    window.location.hash = '#/operator';
  }
}
