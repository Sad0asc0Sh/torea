'use strict';

const express = require('express');

const router = express.Router();

function redirectToSettings(target) {
  return (req, res) => {
    // Legacy training path: keep bookmark compatibility but serve new settings location
    const status = req.method === 'GET' ? 301 : 307;
    return res.redirect(status, target);
  };
}


router.all('/definitions/training-settings', redirectToSettings('/admin/settings/training-config'));
router.all('/definitions/training-topics', redirectToSettings('/admin/settings/training-topics'));
router.all('/definitions/training-topics/reorder', redirectToSettings('/admin/settings/training-topics/reorder'));
router.all('/definitions/training-topics/test', redirectToSettings('/admin/settings/training-topics/test'));

module.exports = router;
