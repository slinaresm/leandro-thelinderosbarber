const fs = require('fs');
const { randomUUID: uuidv4 } = require('crypto');
const getDb = require('../config/db');
const { extractInvoiceItems } = require('../services/ai.service');

const MIME_BY_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };

// POST /api/purchases/extract - admin sube una factura (imagen o PDF); la IA
// devuelve los items detectados SIN tocar stock/costos todavia — el admin
// revisa y ajusta en el frontend antes de llamar a /confirm.
async function extractInvoice(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Sube una foto o PDF de la factura.' });

  const base64 = fs.readFileSync(req.file.path, { encoding: 'base64' });
  const mediaType = req.file.mimetype || MIME_BY_EXT[require('path').extname(req.file.originalname).toLowerCase()] || 'image/jpeg';

  const extracted = await extractInvoiceItems({ base64, mediaType });

  res.json({
    invoiceFileUrl: `/uploads/invoices/${req.file.filename}`,
    supplier: extracted.supplier || null,
    invoiceNumber: extracted.invoiceNumber || null,
    items: (extracted.items || []).map((it) => ({
      name: it.name,
      quantity: Number(it.quantity) || 0,
      unitCost: Math.round(Number(it.unitCost) || 0),
    })),
  });
}

// POST /api/purchases/confirm - admin confirma (con ediciones) los items de
// la factura; recien aqui se actualiza stock/costo real o se crean productos.
async function confirmPurchase(req, res) {
  const db = await getDb();
  const { supplier, invoiceNumber, invoiceFileUrl, items } = req.body;

  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'No hay items para confirmar.' });
  }

  const resolvedItems = [];
  let totalCost = 0;

  for (const raw of items) {
    const quantity = parseInt(raw.quantity, 10) || 0;
    const unitCost = Math.round(Number(raw.unitCost)) || 0;
    if (quantity <= 0) continue;
    totalCost += quantity * unitCost;

    if (raw.productId) {
      const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(raw.productId);
      if (!product) return res.status(404).json({ error: `Producto no encontrado: ${raw.productId}` });
      await db.prepare('UPDATE products SET stock = stock + ?, cost_price = ? WHERE id = ?')
        .run(quantity, unitCost, raw.productId);
      resolvedItems.push({ productId: raw.productId, name: product.name, quantity, unitCost, action: 'updated' });
    } else {
      const suggestedPrice = Math.round((unitCost * 1.5 * 1.19) / 10) * 10;
      const newId = uuidv4();
      await db.prepare(`
        INSERT INTO products (id, name, description, price, cost_price, stock, category, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run(newId, raw.name, null, suggestedPrice, unitCost, quantity, raw.category || null);
      resolvedItems.push({ productId: newId, name: raw.name, quantity, unitCost, action: 'created' });
    }
  }

  const purchaseId = uuidv4();
  await db.prepare(`
    INSERT INTO purchases (id, supplier, invoice_number, invoice_file_url, items, total_cost, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(purchaseId, supplier || null, invoiceNumber || null, invoiceFileUrl || null, JSON.stringify(resolvedItems), totalCost, req.user.id);

  const purchase = await db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
  res.status(201).json({ purchase: { ...purchase, items: resolvedItems } });
}

// GET /api/purchases - historial de compras (admin)
async function listPurchases(req, res) {
  const db = await getDb();
  const rows = await db.prepare('SELECT * FROM purchases ORDER BY created_at DESC').all();
  res.json({ purchases: rows.map((p) => ({ ...p, items: JSON.parse(p.items) })) });
}

module.exports = { extractInvoice, confirmPurchase, listPurchases };
