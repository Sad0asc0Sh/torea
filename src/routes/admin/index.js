'use strict';

const express = require('express');
const adminLocals = require('../../middlewares/adminLocals');
const router = express.Router();

router.get('/difinations', (req, res) => res.redirect(301, '/admin/definitions'));


router.use(adminLocals);

// Import shared module routers (customers, credit, reports)
const customersRoutes = require('../modules/customers.routes');
const creditSaleRoutes = require('../modules/credit/sale.routes');
const creditSettlementRoutes = require('../modules/credit/settlement.routes');
const reportsRoutes = require('../modules/reports.routes');
const inboxRoutes = require('./inbox.routes');

// Import sub-routers
const adminPagesRoutes = require('./pages.routes');
const definitionsRoutes = require('./definitions');
const settingsRoutes = require('./settings');
const toolsRoutes = require('./tools');
const balanceRoutes = require('./balance');

// Mount definitions under /definitions first to avoid page stubs shadowing them
router.use((req, res, next) => {
  if (!req.path.startsWith('/definitions')) return next();
  return definitionsRoutes(req, res, next);
});

// Mount admin pages (dashboard, reports, approvals, hierarchy, etc.)
router.use(adminPagesRoutes);

// Mount shared module routes (customers, credit, reports, inbox)
router.use(customersRoutes);
router.use(creditSaleRoutes);
router.use(creditSettlementRoutes);
router.use(reportsRoutes);
router.use(inboxRoutes);

// Admin balance/credit module
router.use(balanceRoutes);

// Mount tools under /tools
router.use(toolsRoutes);

// Mount admin settings
router.use(settingsRoutes);

module.exports = router;
