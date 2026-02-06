const bcrypt = require('bcrypt');

// 验证密码
function verifyPassword(password, hashedPassword) {
  return bcrypt.compareSync(password, hashedPassword);
}

// 认证中间件
function authenticate(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: '未登录，请先登录' });
}

// 管理员权限中间件
function requireAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.isAdmin) {
    return next();
  }
  return res.status(403).json({ error: '需要管理员权限' });
}

// 可选认证中间件（不强制登录）
function optionalAuth(req, res, next) {
  if (req.session && req.session.userId) {
    req.isAuthenticated = true;
  } else {
    req.isAuthenticated = false;
  }
  next();
}

module.exports = {
  verifyPassword,
  authenticate,
  requireAdmin,
  optionalAuth
};
