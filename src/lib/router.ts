import { useEffect, useState } from 'react';

export interface Route {
  path: string;
  params: URLSearchParams;
}

function parse(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, q = ''] = h.split('?');
  return { path: path || 'dashboard', params: new URLSearchParams(q) };
}

export function useRoute(): Route {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => setR(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export function navigate(path: string, params?: Record<string, string>) {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  location.hash = `#/${path}${q}`;
}

export function href(path: string, params?: Record<string, string>) {
  return `#/${path}${params ? '?' + new URLSearchParams(params).toString() : ''}`;
}
