"""Заявки «Цветы без повода»: POST /lead -> база (SQLite) -> Telegram через посредника (TG_API);
GET /crm/leads и POST /crm/stage – доска «Заявки» админки (вход – логин и пароль админки).
Только стандартная библиотека. Недоставленное в Telegram повторяется. В журнал не пишутся ни данные клиентов, ни токен."""
import base64, hashlib, hmac, json, os, sqlite3, threading, time, urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

DB = os.environ.get('LEAD_DB', '/data/leads.db')
ORIGINS = os.environ.get('ORIGINS', '').split()
ADMIN_LOGIN = os.environ.get('ADMIN_LOGIN', '')
ADMIN_SHA = os.environ.get('ADMIN_PASS_SHA256', '')
# Второй вход – СВЕРХ админ: «соль:хеш» (hex), PBKDF2-SHA256, 200 000 повторов; пусто – входа нет
SVERH_LOGIN = os.environ.get('SVERH_LOGIN', '')
SVERH_HASH = os.environ.get('SVERH_PASS_PBKDF2', '')
STAGES = ('новая', 'в работе', 'выполнена', 'отказ')
TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
CHATS = [c for c in os.environ.get('TELEGRAM_CHAT_IDS', '').replace(',', ' ').split() if c]
API = os.environ.get('TG_API', 'https://api.telegram.org').rstrip('/')
MAX_BODY, MAX_ROWS = 32_768, 50_000
HIDE = {'Согласие', 'Agree'}
NAMES = {'Name': 'Имя', 'Phone': 'Телефон', 'Input': 'Дата доставки', 'Input_2': 'Количество заказов',
         'Input_3': 'Количество адресов', 'Input_4': 'Компания', 'Input_5': 'Что заказать', 'Input_6': 'Комментарий'}
wake = threading.Event()


def db():
    c = sqlite3.connect(DB, timeout=10)
    c.row_factory = sqlite3.Row
    return c


def run(sql, args=()):
    """Один запрос – одно соединение: потоки не делят его между собой."""
    c = db()
    try:
        with c:
            cur = c.execute(sql, args)
            return cur.fetchall() if cur.description else cur
    finally:
        c.close()


def init():
    run("""CREATE TABLE IF NOT EXISTS leads(id INTEGER PRIMARY KEY AUTOINCREMENT, created INTEGER NOT NULL, form TEXT NOT NULL,
        fields TEXT NOT NULL, site TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'новая', done TEXT NOT NULL DEFAULT '[]', sent INTEGER NOT NULL DEFAULT 0)""")


def text_of(lead):
    f = lead['fields']
    num = f.get('Номер заказа')
    out = [f'Новый заказ № {num}' if num else f"Заявка: {lead['form']}", '']
    for k, v in f.items():
        if k in HIDE or k == 'Номер заказа' or not v:
            continue
        out.append(f'{NAMES.get(k, k)}:\n{v}' if '\n' in v else f'{NAMES.get(k, k)}: {v}')
    return '\n'.join(out) + f"\n\nСайт: {lead['site']}"


def parts_of(text, n=1900):  # лимит Telegram 4096 единиц UTF-16: 1900 знаков проходят и с эмодзи
    return [text[i:i + n] for i in range(0, len(text), n)]


def send(chat, text):
    req = urllib.request.Request(f'{API}/bot{TOKEN}/sendMessage', method='POST',
                                 data=json.dumps({'chat_id': chat, 'text': text, 'disable_web_page_preview': True}).encode(),
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r).get('ok') is True, 0
    except urllib.error.HTTPError as e:
        wait = 0
        try:
            d = json.load(e)
            wait = int(d.get('parameters', {}).get('retry_after', 0))
            print('telegram', e.code, str(d.get('description'))[:120], flush=True)
        except Exception:
            print('telegram', e.code, flush=True)
        return False, wait
    except Exception as e:
        print('telegram', type(e).__name__, flush=True)
        return False, 0


def deliver(row):
    """Отметки done хранятся по чату и части: повтор не дублирует уже ушедшее."""
    text = text_of({'form': row['form'], 'fields': json.loads(row['fields']), 'site': row['site']})
    done = set(json.loads(row['done']))
    good, wait = True, 0
    for chat in CHATS:
        for i, part in enumerate(parts_of(text)):
            key = f'{chat}#{i}'
            if key in done:
                continue
            ok, w = send(chat, part)
            wait = max(wait, w)
            if not ok:
                good = False
                break
            done.add(key)
            run('UPDATE leads SET done=? WHERE id=?', (json.dumps(sorted(done)), row['id']))
    if good:
        run('UPDATE leads SET sent=1 WHERE id=?', (row['id'],))
        print('delivered', row['id'], flush=True)
    return good, wait


def worker():
    while True:
        pause = 60
        if TOKEN and CHATS:
            try:
                for row in run('SELECT * FROM leads WHERE sent=0 ORDER BY id LIMIT 100'):
                    ok, wait = deliver(row)
                    pause = max(pause, wait)
            except Exception as e:
                print('worker', type(e).__name__, flush=True)
        wake.wait(pause)
        wake.clear()


class H(BaseHTTPRequestHandler):
    timeout = 15

    def reply(self, code, data):
        b = json.dumps(data).encode()
        self.send_response(code)
        self.cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def cors(self):
        o = self.headers.get('Origin', '')
        if self.path == '/lead' and o in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', o)
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Vary', 'Origin')

    def admin(self):
        try:
            login, pw = json.loads(base64.b64decode(self.headers.get('X-Admin-Auth', '')))
            a = hmac.compare_digest(login.encode(), ADMIN_LOGIN.encode())
            b = hmac.compare_digest(hashlib.sha256(pw.encode()).hexdigest(), ADMIN_SHA)
            if ADMIN_LOGIN and ADMIN_SHA and a and b:
                return True
            if not (SVERH_LOGIN and SVERH_HASH and hmac.compare_digest(login.encode(), SVERH_LOGIN.encode())):
                return False
            salt, want = SVERH_HASH.split(':')
            got = hashlib.pbkdf2_hmac('sha256', pw.encode(), bytes.fromhex(salt), 200_000).hex()
            return hmac.compare_digest(got, want)
        except Exception:
            return False

    def body(self):
        n = int(self.headers.get('Content-Length', '0'))
        assert 0 < n <= MAX_BODY
        return json.loads(self.rfile.read(n))

    def do_OPTIONS(self):
        self.reply(200, {})

    def do_GET(self):
        if self.path != '/crm/leads':
            return self.reply(404, {'ok': False})
        if not self.admin():
            time.sleep(1)
            return self.reply(401, {'ok': False})
        rows = run('SELECT id,created,form,fields,site,stage FROM leads ORDER BY id DESC LIMIT 2000')
        self.reply(200, {'ok': True, 'leads': [{**dict(x), 'fields': json.loads(x['fields'])} for x in rows]})

    def do_POST(self):
        if self.path == '/crm/stage':
            return self.stage()
        if self.path != '/lead':
            return self.reply(404, {'ok': False})
        host, origin = self.headers.get('Host', ''), self.headers.get('Origin', '')
        if not host or (urlparse(origin).netloc != host and origin not in ORIGINS):
            return self.reply(403, {'ok': False})
        try:
            d = self.body()
            form, raw = d['form'], d['fields']
            assert isinstance(form, str) and isinstance(raw, dict) and 0 < len(raw) <= 60
            assert all(isinstance(v, str) for v in raw.values())
            fields = {k[:60]: v[:4000] for k, v in raw.items()}
            phone = fields.get('Телефон') or fields.get('Phone') or ''
            assert sum(c.isdigit() for c in phone) >= 10
        except Exception:
            return self.reply(400, {'ok': False})
        try:
            if run('SELECT count(*) FROM leads')[0][0] >= MAX_ROWS:
                return self.reply(503, {'ok': False})
            run('INSERT INTO leads(created,form,fields,site) VALUES(?,?,?,?)',
                (int(time.time()), form[:100], json.dumps(fields, ensure_ascii=False), urlparse(origin).netloc))
        except Exception as e:
            print('db', type(e).__name__, flush=True)
            return self.reply(503, {'ok': False})
        wake.set()
        self.reply(200, {'ok': True})

    def stage(self):
        if not self.admin():
            time.sleep(1)
            return self.reply(401, {'ok': False})
        try:
            d = self.body()
            assert isinstance(d['id'], int) and d['stage'] in STAGES
        except Exception:
            return self.reply(400, {'ok': False})
        n = run('UPDATE leads SET stage=? WHERE id=?', (d['stage'], d['id'])).rowcount
        self.reply(200 if n else 404, {'ok': bool(n)})

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    init()
    threading.Thread(target=worker, daemon=True).start()
    ThreadingHTTPServer(('', 8080), H).serve_forever()
