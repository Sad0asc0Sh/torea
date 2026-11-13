'use strict';

const express = require('express');
const router = express.Router();
const { renderSettingsPage } = require('./_shared');

// Mount sub-routers
router.use(require('./training.routes'));
router.use(require('./apis.routes'));
router.use(require('./catalog.routes'));
router.use(require('./catalogManager.routes'));
router.use(require('./orgPermissions.routes'));
router.use(require('./placeholders.routes'));

// Main settings page
router.get('/settings', (req, res) => renderSettingsPage(req, res, 'admin/settings/index'));

module.exports = router;
