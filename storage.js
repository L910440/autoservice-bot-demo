const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bookings.json');
const POSTS = [1, 2, 3, 4];

function load() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function save(bookings) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(bookings, null, 2));
}

function addBooking(booking) {
  const bookings = load();
  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createdAt: new Date().toISOString(),
    ...booking,
  };
  bookings.push(record);
  save(bookings);
  return record;
}

function listByDate(date) {
  return load().filter((b) => b.date === date).sort((a, b) => a.post - b.post || a.time.localeCompare(b.time));
}

function listByUser(userId) {
  return load().filter((b) => b.userId === userId);
}

function cancelBooking(id) {
  const bookings = load();
  const idx = bookings.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  const [removed] = bookings.splice(idx, 1);
  save(bookings);
  return removed;
}

function isSlotTaken(post, date, time) {
  return load().some((b) => b.post === post && b.date === date && b.time === time);
}

module.exports = { POSTS, addBooking, listByDate, listByUser, cancelBooking, isSlotTaken, load };
