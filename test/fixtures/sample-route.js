'use strict';

const express = require('express');
const router = express.Router();

router.get('/admin/dashboard', (req, res) => {
  res.render('admin/dashboard');
});

router.get('/admin/settings', (req, res) => {
  res.render('admin/settings');
});

router.get('/admin/settings/catalog', (req, res) => {
  res.render('admin/settings/catalog');
});

router.post('/admin/settings', (req, res) => {
  // Should be ignored (POST method)
  res.redirect('/admin/settings');
});

router.get('/admin/users/:id', (req, res) => {
  // Should be ignored (has parameter)
  res.render('admin/user-detail');
});

module.exports = router;
