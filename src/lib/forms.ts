// Отправка форм: только свой приёмник (deploy/stend/leads.py) → «Заявки» в админке и Telegram. Тильда убрана 25.11.2026 по слову владельца.
import { leadFields } from './attribution';
import { u } from './url';

// Адрес по умолчанию – тот же сервер; для Pages его задаёт сборка.
const LEAD_URL: string = import.meta.env.PUBLIC_LEAD_URL || '/lead';

/** Успех – только подтверждённый ответ приёмника. */
export async function sendForm(formName: string, fields: Record<string, string>): Promise<boolean> {
  const all = Object.fromEntries(Object.entries({ ...fields, ...leadFields() }).filter(([, v]) => v));
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(LEAD_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ form: formName, fields: all }),
    });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Адрес «Спасибо» с учётом подпапки на Pages. */
export const thanksUrl = () => u('/thanks');
