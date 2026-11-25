// robots.txt: боевая сборка открыта, показные копии (PUBLIC_NOINDEX) закрыты целиком.
import type { APIRoute } from 'astro';
export const GET: APIRoute = ({ site }) => {
  const closed = import.meta.env.PUBLIC_NOINDEX === '1';
  const body = closed ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nDisallow: /admin/\nDisallow: /redirects.json\nDisallow: /search.json\n\nUser-agent: Yandex\nDisallow: /admin/\nDisallow: /redirects.json\nDisallow: /search.json\nClean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&gclid\n\nSitemap: ${new URL('/sitemap.xml', site).href}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
