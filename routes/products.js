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
    cb(ok ? null : new Error('Format non supporté'), ok);
  }
}).single('photo');

// GET /api/admin/products
router.get('/', async (req, res) => {
  const products = await db.prepare('SELECT * FROM products WHERE tenant_id = ? AND active = 1 ORDER BY position ASC, created_at ASC').all(req.tenantId);
  res.json(products);
});

// POST /api/admin/products
router.post('/', (req, res, next) => {
  upload(req, res, (err) => {
    (async () => {
      if (err) return res.status(400).json({ error: err.message });
      let photo_url = null;
      if (req.file) {
        const ext = path.extname(req.file.originalname).toLowerCase();
        const filename = `product-${Date.now()}${ext}`;
        photo_url = await uploadFile(`tenants/${req.tenant.slug}/products/${filename}`, req.file.buffer, req.file.mimetype, filename);
      }
      const { name, brand, type, price, description } = req.body || {};
      if (!name) return res.status(400).json({ error: 'Le nom du produit est obligatoire' });
      const result = await db.prepare(
        'INSERT INTO products (tenant_id, name, brand, type, price, photo_url, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(req.tenantId, name, brand || null, type || null, price ? parseFloat(price) : 0, photo_url, description || null);
      res.json({ id: result.lastInsertRowid, name, brand, type, price, photo_url, description });
    })().catch(next);
  });
});

// PUT /api/admin/products/:id
router.put('/:id', async (req, res) => {
  const { name, brand, type, price, description, active, position } = req.body || {};
  const product = await db.prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  await db.prepare(
    'UPDATE products SET name = ?, brand = ?, type = ?, price = ?, description = ?, active = ?, position = ? WHERE id = ? AND tenant_id = ?'
  ).run(
    name        !== undefined ? name        : product.name,
    brand       !== undefined ? brand       : product.brand,
    type        !== undefined ? type        : product.type,
    price       !== undefined ? parseFloat(price) : product.price,
    description !== undefined ? description : product.description,
    active      !== undefined ? active      : product.active,
    position    !== undefined ? position    : product.position,
    req.params.id, req.tenantId
  );
  res.json({ message: 'Produit mis à jour' });
});

// DELETE /api/admin/products/:id
router.delete('/:id', async (req, res) => {
  const product = await db.prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  if (product.photo_url) await deleteFile(product.photo_url);
  await db.prepare('DELETE FROM products WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
  res.json({ message: 'Produit supprimé' });
});

// PATCH /api/admin/products/:id/photo
router.patch('/:id/photo', (req, res, next) => {
  upload(req, res, (err) => {
    (async () => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'Format non supporté (.jpg, .png, .webp requis)' });
      const product = await db.prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
      if (!product) return res.status(404).json({ error: 'Produit introuvable' });
      if (product.photo_url) await deleteFile(product.photo_url);
      const ext = path.extname(req.file.originalname).toLowerCase();
      const filename = `product-${Date.now()}${ext}`;
      const photo_url = await uploadFile(`tenants/${req.tenant.slug}/products/${filename}`, req.file.buffer, req.file.mimetype, filename);
      await db.prepare('UPDATE products SET photo_url = ? WHERE id = ? AND tenant_id = ?').run(photo_url, req.params.id, req.tenantId);
      res.json({ message: 'Photo mise à jour', photo_url });
    })().catch(next);
  });
});

module.exports = router;
