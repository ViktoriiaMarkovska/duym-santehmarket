// Приймає заявку з сайту і надсилає її у Telegram.
// Токен і chat_id читаються зі змінних оточення Vercel — у коді сторінки їх немає,
// тому їх не видно у вихідному коді сайту.
//   TELEGRAM_BOT_TOKEN — токен від @BotFather
//   TELEGRAM_CHAT_ID   — id чату, куди слати заявки

const MAX = 1000;

function clean(v) {
  return String(v == null ? '' : v).slice(0, MAX).trim();
}

function esc(v) {
  return clean(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function validPhone(v) {
  const d = clean(v).replace(/\D/g, '');
  return /^380\d{9}$/.test(d) || /^0\d{9}$/.test(d);
}

function buildMessage(b) {
  const isEstimate = b.type === 'estimate';
  const lines = [];
  lines.push(isEstimate ? '<b>Запит на кошторис</b>' : '<b>Нова заявка з сайту</b>');
  lines.push('');
  if (isEstimate) {
    if (b.object) lines.push('Обʼєкт: <b>' + esc(b.object) + '</b>');
    const cats = Array.isArray(b.categories) ? b.categories.map(esc).join(', ') : '';
    if (cats) lines.push('Напрями: ' + cats);
    if (clean(b.budget)) lines.push('Бюджет: <b>' + esc(b.budget) + '</b>');
  } else if (b.subject) {
    lines.push('Тема: <b>' + esc(b.subject) + '</b>');
  }
  lines.push('Імʼя: <b>' + esc(b.name) + '</b>');
  lines.push('Телефон: <b>' + esc(b.phone) + '</b>');
  if (b.showroom) lines.push('Локація: ' + esc(b.showroom));
  if (b.note) lines.push('', 'Коментар: ' + esc(b.note));
  lines.push('', '<i>' + new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }) + '</i>');
  return lines.join('\n');
}

module.exports = async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // Відкриття цієї адреси у браузері показує стан налаштування.
  // Самі значення не виводяться — лише чи вони задані.
  if (req.method === 'GET') {
    const hasToken = Boolean(token);
    const hasChat = Boolean(chatId);
    const ready = hasToken && hasChat;
    const missing = [];
    if (!hasToken) missing.push('TELEGRAM_BOT_TOKEN');
    if (!hasChat) missing.push('TELEGRAM_CHAT_ID');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Перевірка Telegram</title>' +
      '<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F4F1EC;color:#21262A;' +
      'display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}' +
      '.c{background:#fff;border:1px solid #CBC0B0;border-radius:16px;padding:32px;max-width:520px;' +
      'box-shadow:0 1px 2px rgba(33,38,42,.08)}h1{font-size:22px;margin:0 0 12px}' +
      'p{line-height:1.6;margin:0 0 10px}code{background:#F4F1EC;padding:2px 6px;border-radius:4px;font-size:14px}' +
      '.ok{color:#4B7B4A}.bad{color:#A23E32}</style>' +
      '<div class="c">' +
      (ready
        ? '<h1 class="ok">Готово — заявки підуть у Telegram</h1>' +
          '<p>Обидві змінні задані. Можна тестувати форму на сайті.</p>' +
          '<p>Якщо заявка все одно не приходить — переконайтеся, що ви натиснули <b>Start</b> у своєму боті: ' +
          'без цього Telegram не дозволяє боту писати вам першим.</p>'
        : '<h1 class="bad">Ще не налаштовано</h1>' +
          '<p>Бракує: ' + missing.map(function (m) { return '<code>' + m + '</code>'; }).join(', ') + '</p>' +
          '<p>Додайте у Vercel → Settings → Environment Variables, потім перезапустіть деплой.</p>') +
      '<p style="color:#877962;font-size:13px;margin-top:18px">Значення змінних тут не показуються.</p>' +
      '</div>'
    );
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  if (!token || !chatId) {
    return res.status(503).json({ ok: false, error: 'not_configured' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'bad_request' });
  }
  if (body.company) {
    // пастка для ботів: поле приховане, люди його не заповнюють
    return res.status(200).json({ ok: true });
  }
  if (!clean(body.name) || !validPhone(body.phone)) {
    return res.status(400).json({ ok: false, error: 'validation' });
  }

  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildMessage(body),
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error('telegram error', r.status, detail.slice(0, 300));
      return res.status(502).json({ ok: false, error: 'telegram_failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('lead handler failed', e && e.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
