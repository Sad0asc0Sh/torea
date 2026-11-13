'use strict';

const express = require('express');
const brandsService = require('../services/brands.service');

const router = express.Router();

function ensureSystemAdmin(req, res, next) {
  const role = (req.session?.user?.role || '').toUpperCase();
  if (role !== 'SYSTEM_ADMIN') {
    return res.status(403).render('unauthorized', baseLocals(req));
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

function normalizeCode(raw) {
  const c = (raw || '').toString().trim();
  return c ? c : null;
}

function normalizeManagerUserId(raw) {
  const v = (raw || '').toString().trim();
  return v ? v : null;
}

async function loadManagersSafe() {
  try {
    return await brandsService.listActiveUsersForManagerSelect();
  } catch (err) {
    console.error('brands managers preload error:', err);
    return [];
  }
}

function baseLocals(req, extra = {}) {
  return {
    user: req.session?.user || null,
    error: null,
    warn: null,
    info: null,
    ...extra,
  };
}

router.use(ensureSystemAdmin);

router.get('/definitions/brands', async (req, res) => {
  try {
    const brands = await brandsService.listBrandsWithCounts();
    return res.render(
      'definitions/brands',
      baseLocals(req, {
        brands,
        error: safeMsg(req.query && req.query.err),
        info: safeMsg(req.query && req.query.ok),
        warn: safeMsg(req.query && req.query.warn),
      })
    );
  } catch (err) {
    console.error('GET /admin/definitions/brands error:', err);
    return res.render(
      'definitions/brands',
      baseLocals(req, {
        brands: [],
        error: 'خطا در خواندن لیست برندها.',
      })
    );
  }
});

router.get('/definitions/brands/new', async (req, res) => {
  try {
    const managers = await loadManagersSafe();
    return res.render(
      'admin_def_brand_form',
      baseLocals(req, {
        brand: { name: '', code: '', is_active: true, manager_user_id: null },
        managers,
        mode: 'create',
      })
    );
  } catch (err) {
    console.error('GET /admin/definitions/brands/new error:', err);
    return res.render(
      'admin_def_brand_form',
      baseLocals(req, {
        brand: { name: '', code: '', is_active: true, manager_user_id: null },
        managers: [],
        error: 'خطا در بارگذاری فرم.',
        mode: 'create',
      })
    );
  }
});

router.get('/definitions/brands/:id/edit', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/brands?err=' + encodeURIComponent('شناسه برند نامعتبر است.'));
  }

  try {
    const [brand, managers] = await Promise.all([
      brandsService.getBrandById(id),
      loadManagersSafe(),
    ]);
    if (!brand) {
      return res.redirect('/admin/definitions/brands?err=' + encodeURIComponent('برند یافت نشد.'));
    }

    return res.render(
      'admin_def_brand_form',
      baseLocals(req, {
        brand,
        managers,
        mode: 'edit',
      })
    );
  } catch (err) {
    console.error('GET /admin/definitions/brands/:id/edit error:', err);
    return res.redirect('/admin/definitions/brands?err=' + encodeURIComponent('خطا در بارگذاری فرم.'));
  }
});

router.post('/definitions/brands', async (req, res) => {
  const name = (req.body?.name || '').toString().trim();
  const codeRaw = (req.body?.code || '').toString();
  const code = normalizeCode(codeRaw);
  const isActive = toBool(req.body?.is_active ?? true);
  const managerUserId = normalizeManagerUserId(req.body?.manager_user_id);

  const managers = await loadManagersSafe();

  const brandForRender = { name, code: codeRaw.trim(), is_active: isActive, manager_user_id: managerUserId };

  if (!name) {
    return res.render(
      'admin_def_brand_form',
      baseLocals(req, {
        brand: brandForRender,
        managers,
        error: 'نام برند الزامی است.',
        mode: 'create',
      })
    );
  }

  try {
    const [duplicateName, duplicateCode] = await Promise.all([
      brandsService.isNameTaken(name, null),
      brandsService.isCodeTaken(code, null),
    ]);

    if (duplicateName) {
      return res.render(
        'admin_def_brand_form',
        baseLocals(req, {
          brand: brandForRender,
          managers,
          error: 'برندی با این نام وجود دارد.',
          mode: 'create',
        })
      );
    }

    if (duplicateCode) {
      return res.render(
        'admin_def_brand_form',
        baseLocals(req, {
          brand: brandForRender,
          managers,
          error: 'کد برند تکراری است.',
          mode: 'create',
        })
      );
    }

    await brandsService.createBrand({ name, code, isActive, managerUserId });
    return res.redirect('/admin/definitions/brands?ok=' + encodeURIComponent('برند با موفقیت ایجاد شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/brands error:', err);
    return res.render(
      'admin_def_brand_form',
      baseLocals(req, {
        brand: brandForRender,
        managers,
        error: 'خطا در ایجاد برند.',
        mode: 'create',
      })
    );
  }
});

router.post('/definitions/brands/:id', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/brands?err=' + encodeURIComponent('شناسه برند نامعتبر است.'));
  }

  const name = (req.body?.name || '').toString().trim();
  const codeRaw = (req.body?.code || '').toString();
  const code = normalizeCode(codeRaw);
  const isActive = toBool(req.body?.is_active);
  const managerUserId = normalizeManagerUserId(req.body?.manager_user_id);

  let brand = null;
  let managers = [];
  try {
    const [brandRow, managersRes] = await Promise.all([
      brandsService.getBrandById(id),
      loadManagersSafe(),
    ]);
    brand = brandRow;
    managers = managersRes;
  } catch (err) {
    console.error('POST /admin/definitions/brands/:id preload error:', err);
  }

  if (!brand) {
    return res.redirect('/admin/definitions/brands?err=' + encodeURIComponent('برند یافت نشد.'));
  }

  const brandForRender = { ...brand, name, code: codeRaw.trim(), is_active: isActive, manager_user_id: managerUserId };

  if (!name) {
    return res.render(
      'admin_def_brand_form',
      baseLocals(req, {
        brand: brandForRender,
        managers,
        error: 'نام برند الزامی است.',
        mode: 'edit',
      })
    );
  }

  try {
    const [duplicateName, duplicateCode] = await Promise.all([
      brandsService.isNameTaken(name, id),
      brandsService.isCodeTaken(code, id),
    ]);

    if (duplicateName) {
      return res.render(
        'admin_def_brand_form',
        baseLocals(req, {
          brand: brandForRender,
          managers,
          error: 'برندی با این نام وجود دارد.',
          mode: 'edit',
        })
      );
    }

    if (duplicateCode) {
      return res.render(
        'admin_def_brand_form',
        baseLocals(req, {
          brand: brandForRender,
          managers,
          error: 'کد برند تکراری است.',
          mode: 'edit',
        })
      );
    }

    await brandsService.updateBrand({ id, name, code, isActive, managerUserId });
    return res.redirect('/admin/definitions/brands?ok=' + encodeURIComponent('برند به‌روزرسانی شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/brands/:id error:', err);
    return res.render(
      'admin_def_brand_form',
      baseLocals(req, {
        brand: brandForRender,
        managers,
        error: 'خطا در به‌روزرسانی برند.',
        mode: 'edit',
      })
    );
  }
});

router.post('/definitions/brands/:id/toggle', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/brands?err=' + encodeURIComponent('شناسه برند نامعتبر است.'));
  }

  try {
    const brand = await brandsService.getBrandById(id);
    if (!brand) {
      return res.redirect('/admin/definitions/brands?err=' + encodeURIComponent('برند یافت نشد.'));
    }

    let warnMsg = null;
    if (brand.is_active) {
      const productCount = await brandsService.countProducts(id);
      if (productCount > 0) {
        warnMsg = `این برند ${productCount} محصول دارد. در صورت نیاز وضعیت کالاها را هم بررسی کنید.`;
      }
    }

    await brandsService.toggleBrandActive(id);
    const params = new URLSearchParams();
    params.set('ok', 'وضعیت برند تغییر کرد.');
    if (warnMsg) params.set('warn', warnMsg);
    const qs = params.toString();
    return res.redirect('/admin/definitions/brands' + (qs ? `?${qs}` : ''));
  } catch (err) {
    console.error('POST /admin/definitions/brands/:id/toggle error:', err);
    return res.redirect('/admin/definitions/brands?err=' + encodeURIComponent('خطا در تغییر وضعیت برند.'));
  }
});

module.exports = router;
