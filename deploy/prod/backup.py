"""Ежедневная копия базы заявок, хранится 30 дней."""
import os, sqlite3, time
from pathlib import Path
os.umask(0o077)
D = Path('/opt/cvety/backups'); D.mkdir(exist_ok=True)
s = sqlite3.connect('file:/opt/cvety/leads-data/leads.db?mode=ro', uri=True)
t = sqlite3.connect(D / time.strftime('leads-%Y%m%d.db'))
s.backup(t); t.close()
for f in D.glob('leads-*.db'):
    if time.time() - f.stat().st_mtime > 30 * 86400:
        f.unlink()
