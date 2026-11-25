import { useEffect, useState } from 'preact/hooks';

/* «Заявки» кабинета-стандарта (перенос с Milovini 7f97294). Код доски – с эталона ALEX KROWN v1 (src/v1/admin/Orders.tsx, режим leads),
   который повторяет доску EV SIBIR. Магазин без онлайн-оплаты: заказ из корзины = заявка (references/contracts.md),
   поэтому у заявки есть товары и категория – по ним считается спрос по товарам (отличие от эталона по модели данных).
   Заявки – из своего приёмника (deploy/stend/leads.py): /crm/leads, этап – /crm/stage; вход – логин и пароль админки. */

export interface LeadItem { uid: string; title: string; category: string; qty: number; price: number }
export interface Lead { key: number; id: string; createdAt: string; name: string; phone: string; form: string; page: string; message?: string; stage: 'новая' | 'в работе' | 'выполнена' | 'отказ'; source: string; items: LeadItem[]; category: string }

const STAGES: Lead['stage'][] = ['новая', 'в работе', 'выполнена', 'отказ'];
const dt = (s: string) => new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const rub = (n: number) => n.toLocaleString('ru-RU').replace(/\u00a0/g, ' ') + ' ₽';
const goods = (l: Lead) => l.items.map((i) => `${i.title}${i.qty > 1 ? ` × ${i.qty}` : ''}`).join(', ');

/* Заявки – как доска EV SIBIR (server/admin.py: board_page, list_page, export_csv, DND_JS): этап меняется
   перетаскиванием карточки в колонку, вид «Доска / Списком», выгрузка CSV (UTF-8 с BOM, «;») */
const STAGE_TITLE: Record<Lead['stage'], string> = { 'новая': 'Новые', 'в работе': 'В работе', 'выполнена': 'Выполнена', 'отказ': 'Отказ' };
const leadsCsv = (rows: Lead[]) => {
  // Данные пишет посетитель: значение, похожее на формулу Excel, обезвреживаем (телефон «+7 …» не трогаем)
  const safe = (t: string) => (/^[=+\-@\t\r]/.test(t) && !/^\+[\d\s()-]+$/.test(t) ? `'${t}` : t);
  const q = (v: unknown) => `"${safe(String(v ?? '')).replace(/"/g, '""')}"`;
  const head = ['номер', 'дата', 'имя', 'телефон', 'форма', 'товары', 'категория', 'сумма', 'страница', 'этап', 'источник', 'сообщение'];
  const body = rows.map((l) => [l.id, dt(l.createdAt), l.name, l.phone, l.form, goods(l), l.category, l.items.reduce((s, i) => s + i.price * i.qty, 0) || '', l.page, STAGE_TITLE[l.stage], l.source, l.message ?? ''].map(q).join(';'));
  return 'data:text/csv;charset=utf-8,' + encodeURIComponent('\ufeff' + [head.join(';'), ...body].join('\r\n'));
};

function LeadsView({ leads: list, onStage }: { leads: Lead[]; onStage: (key: number, stage: Lead['stage']) => void }) {
  const [q, setQ] = useState('');
  const [src, setSrc] = useState('');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const needle = q.trim().toLowerCase();
  const [cat, setCat] = useState('');
  const shown = list.filter((l) => (!src || l.source === src) && (!cat || l.category === cat) && (!needle || [l.id, l.name, l.phone, goods(l)].join(' ').toLowerCase().includes(needle)));
  const cats = [...new Set(list.map((l) => l.category).filter(Boolean))];
  const sources = [...new Set(list.map((l) => l.source))];
  const drop = (stg: Lead['stage']) => { if (drag !== null) onStage(drag, stg); setDrag(null); setOver(null); };
  return (
    <>
      <div class="tools">
        <h1>Заявки</h1>
        <span class="seg">
          <button class={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Доска</button>
          <button class={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>Списком</button>
        </span>
        <input type="search" placeholder="Номер, имя, телефон, товар" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <select value={cat} onChange={(e) => setCat((e.target as HTMLSelectElement).value)} aria-label="Категория"><option value="">Все категории</option>{cats.map((s) => <option>{s}</option>)}</select>
        <select value={src} onChange={(e) => setSrc((e.target as HTMLSelectElement).value)} aria-label="Источник"><option value="">Все источники</option>{sources.map((s) => <option>{s}</option>)}</select>
        <a class="btn" href={leadsCsv(shown)} download="leads.csv">⇩ CSV</a>
      </div>
      {view === 'board' ? (
        <div class="kb">
          {STAGES.map((stg) => (
            <section class={`kb__col${over === stg ? ' is-over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(stg); }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); drop(stg); }}>
              <h2>{STAGE_TITLE[stg]} <span>{shown.filter((l) => l.stage === stg).length}</span></h2>
              {shown.filter((l) => l.stage === stg).map((l) => (
                <article class={`kb__card${drag === l.key ? ' is-drag' : ''}`} draggable onDragStart={(e) => { e.dataTransfer?.setData('text/plain', l.id); setDrag(l.key); }} onDragEnd={() => setDrag(null)}>
                  <p class="kb__top"><b>№ {l.id}</b><span class="chip">{l.form}</span></p>
                  <p class="kb__who">{l.name} · {l.phone}</p>
                  {l.items.length > 0 && <p class="kb__goods">{goods(l)} · <b>{rub(l.items.reduce((s, i) => s + i.price * i.qty, 0))}</b></p>}
                  {l.category && <p class="muted" style="font-size:12px">Категория: {l.category}</p>}
                  {l.message && <p style="white-space:pre-line">{l.message}</p>}
                  <select value={l.stage} aria-label="Этап" onChange={(e) => onStage(l.key, (e.target as HTMLSelectElement).value as Lead['stage'])}>{STAGES.map((x) => <option value={x}>{STAGE_TITLE[x]}</option>)}</select>
                  <p class="kb__meta"><span>{dt(l.createdAt)}</span><span class="muted">{l.source}</span></p>
                </article>
              ))}
              {shown.filter((l) => l.stage === stg).length === 0 && <p class="muted" style="font-size:12.5px;text-align:center;padding:16px 0">Пусто</p>}
            </section>
          ))}
        </div>
      ) : (
        <div class="tw">
          <table class="vt" style="width:100%">
            <thead><tr><th>Когда</th><th>Имя</th><th>Телефон</th><th>Товары</th><th>Категория</th><th>Форма</th><th>Источник</th><th>Этап</th></tr></thead>
            <tbody>
              {shown.map((l) => <tr><td>{dt(l.createdAt)}</td><td>{l.name}</td><td>{l.phone}</td><td>{goods(l) || <span class="muted">без товара</span>}</td><td>{l.category}</td><td class="muted">{l.form}</td><td class="muted">{l.source}</td><td><span class="chip">{STAGE_TITLE[l.stage]}</span></td></tr>)}
              {!shown.length && <tr><td colSpan={8} class="muted" style="text-align:center;padding:20px">Заявок пока нет</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

interface Raw { id: number; created: number; form: string; fields: Record<string, string>; site: string; stage: Lead['stage'] }
const OWN = new Set(['Номер заказа', 'Имя', 'Name', 'Телефон', 'Phone', 'Заказ', 'Согласие', 'Agree', 'Источник', 'Страница заявки']);
const LABEL: Record<string, string> = { Input: 'Дата доставки', Input_2: 'Количество заказов', Input_3: 'Количество адресов', Input_4: 'Компания', Input_5: 'Что заказать', Input_6: 'Комментарий' };

/** Заявка приёмника → карточка доски. Строка заказа: «Название × 2 = 9 000 ₽». */
export function toLead(r: Raw, cats: Record<string, string>): Lead {
  const f = r.fields;
  const items = (f['Заказ'] || '').split('\n').flatMap((line) => {
    const m = line.match(/^(.+) × (\d+) = (.+)$/);
    if (!m) return [];
    const qty = Number(m[2]) || 1;
    return [{ uid: '', title: m[1], category: cats[m[1]] || '', qty, price: Number(m[3].replace(/\D/g, '')) / qty }];
  });
  return {
    key: r.id, id: f['Номер заказа'] || String(r.id), createdAt: new Date(r.created * 1000).toISOString(),
    name: f['Имя'] || f.Name || 'Без имени', phone: f['Телефон'] || f.Phone || '',
    form: r.form === 'Cart' ? 'Оформление заказа' : r.form, page: f['Страница заявки'] || '', stage: r.stage, source: f['Источник'] || '',
    message: Object.entries(f).filter(([k, v]) => v && !OWN.has(k)).map(([k, v]) => `${LABEL[k] || k}: ${v}`).join('\n') || undefined,
    items, category: items[0]?.category || '',
  };
}

// Логин и пароль, с которыми открыта админка (scripts/lock-admin.mjs)
const authHeader = () => {
  try {
    const a = JSON.parse(sessionStorage.getItem('tbp_admin_auth') || localStorage.getItem('tbp_admin_keep') || 'null');
    return a ? btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify([a.login, a.pass])))) : '';
  } catch { return ''; }
};

export default function Leads({ cats, remote }: { cats: Record<string, string>; remote: string }) {
  const [list, setList] = useState<Lead[] | null>(null);
  const [err, setErr] = useState('');
  const load = async () => {
    try {
      const r = await fetch('/crm/leads', { headers: { 'X-Admin-Auth': authHeader() } });
      if (!r.ok) throw new Error(r.status === 401 ? 'Сервер не принял логин и пароль. Выйдите и войдите снова.' : 'Заявки не загрузились, сервер не ответил.');
      const d = (await r.json()) as { leads: Raw[] };
      setList(d.leads.map((x) => toLead(x, cats)));
      setErr('');
    } catch (e) { setErr((e as Error).message || 'Заявки не загрузились.'); }
  };
  useEffect(() => {
    if (remote) return;
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  const onStage = async (key: number, stage: Lead['stage']) => {
    setList((l) => l && l.map((x) => (x.key === key ? { ...x, stage } : x)));
    let ok = false;
    try { ok = (await fetch('/crm/stage', { method: 'POST', headers: { 'X-Admin-Auth': authHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: key, stage }) })).ok; } catch { /* ниже */ }
    if (!ok) { await load(); setErr('Этап не сохранился, попробуйте ещё раз.'); }
  };
  if (remote) return <p class="demo-note">Заявки с этой копии сайта приходят в админку на стенде. <a class="btn" style="margin-left:auto" href={remote}>Открыть заявки</a></p>;
  return (
    <div>
      {err && <p class="demo-note" role="alert">{err} <button class="btn" style="margin-left:auto" onClick={load}>Обновить</button></p>}
      {list ? <LeadsView leads={list} onStage={onStage} /> : !err && <p class="muted">Загружаю заявки…</p>}
    </div>
  );
}
