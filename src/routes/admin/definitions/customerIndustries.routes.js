'use strict';

const express = require('express');
const customerIndustriesService = require('../../../services/customerIndustries.service');
const { toBool, toIntOrNull, safeMsg, normalizeTitle } = require('../../../utils/validators');

const router = express.Router();

function baseLocals(req, extra = {}) {
  return {
    user: req.session?.user || null,
    error: null,
    warn: null,
    info: null,
    ...extra,
  };
}


router.get('/definitions/customer-industries', async (req, res) => {
  try {
    const industries = await customerIndustriesService.listCustomerIndustries();
    return res.render(
      'admin/definitions/customer_industries',
      baseLocals(req, {
        industries,
        error: safeMsg(req.query && req.query.err),
        warn: safeMsg(req.query && req.query.warn),
        info: safeMsg(req.query && req.query.ok),
      })
    );
  } catch (err) {
    console.error('GET /admin/definitions/customer-industries error:', err);
    return res.render(
      'admin/definitions/customer_industries',
      baseLocals(req, {
        industries: [],
        error: 'خطا در خواندن لیست صنف‌ها.',
      })
    );
  }
});

router.get('/definitions/customer-industries/new', (req, res) => {
  return res.render(
    'admin/definitions/customer_industry_form',
    baseLocals(req, {
      industry: { title: '', sort_order: 0, is_active: true },
      mode: 'create',
    })
  );
});

router.get('/definitions/customer-industries/:id/edit', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/customer-industries?err=' + encodeURIComponent('شناسه نامعتبر است.'));
  }

  try {
    const industry = await customerIndustriesService.getCustomerIndustryById(id);
    if (!industry) {
      return res.redirect('/admin/definitions/customer-industries?err=' + encodeURIComponent('صنف یافت نشد.'));
    }

    return res.render(
      'admin/definitions/customer_industry_form',
      baseLocals(req, {
        industry,
        mode: 'edit',
      })
    );
  } catch (err) {
    console.error('GET /admin/definitions/customer-industries/:id/edit error:', err);
    return res.redirect('/admin/definitions/customer-industries?err=' + encodeURIComponent('خطا در بارگذاری فرم.'));
  }
});

router.post('/definitions/customer-industries', async (req, res) => {
  const title = normalizeTitle(req.body?.title);
  const sortOrder = toIntOrNull(req.body?.sort_order) ?? 0;
  const isActive = toBool(req.body?.is_active ?? true);

  const industryForRender = { title, sort_order: sortOrder, is_active: isActive };

  if (!title) {
    return res.render(
      'admin/definitions/customer_industry_form',
      baseLocals(req, {
        industry: industryForRender,
        error: 'عنوان صنف الزامی است.',
        mode: 'create',
      })
    );
  }

  try {
    const duplicateTitle = await customerIndustriesService.isTitleTaken(title, null);
    if (duplicateTitle) {
      return res.render(
        'admin/definitions/customer_industry_form',
        baseLocals(req, {
          industry: industryForRender,
          error: 'صنف دیگری با این عنوان وجود دارد.',
          mode: 'create',
        })
      );
    }

    await customerIndustriesService.createCustomerIndustry({
      title,
      sortOrder,
      isActive,
    });
    return res.redirect('/admin/definitions/customer-industries?ok=' + encodeURIComponent('صنف ثبت شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/customer-industries error:', err);
    return res.render(
      'admin/definitions/customer_industry_form',
      baseLocals(req, {
        industry: industryForRender,
        error: 'خطا در ثبت صنف.',
        mode: 'create',
      })
    );
  }
});

router.post('/definitions/customer-industries/:id', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/customer-industries?err=' + encodeURIComponent('شناسه نامعتبر است.'));
  }

  const title = normalizeTitle(req.body?.title);
  const sortOrder = toIntOrNull(req.body?.sort_order) ?? 0;
  const isActive = toBool(req.body?.is_active);

  let industry = null;
  try {
    industry = await customerIndustriesService.getCustomerIndustryById(id);
  } catch (err) {
    console.error('POST /admin/definitions/customer-industries/:id preload error:', err);
  }

  if (!industry) {
    return res.redirect('/admin/definitions/customer-industries?err=' + encodeURIComponent('صنف یافت نشد.'));
  }

  const industryForRender = { ...industry, title, sort_order: sortOrder, is_active: isActive };

  if (!title) {
    return res.render(
      'admin/definitions/customer_industry_form',
      baseLocals(req, {
        industry: industryForRender,
        error: 'عنوان صنف الزامی است.',
        mode: 'edit',
      })
    );
  }

  try {
    const duplicateTitle = await customerIndustriesService.isTitleTaken(title, id);
    if (duplicateTitle) {
      return res.render(
        'admin/definitions/customer_industry_form',
        baseLocals(req, {
          industry: industryForRender,
          error: 'صنف دیگری با این عنوان وجود دارد.',
          mode: 'edit',
        })
      );
    }

    await customerIndustriesService.updateCustomerIndustry({
      id,
      title,
      sortOrder,
      isActive,
    });
    return res.redirect('/admin/definitions/customer-industries?ok=' + encodeURIComponent('صنف به‌روزرسانی شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/customer-industries/:id error:', err);
    return res.render(
      'admin/definitions/customer_industry_form',
      baseLocals(req, {
        industry: industryForRender,
        error: 'خطا در به‌روزرسانی صنف.',
        mode: 'edit',
      })
    );
  }
});

router.post('/definitions/customer-industries/:id/toggle', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/customer-industries?err=' + encodeURIComponent('شناسه نامعتبر است.'));
  }

  try {
    const updated = await customerIndustriesService.toggleCustomerIndustryActive(id);
    if (!updated) {
      return res.redirect('/admin/definitions/customer-industries?err=' + encodeURIComponent('صنف یافت نشد.'));
    }
    return res.redirect('/admin/definitions/customer-industries?ok=' + encodeURIComponent('وضعیت به‌روزرسانی شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/customer-industries/:id/toggle error:', err);
    return res.redirect('/admin/definitions/customer-industries?err=' + encodeURIComponent('خطا در تغییر وضعیت صنف.'));
  }
});

module.exports = router;
