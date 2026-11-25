// 301 «старый адрес донора → новый» для переезда домена. Из этого файла scripts/nginx-redirects.mjs собирает карту nginx.
// Адреса, которые не меняются (/catalog, /contacts, /mom и т. п.), сюда не входят: переадресация на себя – петля.
import type { APIRoute } from 'astro';
import { products } from '../lib/catalog';
import moved from '../data/moved.json';
import { CATALOGS } from '../lib/site';

export const GET: APIRoute = () => {
  const map: Record<string, string> = { '/page64910139.html': '/', '/success-page': '/thanks', ...moved };
  for (const c of CATALOGS) if (c.old !== c.href) map[c.old] = c.href;
  for (const p of products) if (p.old && p.price && p.images.length) map[p.old] = p.path;
  return new Response(JSON.stringify(map, null, 1), { headers: { 'Content-Type': 'application/json' } });
};
