// scripts/init-db.js
// Lance ce script une seule fois pour initialiser la base de données
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'incoms.db');
const fs = require('fs');

// Créer le dossier data/ si nécessaire
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);

console.log('🔧 Initialisation de la base de données INCOMS...');

// ── Activer les clés étrangères ──
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Création des tables ──
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT    UNIQUE NOT NULL,
    password  TEXT    NOT NULL,
    role      TEXT    CHECK(role IN ('admin','user')) NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stock (
    id         TEXT    PRIMARY KEY,
    ref        TEXT    NOT NULL,
    name       TEXT    NOT NULL,
    category   TEXT    NOT NULL DEFAULT 'Bureautique',
    qty        INTEGER NOT NULL DEFAULT 0,
    price      REAL    NOT NULL DEFAULT 0,
    threshold  INTEGER NOT NULL DEFAULT 5,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS clients (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    phone      TEXT    UNIQUE,
    email      TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT    NOT NULL,
    article    TEXT    NOT NULL,
    qty        INTEGER NOT NULL,
    price      REAL    NOT NULL,
    total      REAL    NOT NULL,
    stock_id   TEXT    REFERENCES stock(id) ON DELETE SET NULL,
    client_id  INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT    NOT NULL,
    motif      TEXT    NOT NULL,
    amount     REAL    NOT NULL,
    category   TEXT    NOT NULL DEFAULT 'Autre',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Index pour accélérer les requêtes par date
  CREATE INDEX IF NOT EXISTS idx_entries_date  ON entries(date);
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
`);

// ── Données initiales : utilisateurs ──
const adminPass  = bcrypt.hashSync('Admin@incoms2025', 10);
const userPass   = bcrypt.hashSync('User@incoms2025', 10);

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)
`);
insertUser.run('admin', adminPass, 'admin');
insertUser.run('employe', userPass, 'user');

// ── Données initiales : stock ──
const stockItems = [
  { id:'s001', ref:'REF-001', name:'Stylo Bic',          category:'Bureautique',       qty:150, price:100,    threshold:10 },
  { id:'s002', ref:'REF-002', name:'Cahier 200p',         category:'Bureautique',       qty:80,  price:500,    threshold:10 },
  { id:'s003', ref:'REF-003', name:'Rame A4',             category:'Bureautique',       qty:30,  price:3500,   threshold:5  },
  { id:'s004', ref:'REF-004', name:'Classeur',            category:'Bureautique',       qty:4,   price:2000,   threshold:5  },
  { id:'s005', ref:'REF-005', name:'Ordinateur Portable', category:'Informatique',      qty:2,   price:350000, threshold:2  },
  { id:'s006', ref:'REF-006', name:'Cartouche Imprimante',category:'Informatique',      qty:1,   price:15000,  threshold:3  },
  { id:'s007', ref:'REF-007', name:'Clé USB 32Go',        category:'Informatique',      qty:12,  price:5000,   threshold:3  },
  { id:'s008', ref:'REF-008', name:'Câble HDMI',          category:'Accessoires divers',qty:6,   price:3000,   threshold:2  },
  { id:'s009', ref:'REF-009', name:'Multiprise',          category:'Accessoires divers',qty:3,   price:8000,   threshold:2  },
];

const insertStock = db.prepare(`
  INSERT OR IGNORE INTO stock (id, ref, name, category, qty, price, threshold)
  VALUES (@id, @ref, @name, @category, @qty, @price, @threshold)
`);
stockItems.forEach(item => insertStock.run(item));

db.close();

console.log('✅ Base de données créée : data/incoms.db');
console.log('');
console.log('┌─────────────────────────────────────────┐');
console.log('│       COMPTES PAR DÉFAUT                │');
console.log('├──────────────┬────────────────┬─────────┤');
console.log('│ Rôle         │ Identifiant    │ MDP     │');
console.log('├──────────────┼────────────────┼─────────┤');
console.log('│ Administrateur│ admin          │ Admin@incoms2025 │');
console.log('│ Employé       │ employe        │ User@incoms2025  │');
console.log('└──────────────┴────────────────┴─────────┘');
console.log('');
console.log('⚠️  Changez ces mots de passe après le premier démarrage !');
