# 📘 INCOMS v2.0 — Guide de Déploiement Complet

---

## 📁 Structure du Projet

```
incoms-prod/
├── backend/
│   ├── server.js              ← Serveur API Node.js/Express
│   ├── package.json           ← Dépendances Node
│   ├── ecosystem.config.js    ← Config PM2 (gestionnaire de processus)
│   ├── .env.example           ← Modèle de configuration
│   ├── data/
│   │   └── incoms.db          ← Base de données SQLite (créée automatiquement)
│   └── scripts/
│       ├── init-db.js         ← Initialisation de la BDD
│       └── backup.sh          ← Script de sauvegarde automatique
├── frontend/
│   └── public/
│       └── index.html         ← Application web complète
├── nginx/
│   └── incoms.conf            ← Config Nginx (reverse proxy + SSL)
└── GUIDE-DEPLOIEMENT.md       ← Ce fichier
```

---

## 🗄️ Architecture de la Base de Données

L'application utilise **SQLite** via la bibliothèque `better-sqlite3`.

### Pourquoi SQLite ?
- ✅ Aucun serveur de base de données à installer
- ✅ Fichier unique facilement sauvegardable
- ✅ Performances excellentes pour une PME (<10 utilisateurs simultanés)
- ✅ Zéro configuration supplémentaire

### Schéma des tables

```
┌─────────────────────────────────────────────────────────┐
│ TABLE users                                             │
│  id · username · password (hash bcrypt) · role         │
├─────────────────────────────────────────────────────────┤
│ TABLE stock                                             │
│  id · ref · name · category · qty · price · threshold  │
├─────────────────────────────────────────────────────────┤
│ TABLE entries  (ventes)                                 │
│  id · date · article · qty · price · total · stock_id  │
├─────────────────────────────────────────────────────────┤
│ TABLE expenses  (dépenses)                              │
│  id · date · motif · amount · category                  │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 OPTION A — Déploiement Local / Réseau Interne

> Idéal pour tester ou utiliser sur un seul bureau ou réseau local.

### Prérequis
- **Node.js 18+** → https://nodejs.org (télécharger la version LTS)

### Étapes

```bash
# 1. Se placer dans le dossier backend
cd incoms-prod/backend

# 2. Installer les dépendances
npm install

# 3. Créer le fichier de configuration
cp .env.example .env
# Ouvrir .env et modifier JWT_SECRET avec une valeur aléatoire forte

# 4. Initialiser la base de données
node scripts/init-db.js

# 5. Lancer le serveur
npm start
```

L'application est accessible sur : **http://localhost:3000**

Pour accès depuis d'autres appareils sur le même réseau :
**http://[IP-de-votre-ordinateur]:3000**

(Pour trouver votre IP : `ipconfig` sous Windows, `ifconfig` sous Linux/Mac)

---

## 🌐 OPTION B — Déploiement sur VPS (Production Internet)

> Recommandé pour un accès depuis n'importe où, multi-utilisateurs.

### Fournisseurs VPS recommandés

| Fournisseur | Prix/mois | Lien |
|---|---|---|
| OVHcloud (France) | ~3,50 € | ovhcloud.com |
| Hetzner (Allemagne) | ~4 € | hetzner.com |
| Contabo | ~5 € | contabo.com |
| DigitalOcean | ~6 $ | digitalocean.com |

**Configuration minimale recommandée :** 1 vCPU · 2 Go RAM · 20 Go SSD · Ubuntu 22.04

---

### ÉTAPE 1 — Connexion au VPS

```bash
# Depuis votre ordinateur
ssh root@VOTRE_IP_VPS
```

---

### ÉTAPE 2 — Préparation du serveur

```bash
# Mettre à jour le système
apt update && apt upgrade -y

# Installer les outils nécessaires
apt install -y curl git sqlite3 ufw

# Configurer le pare-feu
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

---

### ÉTAPE 3 — Installer Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Vérifier l'installation
node --version   # doit afficher v20.x.x
npm --version
```

---

### ÉTAPE 4 — Installer PM2 (gestionnaire de processus)

```bash
npm install -g pm2

# Configurer PM2 pour démarrer au boot du serveur
pm2 startup systemd
# Copier et exécuter la commande affichée
```

---

### ÉTAPE 5 — Uploader les fichiers sur le VPS

**Depuis votre ordinateur :**

```bash
# Copier le projet sur le VPS
scp -r incoms-prod/ root@VOTRE_IP_VPS:/var/www/incoms

# OU utiliser Git si vous avez un dépôt :
# git clone https://github.com/votre-compte/incoms /var/www/incoms
```

---

### ÉTAPE 6 — Configurer et initialiser l'application

```bash
# Sur le VPS
cd /var/www/incoms/backend

# Installer les dépendances
npm install --production

# Créer le fichier .env
cp .env.example .env
nano .env
```

**Contenu du fichier .env à modifier :**
```env
PORT=3000
NODE_ENV=production
JWT_SECRET=COLLEZ_ICI_UN_SECRET_TRES_LONG_ET_ALEATOIRE
DB_PATH=/var/www/incoms/backend/data/incoms.db
```

**Générer un secret JWT fort :**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Copiez la chaîne affichée dans JWT_SECRET
```

```bash
# Initialiser la base de données
node scripts/init-db.js

# Rendre le script de backup exécutable
chmod +x scripts/backup.sh
```

---

### ÉTAPE 7 — Lancer l'application avec PM2

```bash
cd /var/www/incoms/backend

# Lancer avec PM2
pm2 start ecosystem.config.js --env production

# Sauvegarder la liste des processus PM2
pm2 save

# Vérifier que ça tourne
pm2 status
pm2 logs incoms
```

---

### ÉTAPE 8 — Installer et configurer Nginx

```bash
apt install nginx -y

# Copier la config Nginx
cp /var/www/incoms/nginx/incoms.conf /etc/nginx/sites-available/incoms

# Modifier le nom de domaine
nano /etc/nginx/sites-available/incoms
# Remplacez "votre-domaine.com" par votre vrai domaine ou votre IP
```

**Si vous utilisez une IP (sans domaine), modifiez le fichier ainsi :**
```nginx
server {
    listen 80;
    server_name VOTRE_IP_VPS;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# Activer le site
ln -s /etc/nginx/sites-available/incoms /etc/nginx/sites-enabled/
nginx -t          # vérifier la config
systemctl reload nginx
systemctl enable nginx
```

L'application est maintenant accessible sur **http://VOTRE_IP_VPS**

---

### ÉTAPE 9 — HTTPS avec Let's Encrypt (si vous avez un domaine)

```bash
# Installer Certbot
apt install certbot python3-certbot-nginx -y

# Obtenir le certificat SSL (remplacez le domaine)
certbot --nginx -d votre-domaine.com -d www.votre-domaine.com

# Renouvellement automatique (vérifié 2x/jour)
systemctl enable certbot.timer
```

L'application est accessible sur **https://votre-domaine.com** 🔒

---

### ÉTAPE 10 — Configurer la sauvegarde automatique

```bash
# Créer le dossier de sauvegardes
mkdir -p /var/backups/incoms

# Éditer le crontab
crontab -e
```

**Ajouter cette ligne pour une sauvegarde quotidienne à 2h du matin :**
```
0 2 * * * /var/www/incoms/backend/scripts/backup.sh >> /var/log/incoms-backup.log 2>&1
```

---

## 🔑 Comptes par défaut

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Administrateur | `admin` | `Admin@incoms2025` |
| Employé | `employe` | `User@incoms2025` |

> ⚠️ **CHANGEZ CES MOTS DE PASSE IMMÉDIATEMENT** après la première connexion !
> Allez dans ⚙ **Paramètres** (visible uniquement pour l'administrateur).

---

## 🔧 Commandes de Maintenance

```bash
# Voir les logs en temps réel
pm2 logs incoms

# Redémarrer l'application
pm2 restart incoms

# Arrêter / démarrer
pm2 stop incoms
pm2 start incoms

# Voir le statut
pm2 status

# Mettre à jour les fichiers et redémarrer
cd /var/www/incoms/backend
git pull          # si vous utilisez git
npm install       # si de nouvelles dépendances
pm2 restart incoms

# Sauvegarde manuelle
/var/www/incoms/backend/scripts/backup.sh

# Restaurer une sauvegarde
gunzip /var/backups/incoms/incoms_20250415_020000.db.gz
cp /var/backups/incoms/incoms_20250415_020000.db /var/www/incoms/backend/data/incoms.db
pm2 restart incoms
```

---

## 🛡️ Checklist Sécurité Production

- [ ] Changer les mots de passe par défaut depuis ⚙ Paramètres
- [ ] Modifier `JWT_SECRET` dans `.env` avec une valeur forte et aléatoire
- [ ] Activer HTTPS (Let's Encrypt) si vous avez un domaine
- [ ] Activer le pare-feu (`ufw enable`)
- [ ] Configurer la sauvegarde automatique (crontab)
- [ ] Ne jamais exposer le port 3000 directement (utiliser Nginx)
- [ ] Restreindre l'accès SSH par clé au lieu de mot de passe

---

## ❓ Résolution de problèmes

### L'application ne démarre pas
```bash
pm2 logs incoms --lines 50
node scripts/init-db.js   # recréer la BDD si nécessaire
```

### Erreur "Cannot find module"
```bash
cd /var/www/incoms/backend && npm install
```

### Nginx retourne une erreur 502
```bash
pm2 status              # vérifier que l'app tourne
systemctl status nginx  # vérifier Nginx
nginx -t               # vérifier la config
```

### Réinitialiser la base de données
```bash
rm /var/www/incoms/backend/data/incoms.db
node /var/www/incoms/backend/scripts/init-db.js
pm2 restart incoms
```

---

*INCOMS — Système de Gestion Comptable & Stock | Version 2.0 Production*
*Développé pour INCOMS — Architecture : Node.js + Express + SQLite + Nginx*
