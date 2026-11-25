// dist/redirects.json → карта 301 для nginx (стандартный вывод). Ключи – без «/» на конце, цели – с «/», чтобы не было второй переадресации.
// Товар Тильды открывался из любого раздела (/<раздел>/tproduct/<номер>-<имя>), поэтому ещё и правило по номеру.
import fs from 'node:fs';
const map = JSON.parse(fs.readFileSync('dist/redirects.json', 'utf8'));
const to = (p) => (p === '/' ? '/' : p.replace(/\/?$/, '/'));
const out = [];
for (const [from, target] of Object.entries(map)) {
  if (!/^[\w\-./%]+$/.test(from) || !/^[\w\-./]+$/.test(target)) throw new Error('странный адрес: ' + from + ' → ' + target);
  if (to(from) === to(target)) throw new Error('петля: ' + from);
  out.push(`"${from}" "${to(target)}";`, `"${from}/" "${to(target)}";`);
  const id = from.match(/tproduct\/(\d+)-/)?.[1];
  if (id) out.push(`"~^/(?:.+/)?tproduct/${id}(?:-|/|$)" "${to(target)}";`);
}
console.log(out.join('\n'));
