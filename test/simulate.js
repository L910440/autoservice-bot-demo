const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dataFile = path.join(__dirname, '..', 'data', 'bookings.json');
if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);

const storage = require('../storage');

const b1 = storage.addBooking({ post: 2, date: '2026-09-10', time: '11:00', service: 'Замена масла', client: 'Иван Петров', userId: 111, master: 'master1' });
assert.strictEqual(storage.isSlotTaken(2, '2026-09-10', '11:00'), true, 'слот должен быть занят после записи');
assert.strictEqual(storage.isSlotTaken(2, '2026-09-10', '13:00'), false, 'другой слот должен быть свободен');

storage.addBooking({ post: 1, date: '2026-09-10', time: '09:00', service: 'Диагностика', client: 'Анна', userId: 222, master: 'master2' });

const today = storage.listByDate('2026-09-10');
assert.strictEqual(today.length, 2, 'на дату должно быть 2 записи');
assert.strictEqual(today[0].post, 1, 'сортировка по посту: пост 1 раньше поста 2');

const mine = storage.listByUser(111);
assert.strictEqual(mine.length, 1, 'у пользователя 111 должна быть 1 запись');

const removed = storage.cancelBooking(b1.id);
assert.ok(removed, 'запись должна быть найдена и удалена');
assert.strictEqual(storage.isSlotTaken(2, '2026-09-10', '11:00'), false, 'слот должен освободиться после отмены');

fs.unlinkSync(dataFile);
console.log('OK: все проверки storage.js прошли успешно');
