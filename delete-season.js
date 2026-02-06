const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'focus_platform.db');
const db = new sqlite3.Database(dbPath);

db.run('DELETE FROM seasons WHERE id = 2', [], (err) => {
  if (err) {
    console.error('删除失败:', err);
  } else {
    console.log('已删除旧的测试赛季');
  }

  db.close();
});
