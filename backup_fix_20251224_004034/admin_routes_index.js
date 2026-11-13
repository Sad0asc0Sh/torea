'use strict';

const express = require('express');
const router = express.Router();

// Import sub-routers
const adminPagesRoutes = require('./pages.routes');
const definitionsRoutes = require('./definitions');
const settingsRoutes = require('./settings');
const toolsRoutes = require('./tools');
const balanceRoutes = require('./balance');

// Mount definitions under /definitions first to avoid page stubs shadowing them
router.use(definitionsRoutes);

// Mount admin pages (dashboard, reports, approvals, hierarchy, etc.)
router.use(adminPagesRoutes);

// Admin balance/credit module
router.use(balanceRoutes);

// Mount tools under /tools
router.use(toolsRoutes);

// Mount admin settings
router.use(settingsRoutes);

module.exports = router;
