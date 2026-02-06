const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

// 数据库文件路径
const dbPath = path.join(__dirname, 'focus_platform.db');

// 创建数据库连接
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('已连接到 SQLite 数据库');
    initializeDatabase();
  }
});

// 辅助函数：执行 SQL 查询
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

// 辅助函数：获取单行数据
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// 辅助函数：获取多行数据
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// 初始化数据库表
async function initializeDatabase() {
  // 创建用户表
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      points INTEGER DEFAULT 0,
      isAdmin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `);

  // 创建游戏成绩表
  await run(`
    CREATE TABLE IF NOT EXISTS game_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      game_type TEXT NOT NULL,
      score REAL NOT NULL,
      points_earned INTEGER DEFAULT 0,
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      season_id INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (season_id) REFERENCES seasons(id)
    )
  `);

  // 创建赛季表
  await run(`
    CREATE TABLE IF NOT EXISTS seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建每日任务表
  await run(`
    CREATE TABLE IF NOT EXISTS daily_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_date TEXT NOT NULL,
      game_type TEXT NOT NULL,
      target_score REAL NOT NULL,
      points_reward INTEGER NOT NULL,
      description TEXT,
      is_completed INTEGER DEFAULT 0
    )
  `);

  // 创建用户任务关系表
  await run(`
    CREATE TABLE IF NOT EXISTS user_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      task_id INTEGER,
      completed INTEGER DEFAULT 0,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (task_id) REFERENCES daily_tasks(id)
    )
  `);

  // 创建索引
  await run(`CREATE INDEX IF NOT EXISTS idx_game_scores_user ON game_scores(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_game_scores_type ON game_scores(game_type)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_game_scores_season ON game_scores(season_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_seasons_dates ON seasons(start_date, end_date)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_user_tasks_user ON user_tasks(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_daily_tasks_date ON daily_tasks(task_date)`);

  console.log('数据库表初始化完成');

  // 检查并创建管理员账户
  await ensureAdminUser();
}

// 用户相关操作
const userOperations = {
  // 创建用户
  create: async (username, password, isAdmin = 0) => {
    const hashedPassword = bcrypt.hashSync(password, 10);
    return await run(
      'INSERT INTO users (username, password, isAdmin) VALUES (?, ?, ?)',
      [username, hashedPassword, isAdmin]
    );
  },

  // 根据用户名查找用户
  findByUsername: async (username) => {
    return await get('SELECT * FROM users WHERE username = ?', [username]);
  },

  // 根据ID查找用户
  findById: async (id) => {
    return await get(
      'SELECT id, username, points, isAdmin, created_at, last_login FROM users WHERE id = ?',
      [id]
    );
  },

  // 更新最后登录时间
  updateLastLogin: async (userId) => {
    return await run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
  },

  // 更新用户积分
  updatePoints: async (userId, points) => {
    return await run('UPDATE users SET points = points + ? WHERE id = ?', [points, userId]);
  },

  // 获取所有用户
  getAll: async () => {
    return await all('SELECT id, username, points, isAdmin, created_at, last_login FROM users ORDER BY points DESC');
  },

  // 更新用户信息
  update: async (userId, data) => {
    const updates = [];
    const values = [];

    if (data.username) {
      updates.push('username = ?');
      values.push(data.username);
    }
    if (data.points !== undefined) {
      updates.push('points = ?');
      values.push(data.points);
    }
    if (data.isAdmin !== undefined) {
      updates.push('isAdmin = ?');
      values.push(data.isAdmin);
    }
    if (data.password) {
      updates.push('password = ?');
      values.push(bcrypt.hashSync(data.password, 10));
    }

    if (updates.length === 0) return null;

    values.push(userId);
    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    return await run(sql, values);
  },

  // 删除用户
  delete: async (userId) => {
    return await run('DELETE FROM users WHERE id = ?', [userId]);
  }
};

// 游戏成绩相关操作
const scoreOperations = {
  // 提交成绩
  submit: async (userId, gameType, score, pointsEarned) => {
    // 获取当前活跃赛季
    const activeSeason = await seasonOperations.getActiveSeason();
    const seasonId = activeSeason ? activeSeason.id : null;

    return await run(
      'INSERT INTO game_scores (user_id, game_type, score, points_earned, season_id) VALUES (?, ?, ?, ?, ?)',
      [userId, gameType, score, pointsEarned, seasonId]
    );
  },

  // 获取用户游戏历史
  getUserHistory: async (userId, gameType, limit = 10) => {
    let sql = 'SELECT * FROM game_scores WHERE user_id = ?';
    const params = [userId];

    if (gameType) {
      sql += ' AND game_type = ?';
      params.push(gameType);
    }

    sql += ' ORDER BY played_at DESC LIMIT ?';
    params.push(limit);

    return await all(sql, params);
  },

  // 获取游戏排行榜（每个用户只显示最好成绩）
  getLeaderboard: async (gameType, limit = 20) => {
    // 对于时间类游戏（越小越好），使用 ORDER BY score ASC
    // 对于分数类游戏（越大越好），使用 ORDER BY score DESC
    const timeBasedGames = ['f1_reaction', 'schulte_grid', 'schulte_grid_3', 'schulte_grid_4', 'schulte_grid_5'];
    const sortOrder = timeBasedGames.includes(gameType) ? 'ASC' : 'DESC';

    return await all(`
      SELECT u.username, s.score, s.points_earned, s.played_at
      FROM (
        SELECT user_id, score, points_earned, played_at,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY score ${sortOrder}) as rn
        FROM game_scores
        WHERE game_type = ?
      ) s
      JOIN users u ON s.user_id = u.id
      WHERE s.rn = 1
      ORDER BY s.score ${sortOrder}
      LIMIT ?
    `, [gameType, limit]);
  },

  // 获取总积分排行榜
  getTotalLeaderboard: async (limit = 50) => {
    return await all(`
      SELECT id, username, points, created_at
      FROM users
      ORDER BY points DESC
      LIMIT ?
    `, [limit]);
  },

  // 获取今日排行榜
  getTodayLeaderboard: async (limit = 20) => {
    return await all(`
      SELECT u.username, SUM(s.points_earned) as total_points
      FROM game_scores s
      JOIN users u ON s.user_id = u.id
      WHERE DATE(s.played_at) = DATE('now')
      GROUP BY u.id
      ORDER BY total_points DESC
      LIMIT ?
    `, [limit]);
  },

  // 获取所有成绩（管理员用）
  getAll: async () => {
    return await all(`
      SELECT s.*, u.username
      FROM game_scores s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.played_at DESC
    `);
  },

  // 删除成绩
  delete: async (scoreId) => {
    return await run('DELETE FROM game_scores WHERE id = ?', [scoreId]);
  }
};

// 每日任务相关操作
const taskOperations = {
  // 创建任务
  create: async (taskDate, gameType, targetScore, pointsReward, description) => {
    return await run(
      'INSERT INTO daily_tasks (task_date, game_type, target_score, points_reward, description) VALUES (?, ?, ?, ?, ?)',
      [taskDate, gameType, targetScore, pointsReward, description]
    );
  },

  // 获取今日任务
  getTodayTasks: async () => {
    const today = new Date().toISOString().split('T')[0];
    return await all('SELECT * FROM daily_tasks WHERE task_date = ?', [today]);
  },

  // 获取任务历史
  getHistory: async (userId, limit = 10) => {
    return await all(`
      SELECT t.*, ut.completed, ut.completed_at
      FROM daily_tasks t
      JOIN user_tasks ut ON t.id = ut.task_id
      WHERE ut.user_id = ?
      ORDER BY ut.completed_at DESC
      LIMIT ?
    `, [userId, limit]);
  },

  // 完成任务
  complete: async (userId, taskId) => {
    // 检查是否已完成
    const existing = await get(
      'SELECT * FROM user_tasks WHERE user_id = ? AND task_id = ?',
      [userId, taskId]
    );

    if (existing && existing.completed) {
      return { alreadyCompleted: true };
    }

    if (existing) {
      await run(
        'UPDATE user_tasks SET completed = 1, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
        [existing.id]
      );
    } else {
      await run(
        'INSERT INTO user_tasks (user_id, task_id, completed, completed_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP)',
        [userId, taskId]
      );
    }

    // 获取任务奖励
    const task = await get('SELECT points_reward FROM daily_tasks WHERE id = ?', [taskId]);
    return { pointsReward: task ? task.points_reward : 0 };
  },

  // 检查任务完成条件
  checkTaskCompletion: async (userId, gameType, score) => {
    const today = new Date().toISOString().split('T')[0];

    // 对于时间类游戏（F1反应、舒尔特方格），目标是越小越好
    // 对于分数类游戏（贪吃蛇、打砖块），目标是越大越好
    const timeBasedGames = ['f1_reaction', 'schulte_grid', 'schulte_grid_3', 'schulte_grid_4', 'schulte_grid_5'];
    let comparison;

    if (timeBasedGames.includes(gameType)) {
      // 时间类：目标 >= 实际（例如目标0.250s，实际0.230s，则0.250 >= 0.230完成）
      comparison = `target_score >= ${score}`;
    } else {
      // 分数类：实际 >= 目标（例如目标100分，实际150分，则150 >= 100完成）
      comparison = `${score} >= target_score`;
    }

    return await all(`
      SELECT * FROM daily_tasks
      WHERE task_date = ?
      AND game_type = ?
      AND ${comparison}
      AND id NOT IN (
        SELECT task_id FROM user_tasks
        WHERE user_id = ? AND completed = 1
      )
    `, [today, gameType, userId]);
  },

  // 生成每日任务
  generateDailyTasks: async () => {
    const today = new Date().toISOString().split('T')[0];

    // 检查今日任务是否已生成
    const result = await get('SELECT COUNT(*) as count FROM daily_tasks WHERE task_date = ?', [today]);

    if (result.count > 0) {
      return { exists: true };
    }

    // 任务模板
    const taskTemplates = [
      { type: 'f1_reaction', target: 0.250, reward: 80, desc: 'F1快速反应：反应时间 < 0.250s' },
      { type: 'f1_reaction', target: 0.220, reward: 120, desc: 'F1职业级：反应时间 < 0.220s' },
      { type: 'schulte_grid_3', target: 18, reward: 80, desc: '舒尔特3x3：完成时间 < 18秒' },
      { type: 'schulte_grid_4', target: 24, reward: 100, desc: '舒尔特4x4：完成时间 < 24秒' },
      { type: 'schulte_grid_5', target: 30, reward: 120, desc: '舒尔特5x5：完成时间 < 30秒' },
      { type: 'snake', target: 100, reward: 60, desc: '贪吃蛇新手：得分 ≥ 100分' },
      { type: 'snake', target: 200, reward: 80, desc: '贪吃蛇熟练：得分 ≥ 200分' },
      { type: 'snake', target: 300, reward: 120, desc: '贪吃蛇高手：得分 ≥ 300分' },
      { type: 'breakout', target: 500, reward: 60, desc: '打砖块新手：得分 ≥ 500分' },
      { type: 'breakout', target: 1000, reward: 100, desc: '打砖块熟练：得分 ≥ 1000分' },
      { type: 'breakout', target: 1500, reward: 150, desc: '打砖块高手：得分 ≥ 1500分' }
    ];

    // 随机选择3个任务
    const selectedTasks = [];
    const templates = [...taskTemplates];
    while (selectedTasks.length < 3 && templates.length > 0) {
      const index = Math.floor(Math.random() * templates.length);
      selectedTasks.push(templates.splice(index, 1)[0]);
    }

    // 插入任务
    for (const task of selectedTasks) {
      await taskOperations.create(today, task.type, task.target, task.reward, task.desc);
    }

    return { created: selectedTasks.length };
  },

  // 获取所有任务（管理员用）
  getAll: async () => {
    return await all('SELECT * FROM daily_tasks ORDER BY task_date DESC');
  },

  // 删除任务
  delete: async (taskId) => {
    return await run('DELETE FROM daily_tasks WHERE id = ?', [taskId]);
  }
};

// 统计相关操作
const statsOperations = {
  // 获取平台统计
  getPlatformStats: async () => {
    const userCount = await get('SELECT COUNT(*) as count FROM users');
    const scoreCount = await get('SELECT COUNT(*) as count FROM game_scores');
    const totalPoints = await get('SELECT SUM(points) as total FROM users');
    const todayActive = await get(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM game_scores
      WHERE DATE(played_at) = DATE('now')
    `);

    return {
      totalUsers: userCount.count,
      totalScores: scoreCount.count,
      totalPointsAwarded: totalPoints.total || 0,
      todayActiveUsers: todayActive.count
    };
  },

  // 获取用户统计
  getUserStats: async (userId) => {
    const totalGames = await get('SELECT COUNT(*) as count FROM game_scores WHERE user_id = ?', [userId]);
    const totalPointsEarned = await get('SELECT SUM(points_earned) as total FROM game_scores WHERE user_id = ?', [userId]);
    const completedTasks = await get('SELECT COUNT(*) as count FROM user_tasks WHERE user_id = ? AND completed = 1', [userId]);

    // 最佳成绩
    const bestF1 = await get('SELECT MIN(score) as best FROM game_scores WHERE user_id = ? AND game_type = ?', [userId, 'f1_reaction']);
    const bestSchulte = await get('SELECT MIN(score) as best FROM game_scores WHERE user_id = ? AND game_type = ?', [userId, 'schulte_grid']);

    return {
      totalGames: totalGames.count,
      totalPointsEarned: totalPointsEarned.total || 0,
      completedTasks: completedTasks.count,
      bestF1Reaction: bestF1.best,
      bestSchulteGrid: bestSchulte.best
    };
  }
};

// 赛季相关操作
const seasonOperations = {
  // 创建赛季
  create: async (name, description, startDate, endDate) => {
    return await run(
      'INSERT INTO seasons (name, description, start_date, end_date) VALUES (?, ?, ?, ?)',
      [name, description, startDate, endDate]
    );
  },

  // 获取所有赛季
  getAll: async () => {
    return await all('SELECT * FROM seasons ORDER BY created_at DESC');
  },

  // 获取当前活跃赛季
  getActiveSeason: async () => {
    const now = new Date().toISOString();
    return await get(
      'SELECT * FROM seasons WHERE start_date <= ? AND end_date >= ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1',
      [now, now]
    );
  },

  // 根据ID获取赛季
  getById: async (seasonId) => {
    return await get('SELECT * FROM seasons WHERE id = ?', [seasonId]);
  },

  // 更新赛季
  update: async (seasonId, data) => {
    const updates = [];
    const values = [];

    if (data.name) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.startDate) {
      updates.push('start_date = ?');
      values.push(data.startDate);
    }
    if (data.endDate) {
      updates.push('end_date = ?');
      values.push(data.endDate);
    }
    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(data.isActive);
    }

    if (updates.length === 0) return null;

    values.push(seasonId);
    const sql = `UPDATE seasons SET ${updates.join(', ')} WHERE id = ?`;
    return await run(sql, values);
  },

  // 删除赛季
  delete: async (seasonId) => {
    return await run('DELETE FROM seasons WHERE id = ?', [seasonId]);
  },

  // 获取赛季排行榜（指定赛季和游戏类型）
  getSeasonLeaderboard: async (seasonId, gameType, limit = 20) => {
    const timeBasedGames = ['f1_reaction', 'schulte_grid', 'schulte_grid_3', 'schulte_grid_4', 'schulte_grid_5'];
    const sortOrder = timeBasedGames.includes(gameType) ? 'ASC' : 'DESC';

    return await all(`
      SELECT u.username, s.score, s.points_earned, s.played_at
      FROM (
        SELECT user_id, score, points_earned, played_at,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY score ${sortOrder}) as rn
        FROM game_scores
        WHERE game_type = ? AND season_id = ?
      ) s
      JOIN users u ON s.user_id = u.id
      WHERE s.rn = 1
      ORDER BY s.score ${sortOrder}
      LIMIT ?
    `, [gameType, seasonId, limit]);
  },

  // 获取赛季总积分排行榜
  getSeasonTotalLeaderboard: async (seasonId, limit = 50) => {
    return await all(`
      SELECT u.id, u.username, SUM(s.points_earned) as total_points
      FROM game_scores s
      JOIN users u ON s.user_id = u.id
      WHERE s.season_id = ?
      GROUP BY u.id
      ORDER BY total_points DESC
      LIMIT ?
    `, [seasonId, limit]);
  },

  // 获取赛季统计
  getSeasonStats: async (seasonId) => {
    const totalScores = await get('SELECT COUNT(*) as count FROM game_scores WHERE season_id = ?', [seasonId]);
    const totalPoints = await get('SELECT SUM(points_earned) as total FROM game_scores WHERE season_id = ?', [seasonId]);
    const activeUsers = await get('SELECT COUNT(DISTINCT user_id) as count FROM game_scores WHERE season_id = ?', [seasonId]);

    return {
      totalScores: totalScores.count,
      totalPointsAwarded: totalPoints.total || 0,
      activeUsers: activeUsers.count
    };
  }
};

// 检查并创建管理员账户
async function ensureAdminUser() {
  try {
    const admin = await userOperations.findByUsername('admin');
    if (!admin) {
      await userOperations.create('admin', 'admin123', 1);
      console.log('默认管理员账户已创建: admin/admin123');
    }
  } catch (err) {
    console.error('创建管理员账户失败:', err);
  }
}

// 导出操作
module.exports = {
  db,
  userOperations,
  scoreOperations,
  taskOperations,
  statsOperations,
  seasonOperations
};
