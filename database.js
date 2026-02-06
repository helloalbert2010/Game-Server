const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// 从环境变量获取数据库连接字符串
const connectionString = process.env.DATABASE_URL;

// 创建 PostgreSQL 连接池
const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// 辅助函数：执行 SQL 查询
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// 初始化数据库表
async function initializeDatabase() {
  console.log('正在初始化 PostgreSQL 数据库...');

  try {
    // 创建用户表
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        points INTEGER DEFAULT 0,
        isAdmin INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      )
    `);

    // 创建游戏成绩表
    await query(`
      CREATE TABLE IF NOT EXISTS game_scores (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        game_type TEXT NOT NULL,
        score REAL NOT NULL,
        points_earned INTEGER DEFAULT 0,
        played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        season_id INTEGER REFERENCES seasons(id)
      )
    `);

    // 创建赛季表
    await query(`
      CREATE TABLE IF NOT EXISTS seasons (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建每日任务表
    await query(`
      CREATE TABLE IF NOT EXISTS daily_tasks (
        id SERIAL PRIMARY KEY,
        task_date TEXT NOT NULL,
        game_type TEXT NOT NULL,
        target_score REAL NOT NULL,
        points_reward INTEGER NOT NULL,
        description TEXT,
        is_completed INTEGER DEFAULT 0
      )
    `);

    // 创建用户任务关系表
    await query(`
      CREATE TABLE IF NOT EXISTS user_tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        task_id INTEGER REFERENCES daily_tasks(id),
        completed INTEGER DEFAULT 0,
        completed_at TIMESTAMP
      )
    `);

    // 创建索引
    await query(`CREATE INDEX IF NOT EXISTS idx_game_scores_user ON game_scores(user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_game_scores_type ON game_scores(game_type)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_game_scores_season ON game_scores(season_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_seasons_dates ON seasons(start_date, end_date)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_user_tasks_user ON user_tasks(user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_daily_tasks_date ON daily_tasks(task_date)`);

    console.log('PostgreSQL 数据库表初始化完成');

    // 检查并创建管理员账户
    await ensureAdminUser();
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
}

// 用户相关操作
const userOperations = {
  // 创建用户
  create: async (username, password, isAdmin = 0) => {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = await query(
      'INSERT INTO users (username, password, isAdmin) VALUES ($1, $2, $3) RETURNING id',
      [username, hashedPassword, isAdmin]
    );
    return { lastID: result.rows[0].id };
  },

  // 根据用户名查找用户
  findByUsername: async (username) => {
    const result = await query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0];
  },

  // 根据ID查找用户
  findById: async (id) => {
    const result = await query(
      'SELECT id, username, points, isAdmin, created_at, last_login FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  // 更新最后登录时间
  updateLastLogin: async (userId) => {
    await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
    return { changes: 1 };
  },

  // 更新用户积分
  updatePoints: async (userId, points) => {
    await query('UPDATE users SET points = points + $1 WHERE id = $2', [points, userId]);
    return { changes: 1 };
  },

  // 获取所有用户
  getAll: async () => {
    const result = await query('SELECT id, username, points, isAdmin, created_at, last_login FROM users ORDER BY points DESC');
    return result.rows;
  },

  // 更新用户信息
  update: async (userId, data) => {
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (data.username) {
      updates.push(`username = $${paramCount++}`);
      values.push(data.username);
    }
    if (data.points !== undefined) {
      updates.push(`points = $${paramCount++}`);
      values.push(data.points);
    }
    if (data.isAdmin !== undefined) {
      updates.push(`isAdmin = $${paramCount++}`);
      values.push(data.isAdmin);
    }
    if (data.password) {
      updates.push(`password = $${paramCount++}`);
      values.push(bcrypt.hashSync(data.password, 10));
    }

    if (updates.length === 0) return null;

    values.push(userId);
    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`;
    await query(sql, values);
    return { changes: 1 };
  },

  // 删除用户
  delete: async (userId) => {
    await query('DELETE FROM users WHERE id = $1', [userId]);
    return { changes: 1 };
  }
};

// 游戏成绩相关操作
const scoreOperations = {
  // 提交成绩
  submit: async (userId, gameType, score, pointsEarned) => {
    // 获取当前活跃赛季
    const activeSeason = await seasonOperations.getActiveSeason();
    const seasonId = activeSeason ? activeSeason.id : null;

    const result = await query(
      'INSERT INTO game_scores (user_id, game_type, score, points_earned, season_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [userId, gameType, score, pointsEarned, seasonId]
    );
    return { lastID: result.rows[0].id };
  },

  // 获取用户游戏历史
  getUserHistory: async (userId, gameType, limit = 10) => {
    let sql = 'SELECT * FROM game_scores WHERE user_id = $1';
    const params = [userId];
    let paramCount = 2;

    if (gameType) {
      sql += ` AND game_type = $${paramCount++}`;
      params.push(gameType);
    }

    sql += ` ORDER BY played_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await query(sql, params);
    return result.rows;
  },

  // 获取游戏排行榜（每个用户只显示最好成绩）
  getLeaderboard: async (gameType, limit = 20) => {
    const timeBasedGames = ['f1_reaction', 'schulte_grid', 'schulte_grid_3', 'schulte_grid_4', 'schulte_grid_5'];
    const sortOrder = timeBasedGames.includes(gameType) ? 'ASC' : 'DESC';

    const result = await query(`
      WITH ranked_scores AS (
        SELECT
          user_id,
          score,
          points_earned,
          played_at,
          ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY score ${sortOrder}) as rn
        FROM game_scores
        WHERE game_type = $1
      )
      SELECT u.username, s.score, s.points_earned, s.played_at
      FROM ranked_scores s
      JOIN users u ON s.user_id = u.id
      WHERE s.rn = 1
      ORDER BY s.score ${sortOrder}
      LIMIT $2
    `, [gameType, limit]);

    return result.rows;
  },

  // 获取总积分排行榜
  getTotalLeaderboard: async (limit = 50) => {
    const result = await query(`
      SELECT id, username, points, created_at
      FROM users
      ORDER BY points DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  },

  // 获取今日排行榜
  getTodayLeaderboard: async (limit = 20) => {
    const result = await query(`
      SELECT u.username, SUM(s.points_earned) as total_points
      FROM game_scores s
      JOIN users u ON s.user_id = u.id
      WHERE DATE(s.played_at) = CURRENT_DATE
      GROUP BY u.id, u.username
      ORDER BY total_points DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  },

  // 获取所有成绩（管理员用）
  getAll: async () => {
    const result = await query(`
      SELECT s.*, u.username
      FROM game_scores s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.played_at DESC
    `);

    return result.rows;
  },

  // 删除成绩
  delete: async (scoreId) => {
    await query('DELETE FROM game_scores WHERE id = $1', [scoreId]);
    return { changes: 1 };
  }
};

// 每日任务相关操作
const taskOperations = {
  // 创建任务
  create: async (taskDate, gameType, targetScore, pointsReward, description) => {
    const result = await query(
      'INSERT INTO daily_tasks (task_date, game_type, target_score, points_reward, description) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [taskDate, gameType, targetScore, pointsReward, description]
    );
    return { lastID: result.rows[0].id };
  },

  // 获取今日任务
  getTodayTasks: async () => {
    const result = await query('SELECT * FROM daily_tasks WHERE task_date = CURRENT_DATE');
    return result.rows;
  },

  // 获取任务历史
  getHistory: async (userId, limit = 10) => {
    const result = await query(`
      SELECT t.*, ut.completed, ut.completed_at
      FROM daily_tasks t
      JOIN user_tasks ut ON t.id = ut.task_id
      WHERE ut.user_id = $1
      ORDER BY ut.completed_at DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows;
  },

  // 完成任务
  complete: async (userId, taskId) => {
    // 检查是否已完成
    const existingResult = await query(
      'SELECT * FROM user_tasks WHERE user_id = $1 AND task_id = $2',
      [userId, taskId]
    );

    const existing = existingResult.rows[0];

    if (existing && existing.completed) {
      return { alreadyCompleted: true };
    }

    if (existing) {
      await query(
        'UPDATE user_tasks SET completed = 1, completed_at = CURRENT_TIMESTAMP WHERE id = $1',
        [existing.id]
      );
    } else {
      await query(
        'INSERT INTO user_tasks (user_id, task_id, completed, completed_at) VALUES ($1, $2, 1, CURRENT_TIMESTAMP)',
        [userId, taskId]
      );
    }

    // 获取任务奖励
    const taskResult = await query('SELECT points_reward FROM daily_tasks WHERE id = $1', [taskId]);
    const task = taskResult.rows[0];
    return { pointsReward: task ? task.points_reward : 0 };
  },

  // 检查任务完成条件
  checkTaskCompletion: async (userId, gameType, score) => {
    const timeBasedGames = ['f1_reaction', 'schulte_grid', 'schulte_grid_3', 'schulte_grid_4', 'schulte_grid_5'];
    let comparison;

    if (timeBasedGames.includes(gameType)) {
      comparison = `target_score >= ${score}`;
    } else {
      comparison = `${score} >= target_score`;
    }

    const result = await query(`
      SELECT * FROM daily_tasks
      WHERE task_date = CURRENT_DATE
      AND game_type = $1
      AND ${comparison}
      AND id NOT IN (
        SELECT task_id FROM user_tasks
        WHERE user_id = $2 AND completed = 1
      )
    `, [gameType, userId]);

    return result.rows;
  },

  // 生成每日任务
  generateDailyTasks: async () => {
    // 检查今日任务是否已生成
    const result = await query('SELECT COUNT(*) as count FROM daily_tasks WHERE task_date = CURRENT_DATE');

    if (result.rows[0].count > 0) {
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

    // 插入任务（使用当前日期）
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 格式
    for (const task of selectedTasks) {
      await taskOperations.create(today, task.type, task.target, task.reward, task.desc);
    }

    return { created: selectedTasks.length };
  },

  // 获取所有任务（管理员用）
  getAll: async () => {
    const result = await query('SELECT * FROM daily_tasks ORDER BY task_date DESC');
    return result.rows;
  },

  // 删除任务
  delete: async (taskId) => {
    await query('DELETE FROM daily_tasks WHERE id = $1', [taskId]);
    return { changes: 1 };
  }
};

// 统计相关操作
const statsOperations = {
  // 获取平台统计
  getPlatformStats: async () => {
    const userCount = await query('SELECT COUNT(*) as count FROM users');
    const scoreCount = await query('SELECT COUNT(*) as count FROM game_scores');
    const totalPoints = await query('SELECT SUM(points) as total FROM users');
    const todayActive = await query(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM game_scores
      WHERE DATE(played_at) = CURRENT_DATE
    `);

    return {
      totalUsers: userCount.rows[0].count,
      totalScores: scoreCount.rows[0].count,
      totalPointsAwarded: totalPoints.rows[0].total || 0,
      todayActiveUsers: todayActive.rows[0].count
    };
  },

  // 获取用户统计
  getUserStats: async (userId) => {
    const totalGames = await query('SELECT COUNT(*) as count FROM game_scores WHERE user_id = $1', [userId]);
    const totalPointsEarned = await query('SELECT SUM(points_earned) as total FROM game_scores WHERE user_id = $1', [userId]);
    const completedTasks = await query('SELECT COUNT(*) as count FROM user_tasks WHERE user_id = $1 AND completed = 1', [userId]);

    // 最佳成绩
    const bestF1 = await query('SELECT MIN(score) as best FROM game_scores WHERE user_id = $1 AND game_type = $2', [userId, 'f1_reaction']);
    const bestSchulte = await query('SELECT MIN(score) as best FROM game_scores WHERE user_id = $1 AND game_type = $2', [userId, 'schulte_grid']);

    return {
      totalGames: totalGames.rows[0].count,
      totalPointsEarned: totalPointsEarned.rows[0].total || 0,
      completedTasks: completedTasks.rows[0].count,
      bestF1Reaction: bestF1.rows[0].best,
      bestSchulteGrid: bestSchulte.rows[0].best
    };
  }
};

// 赛季相关操作
const seasonOperations = {
  // 创建赛季
  create: async (name, description, startDate, endDate) => {
    const result = await query(
      'INSERT INTO seasons (name, description, start_date, end_date) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, description, startDate, endDate]
    );
    return { lastID: result.rows[0].id };
  },

  // 获取所有赛季
  getAll: async () => {
    const result = await query('SELECT * FROM seasons ORDER BY created_at DESC');
    return result.rows;
  },

  // 获取当前活跃赛季
  getActiveSeason: async () => {
    const now = new Date().toISOString();
    const result = await query(
      'SELECT * FROM seasons WHERE start_date <= $1 AND end_date >= $2 AND is_active = 1 ORDER BY created_at DESC LIMIT 1',
      [now, now]
    );
    return result.rows[0];
  },

  // 根据ID获取赛季
  getById: async (seasonId) => {
    const result = await query('SELECT * FROM seasons WHERE id = $1', [seasonId]);
    return result.rows[0];
  },

  // 更新赛季
  update: async (seasonId, data) => {
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (data.name) {
      updates.push(`name = $${paramCount++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(data.description);
    }
    if (data.startDate) {
      updates.push(`start_date = $${paramCount++}`);
      values.push(data.startDate);
    }
    if (data.endDate) {
      updates.push(`end_date = $${paramCount++}`);
      values.push(data.endDate);
    }
    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(data.isActive);
    }

    if (updates.length === 0) return null;

    values.push(seasonId);
    const sql = `UPDATE seasons SET ${updates.join(', ')} WHERE id = $${paramCount}`;
    await query(sql, values);
    return { changes: 1 };
  },

  // 删除赛季
  delete: async (seasonId) => {
    await query('DELETE FROM seasons WHERE id = $1', [seasonId]);
    return { changes: 1 };
  },

  // 获取赛季排行榜（指定赛季和游戏类型）
  getSeasonLeaderboard: async (seasonId, gameType, limit = 20) => {
    const timeBasedGames = ['f1_reaction', 'schulte_grid', 'schulte_grid_3', 'schulte_grid_4', 'schulte_grid_5'];
    const sortOrder = timeBasedGames.includes(gameType) ? 'ASC' : 'DESC';

    const result = await query(`
      WITH ranked_season_scores AS (
        SELECT
          user_id,
          score,
          points_earned,
          played_at,
          ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY score ${sortOrder}) as rn
        FROM game_scores
        WHERE game_type = $1 AND season_id = $2
      )
      SELECT u.username, s.score, s.points_earned, s.played_at
      FROM ranked_season_scores s
      JOIN users u ON s.user_id = u.id
      WHERE s.rn = 1
      ORDER BY s.score ${sortOrder}
      LIMIT $3
    `, [gameType, seasonId, limit]);

    return result.rows;
  },

  // 获取赛季总积分排行榜
  getSeasonTotalLeaderboard: async (seasonId, limit = 50) => {
    const result = await query(`
      SELECT u.id, u.username, SUM(s.points_earned) as total_points
      FROM game_scores s
      JOIN users u ON s.user_id = u.id
      WHERE s.season_id = $1
      GROUP BY u.id, u.username
      ORDER BY total_points DESC
      LIMIT $2
    `, [seasonId, limit]);

    return result.rows;
  },

  // 获取赛季统计
  getSeasonStats: async (seasonId) => {
    const totalScores = await query('SELECT COUNT(*) as count FROM game_scores WHERE season_id = $1', [seasonId]);
    const totalPoints = await query('SELECT SUM(points_earned) as total FROM game_scores WHERE season_id = $1', [seasonId]);
    const activeUsers = await query('SELECT COUNT(DISTINCT user_id) as count FROM game_scores WHERE season_id = $1', [seasonId]);

    return {
      totalScores: totalScores.rows[0].count,
      totalPointsAwarded: totalPoints.rows[0].total || 0,
      activeUsers: activeUsers.rows[0].count
    };
  }
};

// 检查并创建/更新管理员账户
async function ensureAdminUser() {
  try {
    const result = await userOperations.findByUsername('admin');
    const correctPasswordHash = require('bcrypt').hashSync('admin1234', 10);

    if (!result) {
      // 不存在则创建
      await userOperations.create('admin', 'admin1234', 1);
      console.log('默认管理员账户已创建: admin/admin1234');
    } else {
      // 存在则检查密码是否正确，不正确则更新
      const currentPasswordHash = result.password;
      const passwordMatch = require('bcrypt').compareSync('admin1234', currentPasswordHash);
      if (!passwordMatch) {
        await query('UPDATE users SET password = $1 WHERE username = $2', [correctPasswordHash, 'admin']);
        console.log('管理员密码已重置为: admin/admin1234');
      } else {
        console.log('管理员账户已存在且密码正确: admin/admin1234');
      }
    }
  } catch (err) {
    console.error('管理员账户处理失败:', err);
  }
}

// 导出操作
module.exports = {
  pool,
  query,
  userOperations,
  scoreOperations,
  taskOperations,
  statsOperations,
  seasonOperations,
  ensureAdminUser
};

// 初始化数据库（仅在非 Vercel 环境或首次连接时）
const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';
if (!isVercel) {
  initializeDatabase().catch(err => {
    console.error('数据库初始化失败:', err);
    process.exit(1);
  });
} else {
  // Vercel 环境：延迟初始化，确保已连接数据库
  pool.connect()
    .then(client => {
      console.log('已连接到 PostgreSQL 数据库 (Vercel/Production)');
      client.release();
      return initializeDatabase();
    })
    .catch(err => {
      console.error('数据库连接或初始化失败:', err);
    });
}
