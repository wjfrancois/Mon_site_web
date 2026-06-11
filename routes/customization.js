const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');

function getUploadDir(tenantSlug) {
  const dir = path.join(__dirname, '..', 'public', 'img', 'tenants', tenantSlug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeStorage(fieldName) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, getUploadDir(req.tenant.slug)),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${fieldName}-${Date.now()}${ext}`);
    }
  });
}

// GET /api/admin/customization
router.get('/', (req, res) => {
  const t = req.tenant;
  res.json({
    logo_url: t.logo_url, banner_url: t.banner_url, hero_photo_url: t.hero_photo_url,
    primary_color: t.primary_color || '#e2b04a',
    hero_title: t.hero_title, hero_subtitle: t.hero_subtitle, hero_tag: t.hero_tag,
    name: t.name, phone: t.phone, address: t.address, email: t.email,
    public_url: `${process.env.APP_URL || 'http://localhost:3000'}/book/${t.slug}`
  });
});

// PUT /api/admin/customization (textes, couleur, infos salon)
router.put('/', (req, res) => {
  const { primary_color, hero_title, hero_subtitle, hero_tag, name, phone, address } = req.body;
  db.prepare('UPDATE tenants SET primary_color=?, hero_title=?, hero_subtitle=?, hero_tag=?, name=?, phone=?, address=? WHERE id=?')
    .run(primary_color, hero_title, hero_subtitle, hero_tag, name, phone, address, req.tenantId);
  res.json({ message: 'Personnalisation mise à jour' });
});

// Upload helpers
function uploadField(field) {
  const storage = makeStorage(field);
  const upload = multer({
    storage,
    limits: { fileSize: 5*1024*1024 },
    fileFilter: (req, file, cb) => {
      const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
      cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
    }
  }).single('image');

  const handler = (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
    // Supprimer l'ancienne image
    const old = req.tenant[`${field}_url`];
    if (old) {
      const p = path.join(__dirname, '..', 'public', old);
      if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch(e) {}
    }
    const url = `/img/tenants/${req.tenant.slug}/${req.file.filename}`;
    db.prepare(`UPDATE tenants SET ${field}_url = ? WHERE id = ?`).run(url, req.tenantId);
    res.json({ url });
  };

  return [upload, handler];
}

function deleteField(field) {
  return (req, res) => {
    const old = req.tenant[`${field}_url`];
    if (old) {
      const p = path.join(__dirname, '..', 'public', old);
      if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch(e) {}
    }
    db.prepare(`UPDATE tenants SET ${field}_url = NULL WHERE id = ?`).run(req.tenantId);
    res.json({ message: 'Image supprimée' });
  };
}

router.post('/logo', ...uploadField('logo'));
router.delete('/logo', deleteField('logo'));
router.post('/banner', ...uploadField('banner'));
router.delete('/banner', deleteField('banner'));
router.post('/hero-photo', ...uploadField('hero_photo'));
router.delete('/hero-photo', deleteField('hero_photo'));

module.exports = router;
