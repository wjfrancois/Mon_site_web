const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../database');
const { uploadFile, deleteFile } = require('../utils/storage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg','.jpeg','.png','.webp'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Format non supporté. Utilisez JPG, PNG ou WebP.'), ok);
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
  const old = await db.prepare("SELECT value FROM site_settings WHERE key = 'hero_image'").get();
  if (old?.value) await deleteFile(old.value);
  const ext = path.extname(req.file.originalname).toLowerCase();
  const filename = `hero-${Date.now()}${ext}`;
  const url = await uploadFile(`settings/${filename}`, req.file.buffer, req.file.mimetype, filename);
  await db.prepare("INSERT INTO site_settings (key, value) VALUES ('hero_image', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value").run(url);
  res.json({ url, message: 'Image mise à jour' });
});

// DELETE hero image (reset to default)
router.delete('/upload/hero', async (req, res) => {
  const old = await db.prepare("SELECT value FROM site_settings WHERE key = 'hero_image'").get();
  if (old?.value) await deleteFile(old.value);
  await db.prepare("UPDATE site_settings SET value = '' WHERE key = 'hero_image'").run();
  res.json({ message: 'Image réinitialisée' });
});

module.exports = router;
