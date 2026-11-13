'use strict';

const express = require('express');
const teamsService = require('../../../services/teams.service');

const router = express.Router();

function toBool(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

function toIntOrNull(value) {
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function safeMsg(v) {
  if (!v) return null;
  const s = String(v);
  return s.length > 2000 ? s.slice(0, 2000) : s;
}

function normalizeTeam(row) {
  if (!row) return null;
  const active = row.active ?? row.is_active ?? false;
  return { ...row, active };
}

function sanitizeMeta(meta = {}) {
  const clean = {};
  Object.entries(meta).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value === null) {
      clean[key] = null;
      return;
    }
    const str = typeof value === 'string' ? value : String(value);
    clean[key] = str.length > 120 ? str.slice(0, 120) + '…' : str;
  });
  return clean;
}

function makeDbLogger(reqId, teamId) {
  return (label, startedAt, meta) => {
    const ms = Date.now() - startedAt;
    const payload = sanitizeMeta({ teamId, ...(meta || {}) });
    const base = `[members] req=${reqId} ${label} ms=${ms}`;
    console.log(`${base} meta=${JSON.stringify(payload)}`);
    if (ms > 2000) {
      console.warn(`[members-slow] req=${reqId} ${label} ms=${ms} meta=${JSON.stringify(payload)}`);
    }
  };
}


router.get('/definitions/teams', async (req, res) => {
  try {
    const teamsRaw = await teamsService.listTeamsWithCounts();
    const teams = (teamsRaw || []).map(normalizeTeam);
    const error = safeMsg(req.query && req.query.err) || null;
    const info = safeMsg(req.query && req.query.ok) || null;
    const warn = safeMsg(req.query && req.query.warn) || null;
    return res.render('admin/definitions/teams', {
      user: req.session?.user || null,
      teams,
      error,
      info,
      warn,
    });
  } catch (err) {
    console.error('GET /admin/definitions/teams error:', err);
    return res.render('admin/definitions/teams', {
      user: req.session?.user || null,
      teams: [],
      error: 'خطا در خواندن لیست تیم‌ها.',
      warn: null,
      info: null,
    });
  }
});

router.get('/definitions/teams/new', async (req, res) => {
  try {
    const orgNodes = await teamsService.listOrgNodes();
    return res.render('admin/definitions/team_form', {
      user: req.session?.user || null,
      team: { name: '', active: true, org_node_id: null },
      orgNodes,
      error: null,
      warn: null,
      info: null,
      mode: 'create',
    });
  } catch (err) {
    console.error('GET /admin/definitions/teams/new error:', err);
    return res.render('admin/definitions/team_form', {
      user: req.session?.user || null,
      team: { name: '', active: true, org_node_id: null },
      orgNodes: [],
      error: 'خطا در بارگذاری فرم.',
      warn: null,
      info: null,
      mode: 'create',
    });
  }
});

router.get('/definitions/teams/:id/edit', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('شناسه تیم نامعتبر است.'));
  }

  try {
    const [teamRaw, orgNodes] = await Promise.all([
      teamsService.getTeamById(id),
      teamsService.listOrgNodes(),
    ]);
    const team = normalizeTeam(teamRaw);
    if (!team) {
      return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('تیم یافت نشد.'));
    }

    return res.render('admin/definitions/team_form', {
      user: req.session?.user || null,
      team,
      orgNodes,
      error: null,
      warn: null,
      info: null,
      mode: 'edit',
    });
  } catch (err) {
    console.error('GET /admin/definitions/teams/:id/edit error:', err);
    return res.render('admin/definitions/teams', {
      user: req.session?.user || null,
      teams: [],
      error: 'خطا در بارگذاری فرم.',
      warn: null,
      info: null,
    });
  }
});

router.post('/definitions/teams', async (req, res) => {
  const name = (req.body?.name || '').toString().trim();
  const isActive = toBool(req.body?.is_active ?? true);
  const orgNodeId = toIntOrNull(req.body?.org_node_id);

  let orgNodes = [];
  try {
    orgNodes = await teamsService.listOrgNodes();
  } catch (err) {
    console.error('POST /admin/definitions/teams preload error:', err);
  }

  const teamForRender = { name, active: isActive, org_node_id: orgNodeId };

  if (!name || name.length < 2) {
    return res.render('admin/definitions/team_form', {
      user: req.session?.user || null,
      team: teamForRender,
      orgNodes,
      error: 'نام تیم الزامی است و باید حداقل ۲ حرف باشد.',
      warn: null,
      info: null,
      mode: 'create',
    });
  }

  if (orgNodeId && !orgNodes.find((n) => Number(n.id) === Number(orgNodeId))) {
    return res.render('admin/definitions/team_form', {
      user: req.session?.user || null,
      team: teamForRender,
      orgNodes,
      error: 'سمت سازمانی انتخاب‌شده معتبر نیست.',
      warn: null,
      info: null,
      mode: 'create',
    });
  }

  try {
    const duplicate = await teamsService.isNameTaken(name, null);
    if (duplicate) {
      return res.render('admin/definitions/team_form', {
        user: req.session?.user || null,
        team: teamForRender,
        orgNodes,
        error: 'تیمی با این نام وجود دارد.',
        warn: null,
        info: null,
        mode: 'create',
      });
    }

    await teamsService.createTeam({ name, active: isActive, orgNodeId });
    return res.redirect('/admin/definitions/teams?ok=' + encodeURIComponent('تیم با موفقیت ایجاد شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/teams error:', err);
    return res.render('admin/definitions/team_form', {
      user: req.session?.user || null,
      team: teamForRender,
      orgNodes,
      error: 'خطا در ایجاد تیم.',
      warn: null,
      info: null,
      mode: 'create',
    });
  }
});

router.post('/definitions/teams/:id', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('شناسه تیم نامعتبر است.'));
  }

  const name = (req.body?.name || '').toString().trim();
  const isActive = toBool(req.body?.is_active);
  const orgNodeId = toIntOrNull(req.body?.org_node_id);

  let team = null;
  let orgNodes = [];
  try {
    const [teamRaw, orgNodesRes] = await Promise.all([
      teamsService.getTeamById(id),
      teamsService.listOrgNodes(),
    ]);
    team = normalizeTeam(teamRaw);
    orgNodes = orgNodesRes;
  } catch (err) {
    console.error('POST /admin/definitions/teams/:id preload error:', err);
  }

  if (!team) {
    return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('تیم یافت نشد.'));
  }

  const teamForRender = { ...team, name, active: isActive, org_node_id: orgNodeId };

  if (!name || name.length < 2) {
    return res.render('admin/definitions/team_form', {
      user: req.session?.user || null,
      team: teamForRender,
      orgNodes,
      error: 'نام تیم الزامی است و باید حداقل ۲ حرف باشد.',
      warn: null,
      info: null,
      mode: 'edit',
    });
  }

  if (orgNodeId && !orgNodes.find((n) => Number(n.id) === Number(orgNodeId))) {
    return res.render('admin/definitions/team_form', {
      user: req.session?.user || null,
      team: teamForRender,
      orgNodes,
      error: 'سمت سازمانی انتخاب‌شده معتبر نیست.',
      warn: null,
      info: null,
      mode: 'edit',
    });
  }

  try {
    const duplicate = await teamsService.isNameTaken(name, id);
    if (duplicate) {
      return res.render('admin/definitions/team_form', {
        user: req.session?.user || null,
        team: teamForRender,
        orgNodes,
        error: 'تیمی با این نام وجود دارد.',
        warn: null,
        info: null,
        mode: 'edit',
      });
    }

    await teamsService.updateTeam({ id, name, active: isActive, orgNodeId });
    return res.redirect('/admin/definitions/teams?ok=' + encodeURIComponent('تیم به‌روزرسانی شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/teams/:id error:', err);
    return res.render('admin/definitions/team_form', {
      user: req.session?.user || null,
      team: teamForRender,
      orgNodes,
      error: 'خطا در به‌روزرسانی تیم.',
      warn: null,
      info: null,
      mode: 'edit',
    });
  }
});

router.post('/definitions/teams/:id/toggle', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('شناسه تیم نامعتبر است.'));
  }
  try {
    const team = await teamsService.getTeamById(id);
    if (!team) {
      return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('تیم یافت نشد.'));
    }
    await teamsService.toggleTeamActive(id);
    return res.redirect('/admin/definitions/teams?ok=' + encodeURIComponent('وضعیت تیم تغییر کرد.'));
  } catch (err) {
    console.error('POST /admin/definitions/teams/:id/toggle error:', err);
    return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('خطا در تغییر وضعیت تیم.'));
  }
});

router.post('/definitions/teams/:id/delete', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('شناسه تیم نامعتبر است.'));
  }

  try {
    const deleted = await teamsService.deleteTeam(id);
    if (!deleted) {
      return res.redirect('/admin/definitions/teams?warn=' + encodeURIComponent('تیم یافت نشد.'));
    }
    return res.redirect('/admin/definitions/teams?ok=' + encodeURIComponent('تیم حذف شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/teams/:id/delete error:', err);
    const msg = err && err.message && err.message.includes('constraint')
      ? 'این تیم در رکوردهای دیگر استفاده شده است.'
      : 'خطا در حذف تیم.';
    return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent(msg));
  }
});

router.get('/definitions/teams/:id/members', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('شناسه تیم نامعتبر است.'));
  }

  const reqId = req.id || `mem-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const logStep = makeDbLogger(reqId, id);

  try {
    const tTeam = Date.now();
    const team = await teamsService.getTeamById(id, {
      statementTimeoutMs: 4000,
      debugLabel: `[members:${reqId}] getTeamById`,
    });
    logStep('getTeamById', tTeam);
    if (!team) {
      return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('تیم یافت نشد.'));
    }

    const tMembers = Date.now();
    let members = [];
    try {
      members = await teamsService.listTeamMembers(id, {
        statementTimeoutMs: 8000,
        limit: 500,
        debugLabel: `[members:${reqId}] listTeamMembers`,
      });
      logStep('listTeamMembers', tMembers, { limit: 500 });
    } catch (memberErr) {
      console.error(`[members] req=${reqId} listTeamMembers failed:`, memberErr);
      return res.render('admin/definitions/team_members', {
        user: req.session?.user || null,
        team,
        members: [],
        searchResults: [],
        q: '',
        error: 'خطا در بارگذاری اعضای تیم. لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.',
        info: null,
        warn: null,
      });
    }

    return res.render('admin/definitions/team_members', {
      user: req.session?.user || null,
      team,
      members: members || [],
      searchResults: [],
      q: '',
      error: safeMsg(req.query && req.query.err) || null,
      info: safeMsg(req.query && req.query.ok) || null,
      warn: safeMsg(req.query && req.query.warn) || null,
    });
  } catch (err) {
    console.error(`GET /admin/definitions/teams/:id/members req=${reqId} error:`, err);
    // Try to render error page instead of redirecting
    return res.status(500).render('admin/definitions/team_members', {
      user: req.session?.user || null,
      team: { id, name: 'نامشخص' },
      members: [],
      searchResults: [],
      q: '',
      error: 'خطای سرور در بارگذاری صفحه. لطفاً با مدیر سیستم تماس بگیرید.',
      info: null,
      warn: null,
    });
  }
});

router.get('/definitions/teams/:id/members/candidates', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.status(400).json({ error: 'شناسه تیم نامعتبر است.', results: [] });
  }

  const reqId = req.id || `mem-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const logStep = makeDbLogger(reqId, id);

  const query = (req.query.q ?? req.query.query ?? req.query.search ?? '').toString().trim();
  if (!query || query.length < 2) {
    return res.json({ results: [] });
  }

  try {
    const tTeam = Date.now();
    const team = await teamsService.getTeamById(id, {
      statementTimeoutMs: 3000,
      debugLabel: `[members:${reqId}] getTeamForCandidates`,
    });
    logStep('getTeamById', tTeam);
    if (!team) {
      return res.status(404).json({ error: 'تیم یافت نشد.', results: [] });
    }

    const tCandidates = Date.now();
    const candidates = await teamsService.listCandidateUsers(team.org_node_id, query, {
      limit: 50,
      statementTimeoutMs: 4000,
      debugLabel: `[members:${reqId}] listCandidateUsers`,
      teamIdForValidation: id,
    });
    logStep('listCandidateUsers', tCandidates, {
      q: query,
      limit: 50,
      returned: (candidates || []).length,
    });

    return res.json({ results: (candidates || []).slice(0, 50) });
  } catch (err) {
    console.error(`[members] req=${reqId} candidates error:`, err);
    return res.status(500).json({ error: 'خطا در جستجو.', results: [] });
  }
});

router.post('/definitions/teams/:id/members/add', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  const { value: userId, error: userIdError } = teamsService.normalizeUserId(req.body?.user_id);
  const allowReassign = toBool(req.body?.allow_reassign);

  if (!id) {
    return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('شناسه تیم نامعتبر است.'));
  }

  if (!userId) {
    return res.redirect(
      `/admin/definitions/teams/${id}/members?err=` + encodeURIComponent(userIdError || 'شناسه کاربر نامعتبر است.')
    );
  }

  try {
    const team = await teamsService.getTeamById(id);
    if (!team) {
      return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('تیم یافت نشد.'));
    }

    const user = await teamsService.findUserById(userId);
    if (!user || !user.active) {
      return res.redirect(`/admin/definitions/teams/${id}/members?err=` + encodeURIComponent('کاربر فعال یافت نشد.'));
    }

    const result = await teamsService.addMemberCascade(id, userId, { allowReassign });
    const successCount = (result.added || 0) + (result.reassigned || 0) + (result.alreadyInTeam || 0);
    const skippedOther = result.skippedOtherTeam || 0;
    const skippedErrors = result.skippedErrors || 0;

    if (successCount > 0) {
      const msg = `${successCount} نفر به تیم اضافه/منتقل شدند (به همراه زیرمجموعه‌ها). ${skippedOther} نفر به دلیل عضویت در تیم دیگر اضافه نشدند.` +
        (skippedErrors ? ` ${skippedErrors} نفر به علت تعارض سلسله‌مراتب اضافه نشدند.` : '');
      return res.redirect(`/admin/definitions/teams/${id}/members?ok=` + encodeURIComponent(msg));
    }
    const warnMsg = skippedOther
      ? 'هیچ عضوی اضافه نشد؛ همه کاربران انتخاب‌شده در تیم دیگری هستند.'
      : 'هیچ تغییری انجام نشد.';
    return res.redirect(`/admin/definitions/teams/${id}/members?warn=` + encodeURIComponent(warnMsg));
  } catch (err) {
    const code = err?.code;
    if (code === 'ERR_ALREADY_ASSIGNED_OTHER_TEAM') {
      const tId = err.meta?.assignedTeamId ?? err.assignedTeamId /* legacy */ ?? 'نامشخص';
      return res.redirect(
        `/admin/definitions/teams/${id}/members?err=` +
          encodeURIComponent(`این کاربر قبلاً در تیم دیگری عضو است و نمی‌توان او را اضافه کرد. (تیم: ${tId})`)
      );
    }
    if (code === 'ERR_IMPLICIT_SAME_TEAM') {
      return res.redirect(
        `/admin/definitions/teams/${id}/members?err=` +
          encodeURIComponent('یکی از مدیران این کاربر عضو همین تیم است؛ افزودن مستقیم لازم نیست.')
      );
    }
    if (code === 'ERR_IMPLICIT_OTHER_TEAM') {
      const tId = err.meta?.assignedTeamId ?? err.assignedTeamId /* legacy */ ?? 'نامشخص';
      return res.redirect(
        `/admin/definitions/teams/${id}/members?err=` +
          encodeURIComponent(`یکی از مدیران این کاربر در تیم دیگری عضو است و نمی‌توان او را اضافه کرد. (تیم: ${tId})`)
      );
    }
    console.error('POST /admin/definitions/teams/:id/members/add error:', err);
    return res.redirect(`/admin/definitions/teams/${id}/members?err=` + encodeURIComponent('خطا در افزودن عضو.'));
  }
});

router.post('/definitions/teams/:id/members/remove', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  const { value: userId, error: userIdError } = teamsService.normalizeUserId(req.body?.user_id);
  if (!id) {
    return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('شناسه تیم نامعتبر است.'));
  }
  if (!userId) {
    return res.redirect(
      `/admin/definitions/teams/${id}/members?err=` + encodeURIComponent(userIdError || 'شناسه کاربر نامعتبر است.')
    );
  }

  try {
    const team = await teamsService.getTeamById(id);
    if (!team) {
      return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('تیم یافت نشد.'));
    }

    await teamsService.removeMember(id, userId);
    return res.redirect(`/admin/definitions/teams/${id}/members?ok=` + encodeURIComponent('عضو حذف شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/teams/:id/members/remove error:', err);
    return res.redirect(`/admin/definitions/teams/${id}/members?err=` + encodeURIComponent('خطا در حذف عضو.'));
  }
});

// --- TEAM BRANDS UI ---
router.get('/definitions/teams/:id/brands', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('شناسه تیم نامعتبر است.'));
  try {
    const [team, teamBrands, allBrands] = await Promise.all([
      teamsService.getTeamById(id),
      teamsService.listTeamBrands(id),
      teamsService.listActiveBrandsSimple(),
    ]);
    if (!team) return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('تیم یافت نشد.'));
    return res.render('admin/definitions/team_brands', {
      user: req.session?.user || null,
      team,
      teamBrands: teamBrands || [],
      allBrands: allBrands || [],
      query: '',
      error: null,
    });
  } catch (err) {
    console.error('GET /admin/definitions/teams/:id/brands error:', err);
    return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('خطا در بارگذاری برندهای تیم.'));
  }
});

router.post('/definitions/teams/:id/brands/add', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('شناسه تیم نامعتبر است.'));
  try {
    const brandId = Number(req.body?.brand_id);
    const priorityRaw = req.body?.priority;
    const priority = (priorityRaw === undefined || priorityRaw === null || String(priorityRaw).trim()==='') ? null : Number(priorityRaw);
    if (!brandId) {
      return res.redirect(`/admin/definitions/teams/${id}/brands?err=` + encodeURIComponent('انتخاب برند الزامی است.'));
    }
    await teamsService.addTeamBrand(id, brandId, priority);
    return res.redirect(`/admin/definitions/teams/${id}/brands?ok=` + encodeURIComponent('برند به تیم اضافه شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/teams/:id/brands/add error:', err);
    return res.redirect(`/admin/definitions/teams/${id}/brands?err=` + encodeURIComponent('خطا در افزودن برند.'));
  }
});

router.post('/definitions/teams/:id/brands/remove', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) return res.redirect('/admin/definitions/teams?err=' + encodeURIComponent('شناسه تیم نامعتبر است.'));
  try {
    const brandId = Number(req.body?.brand_id);
    if (!brandId) {
      return res.redirect(`/admin/definitions/teams/${id}/brands?err=` + encodeURIComponent('شناسه برند نامعتبر است.'));
    }
    await teamsService.removeTeamBrand(id, brandId);
    return res.redirect(`/admin/definitions/teams/${id}/brands?ok=` + encodeURIComponent('برند از تیم حذف شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/teams/:id/brands/remove error:', err);
    return res.redirect(`/admin/definitions/teams/${id}/brands?err=` + encodeURIComponent('خطا در حذف برند.'));
  }
});

module.exports = router;
