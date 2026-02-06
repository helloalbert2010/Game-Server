const db = require('./database');

async function checkDatabase() {
  try {
    // 检查游戏成绩数量
    const scoresCount = await new Promise((resolve, reject) => {
      db.db.get('SELECT COUNT(*) as count FROM game_scores', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    console.log(`游戏成绩总数: ${scoresCount}`);

    // 获取所有游戏成绩
    const scores = await db.scoreOperations.getAll();
    console.log('\n所有游戏成绩:');
    console.log(JSON.stringify(scores, null, 2));

    // 测试各个游戏的排行榜
    const gameTypes = ['f1_reaction', 'schulte_grid', 'snake', 'breakout'];

    for (const gameType of gameTypes) {
      const leaderboard = await db.scoreOperations.getLeaderboard(gameType);
      console.log(`\n${gameType} 排行榜 (${leaderboard.length} 条):`);
      console.log(JSON.stringify(leaderboard, null, 2));
    }

    process.exit(0);
  } catch (error) {
    console.error('错误:', error);
    process.exit(1);
  }
}

checkDatabase();
