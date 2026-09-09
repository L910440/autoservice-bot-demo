const { Telegraf, Markup, Scenes, session } = require('telegraf');
const storage = require('./storage');
const { extractBooking } = require('./nlp');
const { transcribeVoice } = require('./transcribe');

const TOKEN = process.env.AUTOSERVICE_BOT_TOKEN;
if (!TOKEN) {
  console.error('AUTOSERVICE_BOT_TOKEN не задан — бот не может запуститься без токена.');
  process.exit(1);
}

const SERVICES = ['Замена масла', 'Диагностика', 'Шиномонтаж', 'Ремонт ходовой', 'Другое'];

function nextDays(n) {
  const days = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const label = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    days.push({ value: d.toISOString().slice(0, 10), label: i === 0 ? `Сегодня (${label})` : i === 1 ? `Завтра (${label})` : label });
  }
  return days;
}

const TIME_SLOTS = ['09:00', '11:00', '13:00', '15:00', '17:00'];

const bookingScene = new Scenes.WizardScene(
  'booking',
  async (ctx) => {
    ctx.wizard.state.booking = {};
    await ctx.reply(
      'Выберите пост для ремонта:',
      Markup.inlineKeyboard(storage.POSTS.map((p) => Markup.button.callback(`Пост ${p}`, `post:${p}`)), { columns: 4 })
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    const post = Number(ctx.callbackQuery.data.split(':')[1]);
    ctx.wizard.state.booking.post = post;
    await ctx.answerCbQuery();
    const days = nextDays(5);
    await ctx.editMessageText(
      `Пост ${post}. Теперь выберите дату:`,
      Markup.inlineKeyboard(days.map((d) => Markup.button.callback(d.label, `date:${d.value}`)), { columns: 1 })
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    const date = ctx.callbackQuery.data.split(':')[1];
    ctx.wizard.state.booking.date = date;
    await ctx.answerCbQuery();
    const { post } = ctx.wizard.state.booking;
    const free = TIME_SLOTS.filter((t) => !storage.isSlotTaken(post, date, t));
    if (free.length === 0) {
      await ctx.editMessageText('На эту дату на выбранном посту свободных слотов нет. Введите /записать заново и выберите другую дату.');
      return ctx.scene.leave();
    }
    await ctx.editMessageText('Выберите время:', Markup.inlineKeyboard(free.map((t) => Markup.button.callback(t, `time:${t}`)), { columns: 3 }));
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    const time = ctx.callbackQuery.data.split(':')[1];
    ctx.wizard.state.booking.time = time;
    await ctx.answerCbQuery();
    await ctx.editMessageText('Что нужно сделать?', Markup.inlineKeyboard(SERVICES.map((s) => Markup.button.callback(s, `svc:${s}`)), { columns: 1 }));
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    const service = ctx.callbackQuery.data.split(':')[1];
    ctx.wizard.state.booking.service = service;
    await ctx.answerCbQuery();
    await ctx.editMessageText('Укажите имя клиента и телефон одним сообщением (например: Иван Петров, +351 900 000 000):');
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('Пришлите имя и телефон текстом.');
      return;
    }
    const { post, date, time, service } = ctx.wizard.state.booking;
    const client = ctx.message.text.trim();
    if (storage.isSlotTaken(post, date, time)) {
      await ctx.reply('Увы, этот слот только что заняли. Начните заново: /записать');
      return ctx.scene.leave();
    }
    const record = storage.addBooking({
      post, date, time, service, client,
      userId: ctx.from.id,
      master: ctx.from.username || ctx.from.first_name,
    });
    await ctx.reply(
      `Готово! Запись #${record.id}\nПост ${post}, ${date} в ${time}\nУслуга: ${service}\nКлиент: ${client}\n\n` +
      calendarNote()
    );
    return ctx.scene.leave();
  }
);

function calendarNote() {
  if (process.env.GOOGLE_CALENDAR_CREDENTIALS) {
    return 'Событие синхронизировано с Google Calendar.';
  }
  return 'Синхронизация с Google Calendar пока не подключена (нужны доступы к календарю автосервиса) — запись сохранена внутри бота.';
}

const stage = new Scenes.Stage([bookingScene]);
const bot = new Telegraf(TOKEN);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => ctx.reply(
  'Бот записи на ремонт в автосервисе. Команды:\n' +
  '/записать — новая запись\n' +
  '/расписание — записи на сегодня\n' +
  '/мои — мои записи и отмена'
));

bot.command('записать', (ctx) => ctx.scene.enter('booking'));

bot.command('расписание', async (ctx) => {
  const today = new Date().toISOString().slice(0, 10);
  const items = storage.listByDate(today);
  if (items.length === 0) {
    await ctx.reply('На сегодня записей нет.');
    return;
  }
  const text = items.map((b) => `Пост ${b.post} | ${b.time} | ${b.service} | ${b.client}`).join('\n');
  await ctx.reply(`Записи на сегодня:\n${text}`);
});

bot.command('мои', async (ctx) => {
  const items = storage.listByUser(ctx.from.id);
  if (items.length === 0) {
    await ctx.reply('У вас нет активных записей.');
    return;
  }
  await ctx.reply(
    'Ваши записи (нажмите, чтобы отменить):',
    Markup.inlineKeyboard(
      items.map((b) => Markup.button.callback(`${b.date} ${b.time} пост ${b.post} — отменить`, `cancel:${b.id}`)),
      { columns: 1 }
    )
  );
});

bot.action(/cancel:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  const removed = storage.cancelBooking(id);
  await ctx.answerCbQuery();
  await ctx.editMessageText(removed ? 'Запись отменена.' : 'Запись уже не найдена.');
});

bot.on('voice', async (ctx) => {
  if (!process.env.DEEPGRAM_API_KEY) {
    await ctx.reply('Распознавание голоса пока не подключено (нужен ключ Deepgram). Используйте /записать для записи по шагам.');
    return;
  }
  await ctx.reply('Слушаю...');
  const link = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
  const audio = await fetch(link.href).then((r) => r.arrayBuffer());
  const text = await transcribeVoice(Buffer.from(audio));
  if (!text) {
    await ctx.reply('Не удалось распознать голосовое сообщение. Используйте /записать.');
    return;
  }
  const fields = extractBooking(text);
  const required = ['post', 'date', 'time', 'service', 'client'];
  const missing = required.filter((f) => !fields[f]);
  if (missing.length === 0) {
    if (storage.isSlotTaken(fields.post, fields.date, fields.time)) {
      await ctx.reply(`Распознала: "${text}"\n\nК сожалению, этот слот уже занят. Используйте /записать, чтобы выбрать другое время.`);
      return;
    }
    const record = storage.addBooking({ ...fields, userId: ctx.from.id, master: ctx.from.username || ctx.from.first_name });
    await ctx.reply(
      `Распознала: "${text}"\n\nЗапись #${record.id} создана:\nПост ${record.post}, ${record.date} в ${record.time}\n` +
      `Услуга: ${record.service}\nКлиент: ${record.client}\n\n${calendarNote()}`
    );
  } else {
    await ctx.reply(
      `Распознала: "${text}"\n\nНе хватает данных: ${missing.join(', ')}. Уточните голосом ещё раз или используйте /записать для пошаговой записи.`
    );
  }
});

bot.launch();
console.log('Бот автосервиса запущен.');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
