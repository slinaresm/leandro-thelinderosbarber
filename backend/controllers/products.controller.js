const { randomUUID: uuidv4 } = require('crypto');
const getDb = require('../config/db');
const { audit } = require('../services/audit.service');

const SORT_MAP = {
  relevancia: 'p.active DESC, p.created_at DESC',
  mas_vendidos: 'sold DESC, p.created_at DESC',
  alfabetico_az: 'p.name ASC',
  alfabetico_za: 'p.name DESC',
  precio_asc: 'p.price ASC',
  precio_desc: 'p.price DESC',
  fecha_antiguo: 'p.created_at ASC',
  fecha_reciente: 'p.created_at DESC',
};

// GET /api/products - catalogo publico con filtros, orden y paginacion
// Query params: availability=in_stock|out_of_stock (repetible), minPrice, maxPrice,
// sort=<clave de SORT_MAP>, page, pageSize
async function listPublicProducts(req, res) {
  const db = await getDb();
  const { minPrice, maxPrice, sort } = req.query;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 24, 1), 100);

  let availability = req.query.availability;
  if (availability && !Array.isArray(availability)) availability = [availability];

  const where = ['p.active = 1'];
  const params = [];

  if (minPrice) { where.push('p.price >= ?'); params.push(parseInt(minPrice, 10)); }
  if (maxPrice) { where.push('p.price <= ?'); params.push(parseInt(maxPrice, 10)); }

  if (availability && availability.length === 1) {
    if (availability[0] === 'in_stock') where.push('p.stock > 0');
    if (availability[0] === 'out_of_stock') where.push('p.stock <= 0');
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = SORT_MAP[sort] || SORT_MAP.relevancia;

  const countRow = await db.prepare(`SELECT COUNT(*) as total FROM products p ${whereSql}`).get(...params);
  const total = countRow ? countRow.total : 0;

  const offset = (page - 1) * pageSize;
  const rows = await db.prepare(`
    SELECT p.*,
      CASE WHEN p.stock > 0 THEN 'in_stock' ELSE 'out_of_stock' END as availability,
      0 as sold
    FROM products p
    ${whereSql}
    ORDER BY ${orderSql}
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  const inStockRow = await db.prepare(`SELECT COUNT(*) as c FROM products WHERE active = 1 AND stock > 0`).get();
  const outStockRow = await db.prepare(`SELECT COUNT(*) as c FROM products WHERE active = 1 AND stock <= 0`).get();
  const maxPriceRow = await db.prepare(`SELECT MAX(price) as m FROM products WHERE active = 1`).get();

  res.json({
    products: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
    facets: {
      inStockCount: inStockRow ? inStockRow.c : 0,
      outOfStockCount: outStockRow ? outStockRow.c : 0,
      maxPrice: maxPriceRow ? (maxPriceRow.m || 0) : 0,
    },
  });
}

// GET /api/products/:id
async function getProduct(req, res) {
  const db = await getDb();
  const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });
  res.json({ product });
}

// GET /api/products/admin/all - admin ve todo (incluye inactivos)
async function listAdminProducts(req, res) {
  const db = await getDb();
  const products = await db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json({ products });
}

// POST /api/products - admin crea producto
async function createProduct(req, res) {
  const db = await getDb();
  const { name, description, price, cost_price, stock, category } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'name y price son obligatorios.' });
  }
  const id = uuidv4();
  const imageUrl = req.file ? `/uploads/products/${req.file.filename}` : (req.body.image_url || null);

  await db.prepare(`
    INSERT INTO products (id, name, description, price, cost_price, image_url, stock, category, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description || null, parseInt(price, 10), cost_price === undefined || cost_price === '' ? null : parseInt(cost_price, 10), imageUrl, parseInt(stock, 10) || 0, category || null, 1);

  const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (product.stock > 0) await db.prepare(`INSERT INTO stock_movements (id, product_id, movement_type, quantity_delta, unit_cost, reference_type, reference_id, created_by)
    VALUES (?, ?, 'adjustment', ?, ?, 'product_create', ?, ?)`).run(uuidv4(), id, product.stock, product.cost_price, id, req.user.id);
  await audit(db, { actorUserId: req.user.id, entityType: 'product', entityId: id, action: 'created', after: product });
  res.status(201).json({ product });
}

// PATCH /api/products/:id - admin actualiza producto
async function updateProduct(req, res) {
  const db = await getDb();
  const { id } = req.params;
  const existing = await db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Producto no encontrado.' });

  const { name, description, price, cost_price, stock, category, active } = req.body;
  const imageUrl = req.file ? `/uploads/products/${req.file.filename}` : undefined;

  await db.prepare(`
    UPDATE products SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      price = COALESCE(?, price),
      cost_price = COALESCE(?, cost_price),
      image_url = COALESCE(?, image_url),
      stock = COALESCE(?, stock),
      category = COALESCE(?, category),
      active = COALESCE(?, active)
    WHERE id = ?
  `).run(
    name || null,
    description === undefined ? null : description,
    price === undefined ? null : parseInt(price, 10),
    cost_price === undefined || cost_price === '' ? null : parseInt(cost_price, 10),
    imageUrl || null,
    stock === undefined ? null : parseInt(stock, 10),
    category === undefined ? null : category,
    active === undefined ? null : (active ? 1 : 0),
    id
  );

  const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (stock !== undefined && product.stock !== existing.stock) {
    await db.prepare(`INSERT INTO stock_movements (id, product_id, movement_type, quantity_delta, unit_cost, reference_type, reference_id, created_by)
      VALUES (?, ?, 'adjustment', ?, ?, 'product_update', ?, ?)`).run(uuidv4(), id, product.stock - existing.stock, product.cost_price, id, req.user.id);
  }
  await audit(db, { actorUserId: req.user.id, entityType: 'product', entityId: id, action: 'updated', before: existing, after: product });
  res.json({ product });
}

// GET /api/products/admin/inventory-summary - totales para el panel "Stock y costos"
async function getInventorySummary(req, res) {
  const db = await getDb();
  const products = await db.prepare('SELECT * FROM products WHERE active = 1').all();

  let stockValueCost = 0;
  let stockValueRetail = 0;
  let unitsInStock = 0;
  let productsMissingCost = 0;

  for (const p of products) {
    unitsInStock += p.stock || 0;
    stockValueRetail += (p.price || 0) * (p.stock || 0);
    if (p.cost_price === null || p.cost_price === undefined) {
      productsMissingCost += 1;
    } else {
      stockValueCost += p.cost_price * (p.stock || 0);
    }
  }

  res.json({
    unitsInStock,
    stockValueCost,
    stockValueRetail,
    potentialProfit: stockValueRetail - stockValueCost,
    productsMissingCost,
  });
}

// DELETE /api/products/:id - admin elimina (borrado logico: active=0)
async function deleteProduct(req, res) {
  const db = await getDb();
  const { id } = req.params;
  const existing = await db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Producto no encontrado.' });
  await db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(id);
  await audit(db, { actorUserId: req.user.id, entityType: 'product', entityId: id, action: 'deactivated', before: existing, after: { ...existing, active: 0 } });
  res.json({ message: 'Producto desactivado.' });
}

module.exports = {
  listPublicProducts,
  getProduct,
  listAdminProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getInventorySummary,
};
