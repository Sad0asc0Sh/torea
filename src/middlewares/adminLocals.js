'use strict';

module.exports = function adminLocals(req, res, next) {
  // prevent EJS 500 due to missing locals
  res.locals.user = (typeof res.locals.user !== 'undefined') ? res.locals.user : (req.user || null);
  res.locals.request = (typeof res.locals.request !== 'undefined') ? res.locals.request : req;

  res.locals.__activeKey = (typeof res.locals.__activeKey !== 'undefined') ? res.locals.__activeKey : null;

  res.locals.__theme = (typeof res.locals.__theme !== 'undefined') ? res.locals.__theme : 'default';
  res.locals.__themeDisabled = (typeof res.locals.__themeDisabled !== 'undefined') ? res.locals.__themeDisabled : false;

  res.locals.__isAdminTheme = (typeof res.locals.__isAdminTheme !== 'undefined') ? res.locals.__isAdminTheme : true;
  res.locals.__pageClass = (typeof res.locals.__pageClass !== 'undefined') ? res.locals.__pageClass : '';

  res.locals.__catalogKnownRoutes = Array.isArray(res.locals.__catalogKnownRoutes) ? res.locals.__catalogKnownRoutes : [];
  res.locals.__catalogAllowedRoutes = Array.isArray(res.locals.__catalogAllowedRoutes) ? res.locals.__catalogAllowedRoutes : [];
  res.locals.__catalogBypass = res.locals.__catalogBypass === true;
  res.locals.__menuFiltered = Array.isArray(res.locals.__menuFiltered) ? res.locals.__menuFiltered : [];

  next();
};
