const db = require('./database');

async function testLeaderboard() {
  try {
    console.log('测试排行榜查询...\n');

    // 测试各个游戏的排行榜
    const gameTypes = [
      'f1_reaction',
      'schulte_grid_3',
      'schulte_grid_4',
      'schulte_grid_5',
      'snake',
      'breakout'
    ];

    for (const gameType of gameTypes) {
      console.log(`\n${gameType} 排行榜:`);
      const leaderboard = await db.scoreOperations.getLeaderboard(gameType);

      if (leaderboard.length === 0) {
        console.log('  暂无数据');
      } else {
        leaderboard.forEach((item, index) => {
          if (gameType.startsWith('schulte_grid') || gameType === 'f1_reaction') {
            console.log(`  #${index + 1} ${item.username}: ${item.score.toFixed(2)}s`);
          } else {
            console.log(`  #${index + 1} ${item.username}: ${Math.floor(item.score)}分`);
          }
        });
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('错误:', error);
    process.exit(1);
  }
}

testLeaderboard();
