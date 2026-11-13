'use strict';

const express = require('express');
const router = express.Router();
const { renderSettingsPlaceholder } = require('./_shared');

router.get('/settings/themes', (req, res) => renderSettingsPlaceholder(req, res, 'settings_themes', 'تم‌ها'));

router.get('/settings/company', (req, res) =>
  renderSettingsPlaceholder(req, res, 'settings_company', 'تنظیمات شرکت')
);

router.get('/settings/company/general', (req, res) =>
  renderSettingsPlaceholder(req, res, 'settings_company_general', 'اطلاعات عمومی', '/admin/settings/company')
);

router.get('/settings/company/telegram', (req, res) =>
  renderSettingsPlaceholder(req, res, 'settings_company_telegram', 'توکن تلگرام', '/admin/settings/company')
);

router.get('/settings/company/admin-profile', (req, res) =>
  renderSettingsPlaceholder(req, res, 'settings_company_profile', 'پروفایل ادمین', '/admin/settings/company')
);

router.get('/settings/company/automation-api', (req, res) =>
  renderSettingsPlaceholder(req, res, 'settings_company_api', 'API اتوماسیون', '/admin/settings/company')
);

router.get('/settings/training', (req, res) =>
  renderSettingsPlaceholder(req, res, 'settings_training', 'تنظیمات آموزش', '/admin/settings')
);

router.get('/settings/training/topics', (req, res) =>
  renderSettingsPlaceholder(req, res, 'settings_training_topics', 'موضوعات آموزش', '/admin/settings/training')
);

router.get('/settings/training/thresholds', (req, res) =>
  renderSettingsPlaceholder(req, res, 'settings_training_thresholds', 'آستانه‌های آموزش', '/admin/settings/training')
);

router.get('/settings/training/apis', (req, res) =>
  renderSettingsPlaceholder(req, res, 'settings_training_apis', 'API های آموزش', '/admin/settings/training')
);

module.exports = router;
