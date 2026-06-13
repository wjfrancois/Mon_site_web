// Polyfill WebSocket for Node < 22 (needed by @supabase/realtime-js)
if (!globalThis.WebSocket) {
  try { globalThis.WebSocket = require('ws'); } catch(e) {}
}

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const BUCKET = 'uploads';
let _client = null;

function getClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  try {
    _client = createClient(url, key);
  } catch(e) {
    console.error('[Storage] Supabase client error:', e.message);
    return null;
  }
  return _client;
}

// Upload a file buffer to Supabase Storage (or local disk as fallback in dev)
async function uploadFile(storagePath, buffer, mimetype, localFilename) {
  const client = getClient();

  if (client) {
    const { error } = await client.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: mimetype,
      upsert: true
    });
    if (error) throw new Error(`[Storage] Upload failed: ${error.message}`);
    const { data } = client.storage.from(BUCKET).getPublicUrl(storagePath);
    return data.publicUrl;
  }

  // Fallback: local disk (dev sans Supabase Storage)
  const localDir = path.join(__dirname, '..', 'public', 'img', 'uploads');
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
  fs.writeFileSync(path.join(localDir, localFilename), buffer);
  return `/img/uploads/${localFilename}`;
}

// Delete a file from Supabase Storage (or local disk)
async function deleteFile(url) {
  if (!url) return;
  const client = getClient();

  if (client) {
    const marker = `/object/public/${BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx !== -1) {
      const storagePath = decodeURIComponent(url.slice(idx + marker.length));
      const { error } = await client.storage.from(BUCKET).remove([storagePath]);
      if (error) console.warn('[Storage] Delete warning:', error.message);
    }
    return;
  }

  // Fallback: local disk
  if (url.startsWith('/img/')) {
    const localPath = path.join(__dirname, '..', 'public', url);
    if (fs.existsSync(localPath)) try { fs.unlinkSync(localPath); } catch(e) {}
  }
}

module.exports = { uploadFile, deleteFile };
