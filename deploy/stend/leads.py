"""Приёмник заявок «Цветы без повода»: POST /lead -> файл в очереди -> Telegram через посредника (TG_API).
Только стандартная библиотека. Доставленная заявка с диска удаляется, недоставленная ждёт и повторяется.
В журнал не пишутся ни данные клиентов, ни токен. Нет TELEGRAM_CHAT_IDS – заявки копятся в очереди."""
import json, os, threading, time, urllib.error, urllib.request, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

Q = Path(os.environ.get('QUEUE_DIR', '/data'))
TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
CHATS = [c for c in os.environ.get('TELEGRAM_CHAT_IDS', '').replace(',', ' ').split() if c]
API = os.environ.get('TG_API', 'https://api.telegram.org').rstrip('/')
MAX_BODY, MAX_QUEUE = 32_768, 2000
HIDE = {'Согласие', 'Agree'}
NAMES = {'Name': 'Имя', 'Phone': 'Телефон', 'Input': 'Дата доставки', 'Input_2': 'Количество заказов',
         'Input_3': 'Количество адресов', 'Input_4': 'Компания', 'Input_5': 'Что заказать', 'Input_6': 'Комментарий'}
wake = threading.Event()


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


def save(path, data):
    tmp = path.with_suffix('.tmp')
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    tmp.replace(path)


def deliver(path):
    """Отметки done хранятся по чату и части: повтор не дублирует уже ушедшее."""
    lead = json.loads(path.read_text(encoding='utf-8'))
    done = set(lead.get('done', []))
    good, wait = True, 0
    for chat in CHATS:
        for i, part in enumerate(parts_of(text_of(lead))):
            key = f'{chat}#{i}'
            if key in done:
                continue
            ok, w = send(chat, part)
            wait = max(wait, w)
            if not ok:
                good = False
                break
            done.add(key)
            lead['done'] = sorted(done)
            save(path, lead)
    if good:
        path.unlink()
        print('delivered', path.stem, flush=True)
    return good, wait


def worker():
    while True:
        pause = 60
        if TOKEN and CHATS:
            for p in sorted(Q.glob('*.json')):
                try:
                    ok, wait = deliver(p)
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
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        self.reply(404, {'ok': False})

    def do_POST(self):
        host = self.headers.get('Host', '')
        if self.path != '/lead':
            return self.reply(404, {'ok': False})
        if urlparse(self.headers.get('Origin', '')).netloc != host or not host:
            return self.reply(403, {'ok': False})
        try:
            n = int(self.headers.get('Content-Length', '0'))
            if not 0 < n <= MAX_BODY:
                return self.reply(413, {'ok': False})
            d = json.loads(self.rfile.read(n))
            form, raw = d['form'], d['fields']
            assert isinstance(form, str) and isinstance(raw, dict) and 0 < len(raw) <= 60
            assert all(isinstance(v, str) for v in raw.values())
            fields = {k[:60]: v[:4000] for k, v in raw.items()}
            phone = fields.get('Телефон') or fields.get('Phone') or ''
            assert sum(c.isdigit() for c in phone) >= 10
        except Exception:
            return self.reply(400, {'ok': False})
        if sum(1 for _ in Q.glob('*.json')) >= MAX_QUEUE:
            return self.reply(503, {'ok': False})
        try:
            save(Q / f'{int(time.time())}-{uuid.uuid4().hex[:8]}.json', {'form': form[:100], 'fields': fields, 'site': host})
        except OSError:
            return self.reply(503, {'ok': False})
        wake.set()
        self.reply(200, {'ok': True})

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    threading.Thread(target=worker, daemon=True).start()
    ThreadingHTTPServer(('', 8080), H).serve_forever()
