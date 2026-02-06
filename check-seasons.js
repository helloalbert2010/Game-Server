const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'focus_platform.db');
const db = new sqlite3.Database(dbPath);

db.all('SELECT id, name, description, start_date, end_date, is_active, created_at FROM seasons', [], (err, rows) => {
  if (err) {
    console.error('查询失败:', err);
  } else {
    console.log('数据库中的赛季:');
    console.table(rows);

    // 检查当前时间
    const now = new Date().toISOString();
    console.log('\n当前时间:', now);

    // 检查哪些赛季应该是活跃的
    rows.forEach(season => {
      const isActive = season.start_date <= now && season.end_date >= now && season.is_active === 1;
      console.log(`\n赛季 ${season.id} "${season.name}":`);
      console.log(`  开始时间: ${season.start_date}`);
      console.log(`  结束时间: ${season.end_date}`);
      console.log(`  is_active标志: ${season.is_active}`);
      console.log(`  是否在时间范围内: ${season.start_date <= now && season.end_date >= now}`);
      console.log(`  应该是活跃的: ${isActive}`);
    });
  }

  db.close();
});
