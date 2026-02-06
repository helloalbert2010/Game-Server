const db = require('./database');

async function migrateDatabase() {
  try {
    console.log('开始数据库迁移...');

    // 检查season_id列是否已存在
    const checkResult = await new Promise((resolve, reject) => {
      db.db.all('PRAGMA table_info(game_scores)', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const hasSeasonId = checkResult.some(col => col.name === 'season_id');

    if (!hasSeasonId) {
      console.log('添加 season_id 列到 game_scores 表...');
      await new Promise((resolve, reject) => {
        db.db.run('ALTER TABLE game_scores ADD COLUMN season_id INTEGER', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log('✓ season_id 列添加成功');
    } else {
      console.log('✓ season_id 列已存在');
    }

    // 检查seasons表是否存在
    const tables = await new Promise((resolve, reject) => {
      db.db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='seasons'", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (tables.length === 0) {
      console.log('创建 seasons 表...');

      // 直接使用SQLite执行
      await new Promise((resolve, reject) => {
        db.db.run(`
          CREATE TABLE seasons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log('✓ seasons 表创建成功');
    } else {
      console.log('✓ seasons 表已存在');
    }

    console.log('\n数据库迁移完成！');
    process.exit(0);
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  }
}

migrateDatabase();
