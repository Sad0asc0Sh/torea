'use strict';

const express = require('express');

const router = express.Router();

// Legacy admin users routes -> redirect to canonical definitions
router.get('/users', (req, res) => {
  return res.redirect(301, '/admin/definitions/users');
});

router.get('/users/:id/edit', (req, res) => {
  const id = req.params.id;
  return res.redirect(301, `/admin/definitions/users/${id}/edit`);
});

router.post('/users/:id/edit', (req, res) => {
  const id = req.params.id;
  return res.redirect(301, `/admin/definitions/users/${id}/edit`);
});

router.post('/users/:id/delete', (req, res) => {
  const id = req.params.id;
  return res.redirect(301, `/admin/definitions/users/${id}/delete`);
});

module.exports = router;
