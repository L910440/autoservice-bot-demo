const SERVICES = ['Замена масла', 'Диагностика', 'Шиномонтаж', 'Ремонт ходовой'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

function nextWeekdayDate(name) {
  const idx = WEEKDAYS.indexOf(name);
  if (idx === -1) return null;
  const today = new Date();
  const diff = (idx - today.getDay() + 7) % 7 || 7;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function extractBooking(text) {
  const lower = text.toLowerCase();
  const result = {};

  const postMatch = lower.match(/пост\s*(\d)/);
  if (postMatch) result.post = Number(postMatch[1]);

  if (lower.includes('сегодня')) {
    result.date = new Date().toISOString().slice(0, 10);
  } else if (lower.includes('завтра')) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    result.date = d.toISOString().slice(0, 10);
  } else {
    for (const day of WEEKDAYS) {
      if (lower.includes(day)) {
        result.date = nextWeekdayDate(day);
        break;
      }
    }
  }

  const explicitTime = lower.match(/(?:^|[\s,])в\s*(\d{1,2})(?::(\d{2}))?(?!\d)/);
  if (explicitTime) {
    const h = explicitTime[1].padStart(2, '0');
    const m = explicitTime[2] || '00';
    result.time = `${h}:${m}`;
  }

  for (const svc of SERVICES) {
    if (lower.includes(svc.toLowerCase())) {
      result.service = svc;
      break;
    }
  }
  if (!result.service) {
    if (lower.includes('масл')) result.service = 'Замена масла';
    else if (lower.includes('диагностик')) result.service = 'Диагностика';
    else if (lower.includes('шин') || lower.includes('колес')) result.service = 'Шиномонтаж';
    else if (lower.includes('ходов')) result.service = 'Ремонт ходовой';
  }

  const nameMatch = text.match(/(?:клиент|для|запиши)\s+([А-ЯЁ][а-яё]+(?:\s[А-ЯЁ][а-яё]+)?)/);
  if (nameMatch) result.client = nameMatch[1];

  const phoneMatch = text.match(/(\+?\d[\d\s\-()]{7,}\d)/);
  if (phoneMatch) result.client = (result.client ? result.client + ', ' : '') + phoneMatch[1].trim();

  return result;
}

module.exports = { extractBooking, SERVICES };
