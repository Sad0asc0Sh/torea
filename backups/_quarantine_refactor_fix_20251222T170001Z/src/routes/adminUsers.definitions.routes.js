const express = require('express');
const bcrypt = require('bcryptjs');
const usersService = require('../services/users.service');

const router = express.Router();

function ensureSystemAdmin(req, res, next) {
  const role = (req.session?.user?.role || '').toUpperCase();
  if (role !== 'SYSTEM_ADMIN') {
    return res.status(403).render('unauthorized', { user: req.session?.user || null });
  }
  return next();
}

function toBool(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

router.use(ensureSystemAdmin);

router.get('/definitions/users', async (req, res) => {
  try {
    const users = await usersService.listUsersWithOrgTitle();
    return res.render('admin_def_users', { users, error: null, message: null });
  } catch (err) {
    console.error('GET /admin/definitions/users error:', err);
    return res.render('admin_def_users', {
      users: [],
      error: 'خطا در خواندن لیست کاربران.',
      message: null,
    });
  }
});

router.get('/definitions/users/:id/edit', async (req, res) => {
  const id = req.params.id;

  try {
    const user = await usersService.getUserById(id);
    if (!user) return res.redirect('/admin/definitions/users');

    const [roleOptions, orgNodes, managers] = await Promise.all([
      usersService.listDistinctRoles(),
      usersService.listOrgNodes(),
      usersService.listUsersWithOrgNode(),
    ]);
    const roles = Array.isArray(roleOptions) ? [...roleOptions] : [];
    if (user.role && !roles.includes(user.role)) roles.push(user.role);

    return res.render('admin_def_user_edit', {
      user,
      roles,
      orgNodes: Array.isArray(orgNodes) ? orgNodes : [],
      managers: Array.isArray(managers) ? managers : [],
      error: null,
    });
  } catch (err) {
    console.error('GET /admin/definitions/users/:id/edit error:', err);
    return res.redirect('/admin/definitions/users');
  }
});

router.post('/definitions/users/:id', async (req, res) => {
  const id = req.params.id;
  const first_name = (req.body?.first_name || '').toString().trim();
  const last_name = (req.body?.last_name || '').toString().trim();
  const phone = (req.body?.phone || '').toString().trim();
  const telegram_id = (req.body?.telegram_id || '').toString().trim();
  const password = (req.body?.password || '').toString();
  const activeRequested = toBool(req.body?.is_active ?? req.body?.active);
  const managerApproved = toBool(req.body?.manager_approved);
  const requestedRole = (req.body?.role || '').toString().trim();
  const orgNodeId = req.body?.org_node_id ? parseInt(req.body.org_node_id, 10) : null;
  const managerIdRaw = (req.body?.manager_id || '').toString().trim();
  const managerId = managerIdRaw.length ? managerIdRaw : null;

  let safeRole = requestedRole;
  let user = null;
  let roles = [];
  let orgNodes = [];
  let managers = [];
  let statusToSave = null;
  let finalActiveBool = activeRequested;

  try {
    user = await usersService.getUserById(id);
    if (!user) return res.redirect('/admin/definitions/users');

    const [roleOptions, orgNodesRes, managersRes] = await Promise.all([
      usersService.listDistinctRoles(),
      usersService.listOrgNodes(),
      usersService.listUsersWithOrgNode(),
    ]);
    roles = Array.isArray(roleOptions) ? [...roleOptions] : [];
    if (user.role && !roles.includes(user.role)) roles.push(user.role);
    safeRole = roles.includes(requestedRole) ? requestedRole : user.role;
    orgNodes = Array.isArray(orgNodesRes) ? orgNodesRes : [];
    managers = Array.isArray(managersRes) ? managersRes : [];

    const passwordChanged = password.length > 0;
    const telegramChanged = telegram_id !== (user.telegram_id || '');

    if (passwordChanged || telegramChanged) {
      statusToSave = 'pending_telegram';
      finalActiveBool = false;
    } else if (managerApproved) {
      statusToSave = 'active';
      finalActiveBool = activeRequested;
    } else {
      statusToSave = 'pending_manager';
      finalActiveBool = false;
    }

    const effectiveOrgNodeId =
      orgNodeId !== null && !Number.isNaN(orgNodeId) ? orgNodeId : (user.org_node_id || null);
    const selectedOrgNode = orgNodes.find((n) => String(n.id) === String(effectiveOrgNodeId));
    if (!selectedOrgNode) {
      const userForRender = {
        ...user,
        first_name,
        last_name,
        phone,
        telegram_id,
        role: safeRole,
        active: finalActiveBool,
        status: statusToSave || user.status,
        org_node_id: effectiveOrgNodeId,
        manager_id: managerId,
      };
      return res.render('admin_def_user_edit', {
        user: userForRender,
        roles,
        orgNodes,
        managers,
        error: 'سمت/واحد سازمانی نامعتبر است.',
      });
    }

    let managerIdToSave = null;
    if (managerId) {
      const parentId = selectedOrgNode.parent_id;
      if (!parentId) {
        const userForRender = {
          ...user,
          first_name,
          last_name,
          phone,
          telegram_id,
          role: safeRole,
          active: finalActiveBool,
          status: statusToSave || user.status,
          org_node_id: effectiveOrgNodeId,
          manager_id: managerId,
        };
        return res.render('admin_def_user_edit', {
          user: userForRender,
          roles,
          orgNodes,
          managers,
          error: 'این سمت مدیر بالادست ندارد.',
        });
      }

      const managerCandidate = managers.find(
        (m) => String(m.id) === String(managerId) && String(m.org_node_id || '') === String(parentId)
      );
      if (!managerCandidate) {
        const userForRender = {
          ...user,
          first_name,
          last_name,
          phone,
          telegram_id,
          role: safeRole,
          active: finalActiveBool,
          status: statusToSave || user.status,
          org_node_id: effectiveOrgNodeId,
          manager_id: managerId,
        };
        return res.render('admin_def_user_edit', {
          user: userForRender,
          roles,
          orgNodes,
          managers,
          error: 'مدیر انتخاب‌شده معتبر نیست یا با ساختار سازمانی همخوانی ندارد.',
        });
      }
      managerIdToSave = managerId;
    }

    const userForRender = {
      ...user,
      first_name,
      last_name,
      phone,
      telegram_id,
      role: safeRole,
      active: finalActiveBool,
      status: statusToSave || user.status,
      org_node_id: selectedOrgNode.id,
      manager_id: managerIdToSave,
    };

    if (!first_name || !last_name) {
      return res.render('admin_def_user_edit', {
        user: userForRender,
        roles,
        orgNodes,
        managers,
        error: 'نام و نام خانوادگی الزامی است.',
      });
    }

    if (passwordChanged) {
      const hash = await bcrypt.hash(password, 10);
      await usersService.updateUserWithPassword({
        id,
        first_name,
        last_name,
        phone,
        telegram_id,
        username: user.username,
        role: safeRole,
        activeBool: finalActiveBool,
        password_hash: hash,
        orgNodeId: selectedOrgNode.id,
        managerIdToSave,
        statusToSave,
      });
    } else {
      await usersService.updateUserNoPassword({
        id,
        first_name,
        last_name,
        phone,
        telegram_id,
        username: user.username,
        role: safeRole,
        activeBool: finalActiveBool,
        orgNodeId: selectedOrgNode.id,
        managerIdToSave,
        statusToSave,
      });
    }

    return res.redirect('/admin/definitions/users');
  } catch (err) {
    console.error('POST /admin/definitions/users/:id error:', err);
    return res.render('admin_def_user_edit', {
      user: {
        ...(user || {}),
        first_name,
        last_name,
        phone,
        telegram_id,
        role: safeRole,
        active: finalActiveBool,
        status: statusToSave || (user && user.status) || null,
        org_node_id: orgNodeId || (user && user.org_node_id) || null,
        manager_id: managerId,
      },
      roles,
      orgNodes,
      managers,
      error: 'خطا در ذخیره اطلاعات کاربر.',
    });
  }
});

module.exports = router;
