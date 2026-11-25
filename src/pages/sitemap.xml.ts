// sitemap.xml: главная, каталоги, товары, страницы покупателю. Служебные (заказ, спасибо, избранное, 404) – не включаем.
import type { APIRoute } from 'astro';
import { products } from '../lib/catalog';
import { CATALOGS, OCCASIONS } from '../lib/site';

export const GET: APIRoute = ({ site }) => {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const paths = ['/', '/catalog', ...CATALOGS.filter((c) => c.href !== '/sale').map((c) => c.href),
    ...products.filter((p) => p.price && p.images.length).map((p) => p.path),
    ...OCCASIONS.map((o) => `/${o.slug}`),
    '/about', '/sale', '/corporate', '/guarantees', '/delivery', '/contacts', '/company-details', '/privacy', '/terms', '/site-map'];
  const urls = paths.map((p) => `<url><loc>${new URL(base + (p === '/' ? '/' : p + '/'), site).href}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { 'Content-Type': 'application/xml' } });
};
