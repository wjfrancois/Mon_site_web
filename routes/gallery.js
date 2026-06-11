const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');

function getUploadDir(tenantSlug) {
  const dir = path.join(__dirname, '..', 'public', 'img', 'tenants', tenantSlug, 'gallery');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, getUploadDir(req.tenant.slug)),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `gallery-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  }
}).single('image');

// GET /api/admin/gallery
router.get('/', (req, res) => {
  const photos = db.prepare('SELECT * FROM gallery WHERE tenant_id = ? ORDER BY position ASC, created_at ASC').all(req.tenantId);
  res.json(photos);
});

// POST /api/admin/gallery
router.post('/', (req, res, next) => {
  upload(req, res, (err) => {
    try {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'Format non supporté ou fichier manquant (.jpg, .png, .webp)' });
      const url = `/img/tenants/${req.tenant.slug}/gallery/${req.file.filename}`;
      const caption = (req.body && req.body.caption) ? req.body.caption : '';
      const result = db.prepare('INSERT INTO gallery (tenant_id, url, caption) VALUES (?, ?, ?)').run(req.tenantId, url, caption);
      res.json({ id: result.lastInsertRowid, url, caption });
    } catch (e) {
      console.error('[Gallery POST]', e.message);
      next(e);
    }
  });
});

// PATCH /api/admin/gallery/:id — update caption
router.patch('/:id', (req, res) => {
  const { caption } = req.body;
  db.prepare('UPDATE gallery SET caption = ? WHERE id = ? AND tenant_id = ?').run(caption || '', req.params.id, req.tenantId);
  res.json({ message: 'Légende mise à jour' });
});

// DELETE /api/admin/gallery/:id
router.delete('/:id', (req, res) => {
  const photo = db.prepare('SELECT * FROM gallery WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
  if (!photo) return res.status(404).json({ error: 'Photo introuvable' });
  const filePath = path.join(__dirname, '..', 'public', photo.url);
  if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch (e) {}
  db.prepare('DELETE FROM gallery WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
  res.json({ message: 'Photo supprimée' });
});

module.exports = router;
