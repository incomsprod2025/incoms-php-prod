// server.js — INCOMS Backend API (Supabase Version)
'use strict';

require('dotenv').config();
const express     = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt      = require('bcrypt');
const jwt         = require('jsonwebtoken');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const rateLimit   = require('express-rate-limit');
const path        = require('path');

// ── Config ──────────────────────────────────────
const PORT          = process.env.PORT || 3000;
const JWT_SECRET    = process.env.JWT_SECRET || 'INCOMS_DEVELOPMENT_SECRET_KEY';
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_KEY;
const NODE_ENV      = process.env.NODE_ENV || 'development';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Configuration Supabase manquante dans le fichier .env');
  process.exit(1);
}

// ── Supabase Client ─────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Express setup ────────────────────────────────
const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(cors({
  origin: NODE_ENV === 'production' ? false : '*',
  methods: ['GET','POST','PUT','DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// Servir le frontend
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));

// ── Rate limiting ────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
});

app.use('/api/auth', authLimiter);
app.use('/api/', apiLimiter);

// ═══════════════════════════════════════════════════
// MIDDLEWARE AUTH
// ═══════════════════════════════════════════════════
function authRequired(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'Token manquant' });
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== 'admin')
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    next();
  });
}

// ═══════════════════════════════════════════════════
// ROUTES — AUTH
// ═══════════════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Champs manquants' });

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .single();

  if (error || !user) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
  if (role && user.role !== role) return res.status(401).json({ error: 'Rôle incorrect pour cet identifiant' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', adminRequired, async (req, res) => {
  const { targetUsername, newPassword } = req.body;
  if (!targetUsername || !newPassword) return res.status(400).json({ error: 'Champs manquants' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });

  const hash = bcrypt.hashSync(newPassword, 10);
  const { error } = await supabase
    .from('users')
    .update({ password: hash, updated_at: new Date().toISOString() })
    .eq('username', targetUsername);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, message: 'Mot de passe mis à jour' });
});

// GET /api/auth/users
app.get('/api/auth/users', adminRequired, async (req, res) => {
  const { data, error } = await supabase.from('users').select('id, username, role, created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ═══════════════════════════════════════════════════
// ROUTES — STOCK
// ═══════════════════════════════════════════════════

// GET /api/stock
app.get('/api/stock', authRequired, async (req, res) => {
  const { category } = req.query;
  let query = supabase.from('stock').select('*');
  if (category) query = query.eq('category', category);
  
  const { data, error } = await query.order('category', { ascending: true }).order('ref', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/stock
app.post('/api/stock', adminRequired, async (req, res) => {
  const { id, ref, name, category, qty, price, threshold } = req.body;
  if (!ref || !name) return res.status(400).json({ error: 'Référence et nom obligatoires' });

  const { data: existing } = await supabase.from('stock').select('id').eq('ref', ref).maybeSingle();
  if (existing && existing.id !== id) return res.status(409).json({ error: 'Cette référence existe déjà' });

  const { error } = await supabase.from('stock').upsert({
    id: id || ('s' + Date.now()),
    ref, name, category: category || 'Bureautique', qty: qty || 0, price: price || 0, threshold: threshold || 5,
    updated_at: new Date().toISOString()
  });

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ success: true });
});

// DELETE /api/stock/:id
app.delete('/api/stock/:id', adminRequired, async (req, res) => {
  const { error } = await supabase.from('stock').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════
// ROUTES — ENTRIES (Sales)
// ═══════════════════════════════════════════════════

// GET /api/entries
app.get('/api/entries', authRequired, async (req, res) => {
  const { date, from, to } = req.query;
  let query = supabase.from('entries').select('*');
  if (date) query = query.eq('date', date);
  else if (from && to) query = query.gte('date', from).lte('date', to);

  const { data, error } = await query.order('date', { ascending: false }).order('created_at', { ascending: false }).limit(500);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/entries (Uses RPC for transaction)
app.post('/api/entries', authRequired, async (req, res) => {
  const { date, article, qty, price, total, stock_id, client_name, client_phone } = req.body;
  if (!date || !article || !qty || !price) return res.status(400).json({ error: 'Champs manquants' });

  const { data, error } = await supabase.rpc('process_sale', {
    p_date: date,
    p_article: article,
    p_qty: qty,
    p_price: price,
    p_total: total || (qty * price),
    p_stock_id: stock_id || null,
    p_client_name: client_name || null,
    p_client_phone: client_phone || null
  });

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ success: true, id: data });
});

// DELETE /api/entries/:id
app.delete('/api/entries/:id', authRequired, async (req, res) => {
  const { error } = await supabase.from('entries').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════
// ROUTES — EXPENSES
// ═══════════════════════════════════════════════════

app.get('/api/expenses', authRequired, async (req, res) => {
  const { date, from, to } = req.query;
  let query = supabase.from('expenses').select('*');
  if (date) query = query.eq('date', date);
  else if (from && to) query = query.gte('date', from).lte('date', to);

  const { data, error } = await query.order('date', { ascending: false }).order('created_at', { ascending: false }).limit(500);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/expenses', authRequired, async (req, res) => {
  const { date, motif, amount, category } = req.body;
  if (!date || !motif || !amount) return res.status(400).json({ error: 'Champs manquants' });

  const { data, error } = await supabase.from('expenses').insert({
    date, motif, amount, category: category || 'Autre'
  }).select('id').single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ success: true, id: data.id });
});

app.delete('/api/expenses/:id', authRequired, async (req, res) => {
  const { error } = await supabase.from('expenses').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════
// ROUTES — BILANS
// ═══════════════════════════════════════════════════

app.get('/api/bilan/daily', adminRequired, async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Paramètre date requis' });

  const { data: entries } = await supabase.from('entries').select('total').eq('date', date);
  const { data: expenses } = await supabase.from('expenses').select('amount').eq('date', date);

  const totalIn  = (entries || []).reduce((s, e) => s + e.total, 0);
  const totalOut = (expenses || []).reduce((s, e) => s + e.amount, 0);

  res.json({ date, totalIn, totalOut, bilan: totalIn - totalOut });
});

app.get('/api/bilan/annual', adminRequired, async (req, res) => {
  const { year } = req.query;
  if (!year) return res.status(400).json({ error: 'year requis' });

  const from = `${year}-01-01`;
  const to   = `${year}-12-31`;

  const { data: entries } = await supabase.from('entries').select('date, total').gte('date', from).lte('date', to);
  const { data: expenses } = await supabase.from('expenses').select('date, amount').gte('date', from).lte('date', to);

  const months = [];
  let grandIn = 0, grandOut = 0;

  for (let m = 1; m <= 12; m++) {
    const monthPrefix = `${year}-${String(m).padStart(2,'0')}`;
    const mEntries = (entries || []).filter(e => e.date.startsWith(monthPrefix));
    const mExpenses = (expenses || []).filter(e => e.date.startsWith(monthPrefix));
    
    const totalIn  = mEntries.reduce((s, e) => s + e.total, 0);
    const totalOut = mExpenses.reduce((s, e) => s + e.amount, 0);
    
    grandIn  += totalIn;
    grandOut += totalOut;
    months.push({ month: m, totalIn, totalOut, bilan: totalIn - totalOut });
  }

  res.json({ year, totalIn: grandIn, totalOut: grandOut, bilan: grandIn-grandOut, months });
});

// ═══════════════════════════════════════════════════
// ROUTES — CLIENTS
// ═══════════════════════════════════════════════════

app.get('/api/clients', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('clients').select('*').order('name', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/clients', authRequired, async (req, res) => {
  const { name, phone, email } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom obligatoire' });

  const { data, error } = await supabase.from('clients').upsert({
    name, phone: phone || null, email: email || null
  }, { onConflict: 'phone' }).select('id').single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, id: data.id });
});

// ═══════════════════════════════════════════════════
// FALLBACK — Frontend SPA
// ═══════════════════════════════════════════════════
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     INCOMS SERVER — v2.0 (Supabase)      ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  ▶  http://localhost:${PORT}`);
  console.log(`  🚀  Connected to SUPABASE`);
  console.log(`  🌍  ENV: ${NODE_ENV}`);
  console.log('');
});

// Graceful shutdown
process.on('SIGINT',  () => { process.exit(0); });
process.on('SIGTERM', () => { process.exit(0); });
