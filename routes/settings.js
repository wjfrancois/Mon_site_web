const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');

const uploadDir = path.join(__dirname, '..', 'public', 'img', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `hero-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Format non supporté. Utilisez JPG, PNG ou WebP.'));
  }
});

// GET all settings
router.get('/', async (req, res) => {
  const rows = await db.prepare('SELECT key, value FROM site_settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

// PUT update a setting
router.put('/:key', async (req, res) => {
  const { value } = req.body;
  await db.prepare("INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, NOW()::text) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at").run(req.params.key, value);
  res.json({ message: 'Paramètre mis à jour' });
});

// POST upload hero image
router.post('/upload/hero', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

  // Delete old hero image if it was uploaded
  const old = await db.prepare('SELECT value FROM site_settings WHERE key = ?').get('hero_image');
  if (old?.value && old.value.startsWith('/img/uploads/')) {
    const oldPath = path.join(__dirname, '..', 'public', old.value);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const imageUrl = `/img/uploads/${req.file.filename}`;
  await db.prepare("INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value").run('hero_image', imageUrl);
  res.json({ url: imageUrl, message: 'Image mise à jour' });
});

// DELETE hero image (reset to default)
router.delete('/upload/hero', async (req, res) => {
  const old = await db.prepare('SELECT value FROM site_settings WHERE key = ?').get('hero_image');
  if (old?.value && old.value.startsWith('/img/uploads/')) {
    const oldPath = path.join(__dirname, '..', 'public', old.value);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  await db.prepare("UPDATE site_settings SET value = ? WHERE key = ?").run('', 'hero_image');
  res.json({ message: 'Image réinitialisée' });
});

module.exports = router;
