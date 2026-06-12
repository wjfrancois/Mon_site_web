const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../database');
const { uploadFile, deleteFile } = require('../utils/storage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg','.jpeg','.png','.webp'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Format non supporté (.jpg, .png, .webp requis)'), ok);
  }
}).single('image');

// GET /api/admin/gallery
router.get('/', async (req, res) => {
  const photos = await db.prepare('SELECT * FROM gallery WHERE tenant_id = ? ORDER BY position ASC, created_at ASC').all(req.tenantId);
  res.json(photos);
});

// POST /api/admin/gallery
router.post('/', (req, res, next) => {
  upload(req, res, (err) => {
    (async () => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'Format non supporté (.jpg, .png, .webp requis)' });
      const ext = path.extname(req.file.originalname).toLowerCase();
      const filename = `gallery-${Date.now()}${ext}`;
      const storagePath = `tenants/${req.tenant.slug}/gallery/${filename}`;
      const url = await uploadFile(storagePath, req.file.buffer, req.file.mimetype, filename);
      const caption = req.body?.caption || '';
      const result = await db.prepare('INSERT INTO gallery (tenant_id, url, caption) VALUES (?, ?, ?)').run(req.tenantId, url, caption);
      res.json({ id: result.lastInsertRowid, url, caption });
    })().catch(next);
  });
});

// PATCH /api/admin/gallery/:id — update caption
router.patch('/:id', async (req, res) => {
  const { caption } = req.body;
  await db.prepare('UPDATE gallery SET caption = ? WHERE id = ? AND tenant_id = ?').run(caption || '', req.params.id, req.tenantId);
  res.json({ message: 'Légende mise à jour' });
});

// DELETE /api/admin/gallery/:id
router.delete('/:id', async (req, res) => {
  const photo = await db.prepare('SELECT * FROM gallery WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
  if (!photo) return res.status(404).json({ error: 'Photo introuvable' });
  await deleteFile(photo.url);
  await db.prepare('DELETE FROM gallery WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
  res.json({ message: 'Photo supprimée' });
});

module.exports = router;
