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

// GET /api/admin/customization
router.get('/', (req, res) => {
  const t = req.tenant;
  res.json({
    logo_url: t.logo_url, banner_url: t.banner_url, hero_photo_url: t.hero_photo_url,
    primary_color: t.primary_color || '#e2b04a',
    hero_title: t.hero_title, hero_subtitle: t.hero_subtitle, hero_tag: t.hero_tag,
    name: t.name, phone: t.phone, address: t.address, email: t.email,
    instagram_url: t.instagram_url, facebook_url: t.facebook_url, tiktok_url: t.tiktok_url,
    about_text: t.about_text, products_text: t.products_text,
    public_url: `${process.env.APP_URL || 'http://localhost:3000'}/book/${t.slug}`
  });
});

// PUT /api/admin/customization
router.put('/', async (req, res) => {
  const allowed = ['primary_color','hero_title','hero_subtitle','hero_tag','name','phone','address','instagram_url','facebook_url','tiktok_url','about_text','products_text'];
  const toUpdate = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) toUpdate[k] = req.body[k]; });
  if (!Object.keys(toUpdate).length) return res.json({ message: 'Rien à mettre à jour' });
  const sets = Object.keys(toUpdate).map(k => `${k} = ?`).join(', ');
  await db.prepare(`UPDATE tenants SET ${sets} WHERE id = ?`).run(...Object.values(toUpdate), req.tenantId);
  res.json({ message: 'Personnalisation mise à jour' });
});

function uploadField(field) {
  return (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      (async () => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
        const ext = path.extname(req.file.originalname).toLowerCase();
        const filename = `${field}-${Date.now()}${ext}`;
        const storagePath = `tenants/${req.tenant.slug}/${filename}`;
        const old = req.tenant[`${field}_url`];
        if (old) await deleteFile(old);
        const url = await uploadFile(storagePath, req.file.buffer, req.file.mimetype, filename);
        await db.prepare(`UPDATE tenants SET ${field}_url = ? WHERE id = ?`).run(url, req.tenantId);
        res.json({ url });
      })().catch(next);
    });
  };
}

function deleteField(field) {
  return async (req, res) => {
    const old = req.tenant[`${field}_url`];
    if (old) await deleteFile(old);
    await db.prepare(`UPDATE tenants SET ${field}_url = NULL WHERE id = ?`).run(req.tenantId);
    res.json({ message: 'Image supprimée' });
  };
}

router.post('/logo',       uploadField('logo'));
router.delete('/logo',     deleteField('logo'));
router.post('/banner',     uploadField('banner'));
router.delete('/banner',   deleteField('banner'));
router.post('/hero-photo', uploadField('hero_photo'));
router.delete('/hero-photo', deleteField('hero_photo'));

module.exports = router;
