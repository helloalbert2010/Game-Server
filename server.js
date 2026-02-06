const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const {
  userOperations,
  scoreOperations,
  taskOperations,
  statsOperations,
  seasonOperations,
  ensureAdminUser
} = require('./database');
const {
  verifyPassword,
  authenticate,
  requireAdmin,
  optionalAuth,
  generateToken
} = require('./auth');
const {
  errorHandler,
  requestLogger,
  validateBody,
  calculateGamePoints
} = require('./middleware');

const app = express();
const PORT = process.env.PORT || 3005;

// 中间件配置
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestLogger);
app.use(express.static(path.join(__dirname, 'public')));

// ==================== 认证相关路由 ====================

// 用户注册
app.post('/api/register', validateBody(['username', 'password']), async (req, res) => {
  const { username, password } = req.body;

  // 验证用户名长度
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: '用户名长度必须在3-20个字符之间' });
  }

  // 验证密码长度
  if (password.length < 6) {
    return res.status(400).json({ error: '密码长度必须至少6个字符' });
  }

  try {
    const result = await userOperations.create(username, password);
    const user = await userOperations.findById(result.lastID);

    // 生成 JWT token
    const token = generateToken(user);

    // 设置 cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24小时
    });

    res.json({
      message: '注册成功',
      user: {
        id: user.id,
        username: user.username,
        points: user.points,
        isAdmin: user.isAdmin === 1
      }
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT' || err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    throw err;
  }
});

// 用户登录
app.post('/api/login', validateBody(['username', 'password']), async (req, res) => {
  const { username, password } = req.body;

  console.log('[LOGIN] 尝试登录:', { username, passwordLength: password?.length });

  const user = await userOperations.findByUsername(username);
  if (!user) {
    console.log('[LOGIN] 用户不存在:', username);
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  console.log('[LOGIN] 找到用户:', { id: user.id, username: user.username, isAdmin: user.isAdmin });

  const passwordMatch = verifyPassword(password, user.password);
  console.log('[LOGIN] 密码验证结果:', passwordMatch);

  if (!passwordMatch) {
    console.log('[LOGIN] 密码错误');
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  // 生成 JWT token
  const token = generateToken(user);
  console.log('[LOGIN] Token 已生成');

  // 设置 cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  });

  // 更新最后登录时间
  await userOperations.updateLastLogin(user.id);

  console.log('[LOGIN] 登录成功:', user.username);
  res.json({
    message: '登录成功',
    user: {
      id: user.id,
      username: user.username,
      points: user.points,
      isAdmin: user.isAdmin === 1
    }
  });
});

// 用户登出
app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: '登出成功' });
});

// 初始化检查（确保 admin 用户存在）
app.get('/api/init-check', async (req, res) => {
  try {
    console.log('[INIT] 开始检查 admin 用户...');
    await ensureAdminUser();
    console.log('[INIT] Admin 用户检查完成');
    res.json({ message: 'Admin user check completed', adminExists: true });
  } catch (err) {
    console.error('[INIT] Admin 用户创建失败:', err);
    res.status(500).json({ error: 'Failed to ensure admin user', details: err.message });
  }
});

// 清理错误的任务数据
app.get('/api/cleanup-tasks', async (req, res) => {
  try {
    const { query } = require('./database');
    console.log('[CLEANUP] 清理错误的任务数据...');

    // 删除 task_date 为字符串 'CURRENT_DATE' 的错误数据
    const result = await query("DELETE FROM daily_tasks WHERE task_date = 'CURRENT_DATE'");

    console.log(`[CLEANUP] 删除了 ${result.rowCount} 条错误任务记录`);
    res.json({ message: 'Cleanup completed', deletedCount: result.rowCount });
  } catch (err) {
    console.error('[CLEANUP] 清理失败:', err);
    res.status(500).json({ error: 'Cleanup failed', details: err.message });
  }
});

// 获取当前用户信息
app.get('/api/me', authenticate, async (req, res) => {
  const user = await userOperations.findById(req.userId);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  res.json({
    user: {
      id: user.id,
      username: user.username,
      points: user.points,
      isAdmin: user.isAdmin === 1
    }
  });
});

// ==================== 游戏相关路由 ====================

// 提交游戏成绩
app.post('/api/games/score', authenticate, validateBody(['gameType', 'score']), async (req, res) => {
  const { gameType, score } = req.body;
  const userId = req.userId;

  // 计算积分
  const pointsEarned = calculateGamePoints(gameType, score);

  // 保存成绩
  await scoreOperations.submit(userId, gameType, score, pointsEarned);

  // 更新用户积分
  await userOperations.updatePoints(userId, pointsEarned);

  // 检查并完成任务
  const completedTasks = await taskOperations.checkTaskCompletion(userId, gameType, score);
  let taskReward = 0;
  for (const task of completedTasks) {
    const result = await taskOperations.complete(userId, task.id);
    if (result.pointsReward && !result.alreadyCompleted) {
      taskReward += result.pointsReward;
      await userOperations.updatePoints(userId, result.pointsReward);
    }
  }

  res.json({
    message: '成绩已保存',
    pointsEarned,
    taskReward,
    totalPoints: pointsEarned + taskReward
  });
});

// 获取游戏历史
app.get('/api/games/scores/:gameType', authenticate, async (req, res) => {
  const { gameType } = req.params;
  const userId = req.userId;

  const history = await scoreOperations.getUserHistory(userId, gameType);
  res.json({ history });
});

// 获取游戏排行榜
app.get('/api/games/leaderboard/:gameType', async (req, res) => {
  const { gameType } = req.params;
  const leaderboard = await scoreOperations.getLeaderboard(gameType);
  res.json({ leaderboard });
});

// ==================== 排行榜相关路由 ====================

// 单游戏排行榜（用于游戏页面）
app.get('/api/leaderboard/:gameType', async (req, res) => {
  const { gameType } = req.params;
  const leaderboard = await scoreOperations.getLeaderboard(gameType);
  res.json({ leaderboard });
});

// 总积分排行榜
app.get('/api/leaderboard/total', async (req, res) => {
  const leaderboard = await scoreOperations.getTotalLeaderboard(50);
  res.json({ leaderboard });
});

// 今日排行榜
app.get('/api/leaderboard/today', async (req, res) => {
  const leaderboard = await scoreOperations.getTodayLeaderboard(20);
  res.json({ leaderboard });
});

// ==================== 任务相关路由 ====================

// 获取今日任务
app.get('/api/tasks/today', authenticate, async (req, res) => {
  // 先生成今日任务（如果不存在）
  await taskOperations.generateDailyTasks();

  const tasks = await taskOperations.getTodayTasks();

  // 检查用户完成任务情况
  const userId = req.userId;
  const { query } = require('./database');

  const tasksWithStatus = await Promise.all(tasks.map(async (task) => {
    const result = await query(
      'SELECT completed FROM user_tasks WHERE user_id = $1 AND task_id = $2',
      [userId, task.id]
    );
    const checkStmt = result.rows[0];
    return {
      ...task,
      completed: checkStmt ? checkStmt.completed === 1 : false
    };
  }));

  res.json({ tasks: tasksWithStatus });
});

// 获取任务历史
app.get('/api/tasks/history', authenticate, async (req, res) => {
  const userId = req.userId;
  const history = await taskOperations.getHistory(userId);
  res.json({ history });
});

// 完成任务（手动触发）
app.post('/api/tasks/:id/complete', authenticate, async (req, res) => {
  const taskId = parseInt(req.params.id);
  const userId = req.userId;

  const result = await taskOperations.complete(userId, taskId);

  if (result.alreadyCompleted) {
    return res.status(400).json({ error: '任务已完成' });
  }

  // 更新用户积分
  if (result.pointsReward) {
    await userOperations.updatePoints(userId, result.pointsReward);
  }

  res.json({
    message: '任务完成',
    pointsReward: result.pointsReward
  });
});

// ==================== 用户统计路由 ====================

// 获取用户统计信息
app.get('/api/stats/user', authenticate, async (req, res) => {
  const userId = req.userId;
  const stats = await statsOperations.getUserStats(userId);
  res.json({ stats });
});

// ==================== 管理员相关路由 ====================

// 获取所有用户
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const users = await userOperations.getAll();
  res.json({ users });
});

// 获取用户详情
app.get('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  const user = await userOperations.findById(userId);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const stats = await statsOperations.getUserStats(userId);
  const gameHistory = await scoreOperations.getUserHistory(userId, null, 50);

  res.json({
    user,
    stats,
    gameHistory
  });
});

// 更新用户
app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  const result = await userOperations.update(userId, req.body);

  if (!result) {
    return res.status(400).json({ error: '没有更新任何数据' });
  }

  const updatedUser = await userOperations.findById(userId);
  res.json({
    message: '用户更新成功',
    user: updatedUser
  });
});

// 删除用户
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);

  // 不允许删除管理员自己
  if (userId === req.userId) {
    return res.status(400).json({ error: '不能删除自己的账户' });
  }

  await userOperations.delete(userId);
  res.json({ message: '用户已删除' });
});

// 获取所有游戏成绩
app.get('/api/admin/scores', requireAdmin, async (req, res) => {
  const scores = await scoreOperations.getAll();
  res.json({ scores });
});

// 删除游戏成绩
app.delete('/api/admin/scores/:id', requireAdmin, async (req, res) => {
  const scoreId = parseInt(req.params.id);
  await scoreOperations.delete(scoreId);
  res.json({ message: '成绩已删除' });
});

// 获取平台统计
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  const stats = await statsOperations.getPlatformStats();
  res.json({ stats });
});

// 获取所有任务
app.get('/api/admin/tasks', requireAdmin, async (req, res) => {
  const tasks = await taskOperations.getAll();
  res.json({ tasks });
});

// 删除任务
app.delete('/api/admin/tasks/:id', requireAdmin, async (req, res) => {
  const taskId = parseInt(req.params.id);
  await taskOperations.delete(taskId);
  res.json({ message: '任务已删除' });
});

// ==================== 赛季相关路由 ====================

// 获取所有赛季
app.get('/api/seasons', async (req, res) => {
  const seasons = await seasonOperations.getAll();
  res.json({ seasons });
});

// 获取当前活跃赛季
app.get('/api/seasons/active', async (req, res) => {
  const season = await seasonOperations.getActiveSeason();
  res.json({ season });
});

// 根据ID获取赛季
app.get('/api/seasons/:id', async (req, res) => {
  const seasonId = parseInt(req.params.id);
  const season = await seasonOperations.getById(seasonId);
  if (!season) {
    return res.status(404).json({ error: '赛季不存在' });
  }
  res.json({ season });
});

// 赛季排行榜（总积分）
app.get('/api/seasons/:id/leaderboard/total', async (req, res) => {
  const seasonId = parseInt(req.params.id);
  const leaderboard = await seasonOperations.getSeasonTotalLeaderboard(seasonId);
  res.json({ leaderboard });
});

// 赛季排行榜（指定游戏）
app.get('/api/seasons/:id/leaderboard/:gameType', async (req, res) => {
  const seasonId = parseInt(req.params.id);
  const { gameType } = req.params;
  const leaderboard = await seasonOperations.getSeasonLeaderboard(seasonId, gameType);
  res.json({ leaderboard });
});

// 赛季统计
app.get('/api/seasons/:id/stats', async (req, res) => {
  const seasonId = parseInt(req.params.id);
  const stats = await seasonOperations.getSeasonStats(seasonId);
  res.json({ stats });
});

// ==================== 管理员赛季相关路由 ====================

// 创建赛季
app.post('/api/admin/seasons', requireAdmin, validateBody(['name', 'startDate', 'endDate']), async (req, res) => {
  const { name, description, startDate, endDate } = req.body;

  try {
    const result = await seasonOperations.create(name, description, startDate, endDate);
    const season = await seasonOperations.getById(result.lastID);
    res.json({
      message: '赛季创建成功',
      season
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT') {
      return res.status(400).json({ error: '赛季创建失败' });
    }
    throw err;
  }
});

// 更新赛季
app.put('/api/admin/seasons/:id', requireAdmin, async (req, res) => {
  const seasonId = parseInt(req.params.id);
  const result = await seasonOperations.update(seasonId, req.body);

  if (!result) {
    return res.status(400).json({ error: '没有更新任何数据' });
  }

  const updatedSeason = await seasonOperations.getById(seasonId);
  res.json({
    message: '赛季更新成功',
    season: updatedSeason
  });
});

// 删除赛季
app.delete('/api/admin/seasons/:id', requireAdmin, async (req, res) => {
  const seasonId = parseInt(req.params.id);
  await seasonOperations.delete(seasonId);
  res.json({ message: '赛季已删除' });
});


// ==================== 前端路由 ====================

// 主页（登录/注册）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 游戏大厅
app.get('/lobby', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lobby.html'));
});

// 管理员面板
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 赛季管理页面
app.get('/admin/seasons', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'seasons.html'));
});

// F1反应测试游戏
app.get('/games/f1-reaction', (req, res) => {
  res.sendFile(path.join(__dirname, 'games', 'f1-reaction.html'));
});

// 舒尔特方格游戏
app.get('/games/schulte-grid', (req, res) => {
  res.sendFile(path.join(__dirname, 'games', 'schulte-grid.html'));
});

// 贪吃蛇游戏
app.get('/games/snake', (req, res) => {
  res.sendFile(path.join(__dirname, 'games', 'snake.html'));
});

// 打砖块游戏
app.get('/games/breakout', (req, res) => {
  res.sendFile(path.join(__dirname, 'games', 'breakout.html'));
});

// ==================== 错误处理 ====================

// Favicon 处理（避免 404 错误）
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.use(errorHandler);

// ==================== 启动服务器 ====================

// 仅在非 Vercel 环境下启动服务器
if (require('fs').existsSync('.vercel') === false && process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║     专注力训练游戏平台服务器已启动                    ║
╠═══════════════════════════════════════════════════════╣
║  本地访问: http://localhost:${PORT}                     ║
║  局域网访问: http://[本机IP]:${PORT}                   ║
╠═══════════════════════════════════════════════════════╣
║  默认管理员账户:                                       ║
║  用户名: admin                                         ║
║  密码: admin1234                                       ║
╚═══════════════════════════════════════════════════════╝
  `);
  });
}

// 导出 app 供 Vercel 使用
module.exports = app;
