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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
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
