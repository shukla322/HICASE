import { useEffect, useState } from 'react';

export type Route =
  | { name: 'queue' | 'members' | 'reports' | 'audit' | 'settings' }
  | { name: 'member' | 'outreach'; id: string }
  | { name: 'notFound' };

/** Hash routes, so the single-file build works from disk with no server. */
export const parseRoute = (hash: string): Route => {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [head, id, sub] = parts;
  if (!head || head === 'queue') return { name: 'queue' };
  if (head === 'members' && !id) return { name: 'members' };
  if (head === 'member' && id) return sub === 'call' ? { name: 'outreach', id } : { name: 'member', id };
  if (head === 'reports' || head === 'audit' || head === 'settings') return { name: head };
  return { name: 'notFound' };
};

export const paths = {
  queue: '#/queue',
  member: (id: string) => `#/member/${id}`,
  outreach: (id: string) => `#/member/${id}/call`,
};

export const navigate = (hash: string): void => {
  window.location.hash = hash;
};

export const useRoute = (): { route: Route; key: string } => {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return { route: parseRoute(hash), key: hash };
};
