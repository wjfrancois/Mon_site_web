const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');

function getUploadDir(tenantSlug) {
  const dir = path.join(__dirname, '..', 'public', 'img', 'tenants', tenantSlug, 'products');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, getUploadDir(req.tenant.slug)),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `product-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  }
}).single('photo');

// GET /api/admin/products
router.get('/', (req, res) => {
  const products = db.prepare('SELECT * FROM products WHERE tenant_id = ? AND active = 1 ORDER BY position ASC, created_at ASC').all(req.tenantId);
  res.json(products);
});

// POST /api/admin/products
router.post('/', (req, res, next) => {
  upload(req, res, (err) => {
    console.log('[Products POST] tenant:', req.tenantId, 'err:', err?.message, 'file:', req.file?.originalname);
    try {
      if (err) return res.status(400).json({ error: err.message });
      const photo_url = req.file
        ? `/img/tenants/${req.tenant.slug}/products/${req.file.filename}`
        : null;
      const { name, brand, type, price, description } = req.body || {};
      if (!name) return res.status(400).json({ error: 'Le nom du produit est obligatoire' });
      const result = db.prepare(
        'INSERT INTO products (tenant_id, name, brand, type, price, photo_url, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(req.tenantId, name, brand || null, type || null, price ? parseFloat(price) : 0, photo_url, description || null);
      res.json({ id: result.lastInsertRowid, name, brand, type, price, photo_url, description });
    } catch (e) {
      console.error('[Products POST] error:', e.message);
      next(e);
    }
  });
});

// PUT /api/admin/products/:id — update text fields only
router.put('/:id', (req, res) => {
  const { name, brand, type, price, description, active, position } = req.body || {};
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  db.prepare(
    'UPDATE products SET name = ?, brand = ?, type = ?, price = ?, description = ?, active = ?, position = ? WHERE id = ? AND tenant_id = ?'
  ).run(
    name !== undefined ? name : product.name,
    brand !== undefined ? brand : product.brand,
    type !== undefined ? type : product.type,
    price !== undefined ? parseFloat(price) : product.price,
    description !== undefined ? description : product.description,
    active !== undefined ? active : product.active,
    position !== undefined ? position : product.position,
    req.params.id,
    req.tenantId
  );
  res.json({ message: 'Produit mis à jour' });
});

// DELETE /api/admin/products/:id
router.delete('/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  if (product.photo_url) {
    const filePath = path.join(__dirname, '..', 'public', product.photo_url);
    if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch (e) {}
  }
  db.prepare('DELETE FROM products WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
  res.json({ message: 'Produit supprimé' });
});

// PATCH /api/admin/products/:id/photo — replace photo
router.patch('/:id/photo', (req, res, next) => {
  upload(req, res, (err) => {
    console.log('[Products PATCH photo] tenant:', req.tenantId, 'err:', err?.message, 'file:', req.file?.originalname);
    try {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'Format non supporté (.jpg, .png, .webp requis)' });
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
      if (!product) return res.status(404).json({ error: 'Produit introuvable' });
      // Delete old photo file if it exists
      if (product.photo_url) {
        const oldPath = path.join(__dirname, '..', 'public', product.photo_url);
        if (fs.existsSync(oldPath)) try { fs.unlinkSync(oldPath); } catch (e) {}
      }
      const photo_url = `/img/tenants/${req.tenant.slug}/products/${req.file.filename}`;
      db.prepare('UPDATE products SET photo_url = ? WHERE id = ? AND tenant_id = ?').run(photo_url, req.params.id, req.tenantId);
      res.json({ message: 'Photo mise à jour', photo_url });
    } catch (e) {
      console.error('[Products PATCH photo] error:', e.message);
      next(e);
    }
  });
});

module.exports = router;
