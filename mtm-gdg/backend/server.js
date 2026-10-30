const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: +(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'gdg',
  password: process.env.DB_PASSWORD || 'gdgpass',
  database: process.env.DB_NAME || 'gdgevents',
});
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme';

const admin = (req, res, next) =>
  req.get('x-admin-token') === ADMIN_TOKEN ? next() : res.status(401).json({ error: 'Wrong admin token.' });

async function initDb(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS events (
          id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '',
          venue TEXT DEFAULT '', starts_at TIMESTAMPTZ NOT NULL, capacity INT DEFAULT 100,
          created_at TIMESTAMPTZ DEFAULT now());
        CREATE TABLE IF NOT EXISTS registrations (
          id SERIAL PRIMARY KEY, event_id INT REFERENCES events(id) ON DELETE CASCADE,
          name TEXT NOT NULL, email TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(),
          UNIQUE(event_id, email));`);
      const { rows } = await pool.query('SELECT COUNT(*) FROM events');
      if (+rows[0].count === 0) {
        await pool.query(
          `INSERT INTO events (title, description, venue, starts_at, capacity) VALUES
           ('MTM GDG Kickoff', 'Meet the community, see what is planned this season and pick a track to join.', 'Main Auditorium', now() + interval '14 days', 150),
           ('Cloud Study Jam', 'Hands-on session: containers, Kubernetes and CI/CD with Jenkins.', 'Lab 3', now() + interval '28 days', 60)`);
      }
      console.log('Database ready');
      return;
    } catch (e) {
      console.log(`Waiting for database (${i + 1}/${retries}): ${e.message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  process.exit(1);
}

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.get('/api/events', async (_, res) => {
  const { rows } = await pool.query(`
    SELECT e.*, (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id)::int AS registered
    FROM events e ORDER BY starts_at`);
  res.json(rows);
});

app.post('/api/events', admin, async (req, res) => {
  const { title, description, venue, starts_at, capacity } = req.body;
  if (!title || !starts_at) return res.status(400).json({ error: 'Title and date are required.' });
  const { rows } = await pool.query(
    'INSERT INTO events (title, description, venue, starts_at, capacity) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [title, description || '', venue || '', starts_at, capacity || 100]);
  res.status(201).json(rows[0]);
});

app.delete('/api/events/:id', admin, async (req, res) => {
  await pool.query('DELETE FROM events WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/events/:id/register', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '')) return res.status(400).json({ error: 'Enter your name and a valid email.' });
  const ev = await pool.query(
    `SELECT capacity, (SELECT COUNT(*) FROM registrations WHERE event_id=$1)::int AS n FROM events WHERE id=$1`, [req.params.id]);
  if (!ev.rows.length) return res.status(404).json({ error: 'Event not found.' });
  if (ev.rows[0].n >= ev.rows[0].capacity) return res.status(409).json({ error: 'This event is full.' });
  try {
    await pool.query('INSERT INTO registrations (event_id, name, email) VALUES ($1,$2,$3)', [req.params.id, name, email.toLowerCase()]);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(409).json({ error: 'This email is already registered for the event.' });
  }
});

app.get('/api/events/:id/registrations', admin, async (req, res) => {
  const { rows } = await pool.query('SELECT name, email, created_at FROM registrations WHERE event_id=$1 ORDER BY created_at', [req.params.id]);
  res.json(rows);
});

initDb().then(() => app.listen(3000, () => console.log('API on :3000')));
