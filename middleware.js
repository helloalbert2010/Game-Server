// 错误处理中间件
function errorHandler(err, req, res, next) {
  console.error('错误:', err);

  // SQLite 唯一约束错误
  if (err.code === 'SQLITE_CONSTRAINT') {
    return res.status(400).json({
      error: '数据冲突',
      message: err.message
    });
  }

  // 其他错误
  res.status(500).json({
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : '请稍后重试'
  });
}

// 请求日志中间件
function requestLogger(req, res, next) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  if (req.session && req.session.userId) {
    console.log(`  用户ID: ${req.session.userId}`);
  }
  next();
}

// 验证请求体中间件
function validateBody(requiredFields) {
  return (req, res, next) => {
    const missing = requiredFields.filter(field => !(field in req.body));

    if (missing.length > 0) {
      return res.status(400).json({
        error: '缺少必要字段',
        missing: missing
      });
    }

    next();
  };
}

// 计算游戏积分
function calculateGamePoints(gameType, score) {
  if (gameType === 'f1_reaction') {
    // F1反应测试积分规则（分数越小越好）
    if (score < 0.200) return 100;
    if (score < 0.230) return 80;
    if (score < 0.250) return 60;
    if (score < 0.300) return 40;
    return 20;
  } else if (gameType === 'schulte_grid' || gameType.startsWith('schulte_grid_')) {
    // 舒尔特方格积分规则（秒数越小越好）
    // 3x3: <12s=100, <18s=80, <24s=60, <30s=40, >=30s=20
    // 4x4: <16s=100, <24s=80, <32s=60, <40s=40, >=40s=20
    // 5x5: <20s=100, <30s=80, <40s=60, <50s=40, >=50s=20
    const size = gameType === 'schulte_grid' ? 5 : parseInt(gameType.split('_')[2]);
    const thresholds = {
      3: [12, 18, 24, 30],
      4: [16, 24, 32, 40],
      5: [20, 30, 40, 50]
    };
    const [t1, t2, t3, t4] = thresholds[size];

    if (score < t1) return 100;
    if (score < t2) return 80;
    if (score < t3) return 60;
    if (score < t4) return 40;
    return 20;
  } else if (gameType === 'snake') {
    // 贪吃蛇积分规则（分数越大越好）
    if (score >= 500) return 100;
    if (score >= 300) return 80;
    if (score >= 200) return 60;
    if (score >= 100) return 40;
    return 20;
  } else if (gameType === 'breakout') {
    // 打砖块积分规则（分数越大越好）
    if (score >= 2000) return 100;
    if (score >= 1500) return 80;
    if (score >= 1000) return 60;
    if (score >= 500) return 40;
    return 20;
  }
  return 0;
}

module.exports = {
  errorHandler,
  requestLogger,
  validateBody,
  calculateGamePoints
};
