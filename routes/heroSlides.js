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
    cb(ok ? null : new Error('Format non supporté'), ok);
  }
});

// GET /api/admin/hero-slides
router.get('/', async (req, res) => {
  const slides = await db.prepare('SELECT * FROM hero_slides WHERE tenant_id = ? ORDER BY position ASC, created_at ASC').all(req.tenantId);
  res.json(slides);
});

// POST /api/admin/hero-slides
router.post('/', upload.single('image'), (req, res) => {
  (async () => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    const filename = `slide-${Date.now()}${ext}`;
    const url = await uploadFile(`tenants/${req.tenantId}/slides/${filename}`, req.file.buffer, req.file.mimetype, filename);
    const r = await db.prepare('INSERT INTO hero_slides (tenant_id, url) VALUES (?, ?)').run(req.tenantId, url);
    res.json({ id: r.lastInsertRowid, url });
  })().catch(e => res.status(500).json({ error: e.message }));
});

// DELETE /api/admin/hero-slides/:id
router.delete('/:id', async (req, res) => {
  const slide = await db.prepare('SELECT * FROM hero_slides WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
  if (!slide) return res.status(404).json({ error: 'Slide introuvable' });
  await deleteFile(slide.url);
  await db.prepare('DELETE FROM hero_slides WHERE id = ?').run(req.params.id);
  res.json({ message: 'Supprimé' });
});

module.exports = router;
