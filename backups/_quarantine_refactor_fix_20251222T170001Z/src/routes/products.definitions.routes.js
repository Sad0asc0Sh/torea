'use strict';

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const productsService = require('../services/products.service');
const brandsService = require('../services/brands.service');

const router = express.Router();
const TEMPLATE_HEADERS = ['brand_code', 'brand_name', 'product_name', 'sku_code', 'aliases', 'is_key', 'is_active'];
const MAX_IMPORT_ERRORS = 30;
const ALLOW_BRAND_AUTOCREATE = process.env.PRODUCT_IMPORT_ALLOW_BRAND_AUTOCREATE === 'true';
const CSV_CODEPAGE = Number(process.env.PRODUCT_IMPORT_CSV_CODEPAGE || 65001);
const CSV_SEPARATOR = process.env.PRODUCT_IMPORT_CSV_SEPARATOR || ',';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const name = (file && file.originalname) ? String(file.originalname).toLowerCase() : '';
    if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) {
      const err = new Error('Only .xlsx or .csv files are allowed.');
      err.code = 'INVALID_FILETYPE';
      return cb(err);
    }
    return cb(null, true);
  },
});

function ensureSystemAdmin(req, res, next) {
  const role = (req.session?.user?.role || '').toUpperCase();
  if (role !== 'SYSTEM_ADMIN') {
    return res.status(403).render('unauthorized', { user: req.session?.user || null });
  }
  return next();
}

function toBool(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

function toIntOrNull(value) {
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function safeMsg(v) {
  if (!v) return null;
  const s = String(v);
  return s.length > 2000 ? s.slice(0, 2000) : s;
}

function normalizeText(v) {
  return (v || '').toString().trim();
}

function normalizeAliases(v) {
  const raw = (v || '').toString();
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s);
}

function normalizeImportBoolean(raw, defaultValue) {
  const s = raw === undefined || raw === null ? '' : String(raw).trim().toLowerCase();
  if (!s) return { ok: true, value: !!defaultValue };

  const TRUE_SET = new Set(['1','true','t','yes','y','on']);
  const FALSE_SET = new Set(['0','false','f','no','n','off']);

  if (TRUE_SET.has(s)) return { ok: true, value: true };
  if (FALSE_SET.has(s)) return { ok: true, value: false };

  return { ok: false, value: !!defaultValue };
}


function logImportErrorsForTest(errors) {
  if (process.env.NODE_ENV === 'test' && errors && errors.length) {
    console.error('[PRODUCT_IMPORT][test] errors=' + JSON.stringify(errors));
  }
}

function readSheetHeaders(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, range: 0 });
  return (rows[0] || []).map((c) => String(c || '').trim().toLowerCase());
}

router.use(ensureSystemAdmin);

router.get('/definitions/products', async (req, res) => {
  const brandId = toIntOrNull(req.query?.brand_id);
  const search = normalizeText(req.query?.q);
  let page = toIntOrNull(req.query?.page) || 1;
  if (page < 1) page = 1;
  const pageSize = 15;
  const importResult = req.session?.productImportResult || null;
  if (req.session) req.session.productImportResult = null;

  try {
    const [{ items, total }, brands] = await Promise.all([
      productsService.listProducts({ brandId, search, page, pageSize }),
      brandsService.listAllBrandsSimple(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const warnMessage = safeMsg(req.query && req.query.warn) || (!brands.length ? 'اول برند بسازید' : null);
    return res.render('definitions/products', {
      user: req.session?.user || null,
      products: items,
      brands,
      filterBrandId: brandId,
      searchQuery: search,
      page,
      totalPages,
      error: safeMsg(req.query && req.query.err),
      info: safeMsg(req.query && req.query.ok),
      warn: warnMessage,
      importResult,
    });
  } catch (err) {
    console.error('GET /admin/definitions/products error:', err);
    return res.render('definitions/products', {
      user: req.session?.user || null,
      products: [],
      brands: [],
      filterBrandId: brandId,
      searchQuery: search,
      page: 1,
      totalPages: 1,
      error: 'خطا در خواندن لیست کالاها.',
      info: null,
      warn: 'اول برند بسازید',
      importResult,
    });
  }
});

router.get('/definitions/products/template.xlsx', async (req, res) => {
  const wb = XLSX.utils.book_new();
  const rows = [
    TEMPLATE_HEADERS,
    ['BR-001', 'نمونه برند', 'نمونه محصول اول', 'SKU-1001', 'alias-a, alias-b', '1', '1'],
    ['BR-002', 'نمونه برند ۲', 'محصول دوم بدون کد', '', '', '0', '1'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'products');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="products_template.xlsx"');
  return res.send(buf);
});

router.get('/definitions/products/template', (req, res) => res.redirect('/admin/definitions/products/template.xlsx'));

router.post('/definitions/products/import', (req, res) => {
  upload.single('file')(req, res, async (multerErr) => {
    const userInfo = req.session?.user || null;
    const userLabel = userInfo ? `${userInfo.id || '?'}|${userInfo.username || ''}` : 'unknown';
    const importResult = { totalRows: 0, inserted: 0, updated: 0, failed: 0, errors: [] };
    const uploadedName = req.file?.originalname ? String(req.file.originalname).toLowerCase() : '';
    const isCsv = uploadedName.endsWith('.csv');

    const redirectWith = (type, message) => {
      req.session.productImportResult = importResult;
      const qs = message ? `?${type}=${encodeURIComponent(message)}` : '';
      return res.redirect('/admin/definitions/products' + qs);
    };

    if (multerErr) {
      importResult.failed = 1;
      const friendly = multerErr.code === 'LIMIT_FILE_SIZE' ? 'حجم فایل نباید بیش از ۱۰ مگابایت باشد.' : 'خطا در بارگذاری فایل.';
      importResult.errors.push({ row: 0, message: friendly });
      console.error('[PRODUCT_IMPORT] multer error:', multerErr);
      return redirectWith('err', 'بارگذاری فایل ناموفق بود.');
    }

    if (!req.file) {
      importResult.failed = 1;
      importResult.errors.push({ row: 0, message: 'فایل الزامی است.' });
      return redirectWith('err', 'فایل الزامی است.');
    }

    let workbook;
    try {
      const readOptions = isCsv ? { type: 'buffer', raw: false, FS: CSV_SEPARATOR, codepage: CSV_CODEPAGE } : { type: 'buffer' };
      workbook = XLSX.read(req.file.buffer, readOptions);
    } catch (err) {
      importResult.failed = 1;
      importResult.errors.push({ row: 0, message: 'امکان خواندن فایل نیست.' });
      console.error('[PRODUCT_IMPORT] parse error:', err);
      return redirectWith('err', 'فایل نامعتبر است.');
    }

    const sheetName =
      (workbook.SheetNames || []).find((n) => String(n || '').trim().toLowerCase() === 'products') ||
      (workbook.SheetNames || [])[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : null;
    if (!sheet) {
      importResult.failed = 1;
      importResult.errors.push({ row: 0, message: 'داده products در فایل وجود ندارد.' });
      return redirectWith('err', 'قالب فایل نادرست است.');
    }

    const headers = readSheetHeaders(sheet);
    const expected = TEMPLATE_HEADERS;
    const headersMatch = headers.length === expected.length && headers.every((h, idx) => h === expected[idx]);
    if (!headersMatch) {
      importResult.failed = 1;
      importResult.errors.push({ row: 1, message: 'ستون‌ها باید دقیقا شامل: ' + expected.join(', ') });
      return redirectWith('err', 'ساختار فایل نادرست است.');
    }

    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: expected, range: 1, defval: '' });
    const dataRows = rawRows.filter((r) => expected.some((key) => String(r[key] || '').trim() !== ''));

    if (dataRows.length > 5000) {
      importResult.failed = 1;
      importResult.errors.push({ row: 0, message: 'حداکثر ۵۰۰۰ ردیف مجاز است.' });
      return redirectWith('err', 'تعداد ردیف‌ها بیش از حد مجاز است.');
    }

    importResult.totalRows = dataRows.length;

    let brands = [];
    try {
      brands = await brandsService.listAllBrandsSimple();
    } catch (err) {
      console.error('[PRODUCT_IMPORT] brand preload error:', err);
    }
    const brandByCode = new Map();
    const brandByName = new Map();
    (brands || []).forEach((b) => {
      if (b.code) brandByCode.set(String(b.code).trim().toLowerCase(), b);
      if (b.name) brandByName.set(String(b.name).trim().toLowerCase(), b);
    });

    const validRows = [];
    for (let idx = 0; idx < dataRows.length; idx += 1) {
      const row = dataRows[idx];
      const rowNumber = idx + 2;
      const errs = [];

      const name = normalizeText(row.product_name);
      const skuCodeRaw = normalizeText(row.sku_code);
      const skuCode = skuCodeRaw ? skuCodeRaw : null;
      const aliases = normalizeAliases(row.aliases);
      const isKeyResult = normalizeImportBoolean(row.is_key, false);
      const isActiveResult = normalizeImportBoolean(row.is_active, true);

      const brandCodeRaw = normalizeText(row.brand_code);
      const brandCodeKey = brandCodeRaw.toLowerCase();
      const brandNameRaw = normalizeText(row.brand_name);
      let brand = null;
      if (!brandCodeRaw) {
        errs.push('brand_code الزامی است.');
      } else {
        brand = brandByCode.get(brandCodeKey) || null;
        if (!brand) {
          if (ALLOW_BRAND_AUTOCREATE) {
            try {
              const created = await brandsService.createBrand({
                name: brandNameRaw || brandCodeRaw,
                code: brandCodeRaw,
                isActive: true,
              });
              brand = created;
              brandByCode.set(brandCodeKey, created);
              if (created && created.name) brandByName.set(String(created.name).trim().toLowerCase(), created);
            } catch (err) {
              console.error('[PRODUCT_IMPORT] brand auto-create failed:', err);
              errs.push('امکان ساخت برند جدید وجود ندارد.');
            }
          } else {
            errs.push('برند با این کد یافت نشد. اول برند بسازید.');
          }
        }
      }

      if (brand && brand.is_active === false) errs.push('برند غیرفعال است.');
      if (!name) errs.push('نام کالا (product_name) الزامی است.');
      if (!isKeyResult.ok) errs.push('مقدار is_key نامعتبر است (true/false یا 1/0).');
      if (!isActiveResult.ok) errs.push('مقدار is_active نامعتبر است (true/false یا 1/0).');

      if (errs.length) {
        importResult.errors.push({ row: rowNumber, message: errs.join(' ') });
        continue;
      }

      const isKey = isKeyResult.ok ? isKeyResult.value : false;
      const isActive = isActiveResult.ok ? isActiveResult.value : true;

      validRows.push({
        _row: rowNumber,
        brandId: brand.id,
        skuCode,
        name,
        aliases,
        isKey,
        isActive,
      });
    }

    if (!validRows.length) {
      importResult.failed = importResult.errors.length;
      logImportErrorsForTest(importResult.errors);
      return redirectWith('warn', 'ردیف معتبری برای ورود پیدا نشد.');
    }

    const providedSkus = Array.from(
      new Set(
        validRows
          .map((r) => (r.skuCode ? r.skuCode.trim().toLowerCase() : ''))
          .filter((s) => s)
      )
    );

    const existingSkuMap = new Map();
    if (providedSkus.length) {
      try {
        const existing = await productsService.getProductsBySkuCodes(providedSkus);
        (existing || []).forEach((r) => {
          existingSkuMap.set(String(r.sku_code).trim().toLowerCase(), r);
        });
      } catch (err) {
        console.error('[PRODUCT_IMPORT] preload sku conflict check failed:', err);
      }
    }

    const seenSku = new Set();
    const finalRows = [];
    for (const row of validRows) {
      let hasError = false;
      if (row.skuCode) {
        const norm = row.skuCode.trim().toLowerCase();
        if (seenSku.has(norm)) {
          importResult.errors.push({ row: row._row, message: 'کد کالا در فایل تکراری است.' });
          hasError = true;
        }
        seenSku.add(norm);

        // NOTE: SKU ممکن است از قبل وجود داشته باشد؛ ایمپورت از upsert استفاده می‌کند و اینجا conflict نمی‌گیریم.
      }

      if (!hasError) {
        finalRows.push(row);
      }
    }

    if (!finalRows.length) {
      importResult.failed = importResult.errors.length;
      logImportErrorsForTest(importResult.errors);
      return redirectWith('warn', 'ردیف معتبری برای ورود پیدا نشد.');
    }

    if (importResult.errors.length) {
      importResult.errors = importResult.errors.slice(0, MAX_IMPORT_ERRORS);
      logImportErrorsForTest(importResult.errors);
      console.error(`[PRODUCT_IMPORT] user=${userLabel} validation errors count=${importResult.errors.length}`);
    }

    const errorCount = importResult.errors.length;

    try {
      const dbResult = await productsService.upsertProducts(finalRows);
      importResult.inserted = dbResult.inserted || 0;
      importResult.updated = dbResult.updated || 0;
      importResult.failed = errorCount;
      console.log(
        `[PRODUCT_IMPORT] user=${userLabel} total=${importResult.totalRows} inserted=${importResult.inserted} updated=${importResult.updated} failed=${errorCount}`
      );
      const messageBase = `ورود فایل اکسل انجام شد. ردیف‌ها: ${importResult.totalRows}`;
      const message = errorCount ? `${messageBase} (ردیف‌های دارای خطا: ${errorCount})` : messageBase;
      return redirectWith('ok', message);
    } catch (err) {
      importResult.failed = importResult.totalRows;
      importResult.errors = [{ row: 0, message: 'خطا در ذخیره‌سازی در پایگاه داده.' }];
      console.error('[PRODUCT_IMPORT] db error:', err);
      return redirectWith('err', 'خطا در ثبت داده‌ها.');
    }
  });
});

router.get('/definitions/products/new', async (req, res) => {
  try {
    const brands = await brandsService.listActiveBrands();
    return res.render('admin_def_product_form', {
      user: req.session?.user || null,
      product: { sku_code: '', name: '', aliases: [], is_key: false, brand_id: null, is_active: true },
      brands,
      error: null,
      mode: 'create',
    });
  } catch (err) {
    console.error('GET /admin/definitions/products/new error:', err);
    return res.redirect('/admin/definitions/products?err=' + encodeURIComponent('خطا در بارگذاری فرم.'));
  }
});

router.get('/definitions/products/:id/edit', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/products?err=' + encodeURIComponent('شناسه کالا نامعتبر است.'));
  }

  try {
    const product = await productsService.getProductById(id);
    if (!product) {
      return res.redirect('/admin/definitions/products?err=' + encodeURIComponent('کالا یافت نشد.'));
    }

    let brands = await brandsService.listActiveBrands();
    if (product.brand_id && !brands.find((b) => Number(b.id) === Number(product.brand_id))) {
      const currentBrand = await brandsService.getBrandById(product.brand_id);
      if (currentBrand) {
        brands = [...brands, currentBrand];
      }
    }

    return res.render('admin_def_product_form', {
      user: req.session?.user || null,
      product,
      brands,
      error: null,
      mode: 'edit',
    });
  } catch (err) {
    console.error('GET /admin/definitions/products/:id/edit error:', err);
    return res.redirect('/admin/definitions/products?err=' + encodeURIComponent('خطا در بارگذاری فرم.'));
  }
});

router.post('/definitions/products', async (req, res) => {
  const brandId = toIntOrNull(req.body?.brand_id);
  const skuCodeRaw = normalizeText(req.body?.sku_code);
  const skuCode = skuCodeRaw ? skuCodeRaw : null;
  const name = normalizeText(req.body?.name);
  const aliasesRaw = (req.body?.aliases || '').toString();
  const aliases = normalizeAliases(aliasesRaw);
  const isKey = toBool(req.body?.is_key);
  const isActive = toBool(req.body?.is_active ?? true);

  const productForRender = { brand_id: brandId, sku_code: skuCodeRaw, name, aliases: aliasesRaw, is_key: isKey, is_active: isActive };

  let brands = [];
  try {
    brands = await brandsService.listActiveBrands();
  } catch (err) {
    console.error('POST /admin/definitions/products preload error:', err);
  }

  if (!brandId) {
    return res.render('admin_def_product_form', {
      user: req.session?.user || null,
      product: productForRender,
      brands,
      error: 'انتخاب برند الزامی است.',
      mode: 'create',
    });
  }

  if (!name) {
    return res.render('admin_def_product_form', {
      user: req.session?.user || null,
      product: productForRender,
      brands,
      error: 'نام کالا الزامی است.',
      mode: 'create',
    });
  }

  try {
    const brand = await brandsService.getBrandById(brandId);
    if (!brand || brand.is_active === false) {
      return res.render('admin_def_product_form', {
        user: req.session?.user || null,
        product: productForRender,
        brands,
        error: 'برند انتخاب‌شده باید فعال باشد.',
        mode: 'create',
      });
    }

    const [duplicateSku, duplicateName] = await Promise.all([
      productsService.isSkuTaken(skuCode, null),
      productsService.isNameTaken({ brandId, name }),
    ]);
    if (duplicateName) {
      return res.render('admin_def_product_form', {
        user: req.session?.user || null,
        product: productForRender,
        brands,
        error: 'کالایی با این نام در این برند وجود دارد.',
        mode: 'create',
      });
    }

    if (duplicateSku) {
      return res.render('admin_def_product_form', {
        user: req.session?.user || null,
        product: productForRender,
        brands,
        error: 'کد کالا تکراری است.',
        mode: 'create',
      });
    }

    await productsService.createProduct({
      brandId,
      skuCode,
      name,
      aliases,
      isKey,
      isActive,
    });
    return res.redirect('/admin/definitions/products?ok=' + encodeURIComponent('کالا با موفقیت ایجاد شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/products error:', err);
    return res.render('admin_def_product_form', {
      user: req.session?.user || null,
      product: productForRender,
      brands,
      error: 'خطا در ایجاد کالا.',
      mode: 'create',
    });
  }
});

router.post('/definitions/products/:id', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/products?err=' + encodeURIComponent('شناسه کالا نامعتبر است.'));
  }

  let product = null;
  let brands = [];
  try {
    [product, brands] = await Promise.all([
      productsService.getProductById(id),
      brandsService.listActiveBrands(),
    ]);
  } catch (err) {
    console.error('POST /admin/definitions/products/:id preload error:', err);
  }

  if (!product) {
    return res.redirect('/admin/definitions/products?err=' + encodeURIComponent('کالا یافت نشد.'));
  }

  const brandId = toIntOrNull(req.body?.brand_id);
  const skuCodeRaw = normalizeText(req.body?.sku_code);
  const skuCode = skuCodeRaw ? skuCodeRaw : null;
  const name = normalizeText(req.body?.name);
  const aliasesRaw = (req.body?.aliases || '').toString();
  const aliases = normalizeAliases(aliasesRaw);
  const isKey = toBool(req.body?.is_key);
  const isActive = toBool(req.body?.is_active);

  if (product.brand_id && !brands.find((b) => Number(b.id) === Number(product.brand_id))) {
    const currentBrand = await brandsService.getBrandById(product.brand_id);
    if (currentBrand) brands = [...brands, currentBrand];
  }

  const productForRender = { ...product, brand_id: brandId, sku_code: skuCodeRaw, name, aliases: aliasesRaw, is_key: isKey, is_active: isActive };

  if (!brandId) {
    return res.render('admin_def_product_form', {
      user: req.session?.user || null,
      product: productForRender,
      brands,
      error: 'انتخاب برند الزامی است.',
      mode: 'edit',
    });
  }

  if (!name) {
    return res.render('admin_def_product_form', {
      user: req.session?.user || null,
      product: productForRender,
      brands,
      error: 'نام کالا الزامی است.',
      mode: 'edit',
    });
  }

  try {
    const brand = await brandsService.getBrandById(brandId);
    if (!brand) {
      return res.render('admin_def_product_form', {
        user: req.session?.user || null,
        product: productForRender,
        brands,
        error: 'برند انتخاب‌شده معتبر نیست.',
        mode: 'edit',
      });
    }
    if (brand.is_active === false && Number(brand.id) !== Number(product.brand_id)) {
      return res.render('admin_def_product_form', {
        user: req.session?.user || null,
        product: productForRender,
        brands,
        error: 'برند غیرفعال برای این کالا مجاز نیست.',
        mode: 'edit',
      });
    }

    const [duplicateSku, duplicateName] = await Promise.all([
      productsService.isSkuTaken(skuCode, id),
      productsService.isNameTaken({ brandId, name, excludeId: id }),
    ]);
    if (duplicateName) {
      return res.render('admin_def_product_form', {
        user: req.session?.user || null,
        product: productForRender,
        brands,
        error: 'کالایی با این نام در این برند وجود دارد.',
        mode: 'edit',
      });
    }

    if (duplicateSku) {
      return res.render('admin_def_product_form', {
        user: req.session?.user || null,
        product: productForRender,
        brands,
        error: 'کد کالا تکراری است.',
        mode: 'edit',
      });
    }

    await productsService.updateProduct({
      id,
      brandId,
      skuCode,
      name,
      aliases,
      isKey,
      isActive,
    });
    return res.redirect('/admin/definitions/products?ok=' + encodeURIComponent('کالا به‌روزرسانی شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/products/:id error:', err);
    return res.render('admin_def_product_form', {
      user: req.session?.user || null,
      product: productForRender,
      brands,
      error: 'خطا در به‌روزرسانی کالا.',
      mode: 'edit',
    });
  }
});

router.post('/definitions/products/:id/toggle', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/products?err=' + encodeURIComponent('شناسه کالا نامعتبر است.'));
  }

  try {
    const product = await productsService.getProductById(id);
    if (!product) {
      return res.redirect('/admin/definitions/products?err=' + encodeURIComponent('کالا یافت نشد.'));
    }

    await productsService.toggleProductActive(id);
    return res.redirect('/admin/definitions/products?ok=' + encodeURIComponent('وضعیت کالا تغییر کرد.'));
  } catch (err) {
    console.error('POST /admin/definitions/products/:id/toggle error:', err);
    return res.redirect('/admin/definitions/products?err=' + encodeURIComponent('خطا در تغییر وضعیت کالا.'));
  }
});

module.exports = router;
