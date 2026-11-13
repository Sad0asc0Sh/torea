const FLOW_STAGES = {
  REGISTERED: 'REGISTERED',
  PRE_REGISTER_OK: 'PRE_REGISTER_OK',
  NEED_TG_2FA: 'NEED_TG_2FA',
};

const TELEGRAM_ALLOWED_STAGES = [FLOW_STAGES.PRE_REGISTER_OK, FLOW_STAGES.NEED_TG_2FA];

function resolveRedirect(redirectTo, flow) {
  if (typeof redirectTo === 'function') return redirectTo(flow) || '/login';
  return redirectTo || '/login';
}

function requireAuthFlow(allowedStages = [], redirectTo = '/login') {
  return (req, res, next) => {
    const flow = req.session?.authFlow;
    if (!flow) return res.redirect(resolveRedirect(redirectTo, flow));
    if (Array.isArray(allowedStages) && allowedStages.length > 0) {
      const stage = flow.stage;
      if (!stage || !allowedStages.includes(stage)) {
        return res.redirect(resolveRedirect(redirectTo, flow));
      }
    }
    return next();
  };
}

function requireLoggedIn(redirectTo = '/login') {
  return (req, res, next) => {
    if (req.session?.user) return next();
    return res.redirect(redirectTo);
  };
}

function blockIfLoggedIn(redirectTo = '/pending') {
  return (req, res, next) => {
    if (req.session?.user) return res.redirect(redirectTo);
    return next();
  };
}

module.exports = { requireAuthFlow, requireLoggedIn, blockIfLoggedIn, FLOW_STAGES, TELEGRAM_ALLOWED_STAGES };
