'use strict';

async function verifyLicenseOnBoot(logger = console) {
  try {
    const licenseKey = process.env.SOFTWARE_LICENSE_KEY || null;
    if (!licenseKey) {
      logger?.warn?.('License guard placeholder: no SOFTWARE_LICENSE_KEY provided; skipping enforcement.');
      return true;
    }
    logger?.info?.('License guard placeholder executed (validation hook not implemented).');
    return true;
  } catch (err) {
    logger?.warn?.('License guard placeholder failed:', err?.message || err);
    return false;
  }
}

module.exports = { verifyLicenseOnBoot };
