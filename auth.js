const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'focus-training-platform-jwt-secret-2024';
const JWT_EXPIRES_IN = '24h';

// 生成 JWT token
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      isAdmin: user.isAdmin === 1
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// 验证 JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// 验证密码
function verifyPassword(password, hashedPassword) {
  return bcrypt.compareSync(password, hashedPassword);
}

// 认证中间件
function authenticate(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }

  req.user = decoded;
  req.userId = decoded.userId;
  req.isAdmin = decoded.isAdmin;
  return next();
}

// 管理员权限中间件
function requireAdmin(req, res, next) {
  if (req.user && req.user.isAdmin) {
    return next();
  }
  return res.status(403).json({ error: '需要管理员权限' });
}

// 可选认证中间件（不强制登录）
function optionalAuth(req, res, next) {
  const token = req.cookies?.token;

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.isAuthenticated = true;
      req.user = decoded;
      req.userId = decoded.userId;
      req.isAdmin = decoded.isAdmin;
      return next();
    }
  }

  req.isAuthenticated = false;
  next();
}

module.exports = {
  verifyPassword,
  authenticate,
  requireAdmin,
  optionalAuth,
  generateToken,
  verifyToken
};
