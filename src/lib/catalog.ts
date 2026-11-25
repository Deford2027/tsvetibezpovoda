import productsJson from '../data/products.json';
import occasions from '../data/occasions.json';
import blockPhotos from '../data/block-photos.json';
import partsJson from '../data/parts.json';

export interface Product {
  id: string;
  path: string;
  /** Адрес товара на доноре (для 301). */
  old?: string;
  title: string;
  descr: string;
  text: string;
  price: number | null;
  priceOld: number | null;
  mark: string;
  stock: number | null;
  parts: string[];
  sort: number;
  images: string[];
  sku?: string;
  /** Выключен в админке («На сайте») – на сайте не показывается, страница товара не собирается. */
  hidden?: boolean;
  seoTitle?: string;
  seoDescr?: string;
}
export interface Part { id: string; title: string; parent: string | null; children: Part[] }

/** Карточка товара для островов: только то, что нужно сетке и корзине. */
export interface Card {
  id: string; path: string; title: string; descr: string;
  price: number; priceOld: number | null; mark: string; img: string; img2?: string;
  parts: string[]; stock: number | null;
}

/** Все товары, включая скрытые – для админки. */
export const allProducts = productsJson as Product[];
/** Товары, которые видны на сайте. */
export const products = allProducts.filter((p) => !p.hidden);
export const parts = partsJson as Part[];

const flat: Part[] = [];
const walk = (ps: Part[]) => ps.forEach((p) => { flat.push(p); walk(p.children); });
walk(parts);
export const partById = new Map(flat.map((p) => [p.id, p]));

/** id раздела и всех его подразделов. */
export function partIds(id: string): Set<string> {
  const out = new Set<string>();
  const add = (p?: Part) => { if (!p) return; out.add(p.id); p.children.forEach(add); };
  add(partById.get(id));
  return out;
}

export function inPart(p: Product, id: string): boolean {
  const ids = partIds(id);
  return p.parts.some((x) => ids.has(x));
}

export const toCard = (p: Product): Card => ({
  id: p.id, path: p.path, title: p.title, descr: p.descr,
  price: p.price ?? 0, priceOld: p.priceOld, mark: p.mark,
  img: p.images[0] ?? '', img2: p.images[1], parts: p.parts, stock: p.stock,
});

export const rub = (n: number) => n.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';

// Разделы магазина донора (uid) – константы, чтобы страницы и меню ссылались на одно и то же.
export const PART = {
  premium: '877159492202',
  sale: '679504980532',
  mono: '901181325322',
  hits: '313851531702',
  mixed: '871717766742',
  compositions: '791447291042',
  wedding: '865143636392',
  roses: '648946318343',
  chrysanthemums: '301155593693',
} as const;

/** Допродажа на странице заказа: у донора открыток и игрушек отдельным товаром нет. */
export const addonParts: string[] = [];

/** Чип фильтра для острова Catalog: раздел со всеми подразделами. */
export interface Chip { id: string; title: string; ids: string[]; children?: Chip[] }
export function chip(id: string, title?: string, withChildren = true): Chip {
  const p = partById.get(id)!;
  return {
    id, title: title ?? p.title, ids: [...partIds(id)],
    children: withChildren && p.children.length ? p.children.map((c) => chip(c.id, undefined, false)) : undefined,
  };
}
/** Разделы поводов: у них свои страницы, в фильтрах каталога и на карточке товара их нет (как на старом сайте). */
export const occasionParts = new Set(occasions.map((o) => o.part));
/** Чипы общего каталога – разделы магазина донора, в которых есть товары (пустые «Свадебные букеты» не показываем). */
export const allChips = (): Chip[] => parts.filter((p) => !occasionParts.has(p.id) && products.some((x) => inPart(x, p.id))).map((p) => chip(p.id));

/** Товары страницы-каталога: раздел с подразделами. */
export function catalogCards(part: string): Card[] {
  return products
    .filter((p) => p.images.length && p.price && inPart(p, part))
    .map(toCard);
}

/** Фото букета донора для блоков страниц (первые экраны, баннеры). Список закреплён в block-photos.json:
    товары в админке добавляют и удаляют, а картинки блоков от этого сдвигаться не должны. */
export const photo = (n: number): string => blockPhotos[n % blockPhotos.length];
