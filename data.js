// 数据管理和统计系统

class DataManager {
    constructor() {
        this.currentPlayer = this.loadCurrentPlayer();
        this.allData = this.loadData();
        this.achievements = this.initAchievements();
    }

    // 初始化成就列表
    initAchievements() {
        return [
            {
                id: 'first_test',
                name: '初出茅庐',
                description: '完成第一次测试',
                icon: '🎮',
                condition: (stats) => stats.totalTests >= 1
            },
            {
                id: 'lightning_fast',
                name: '反应神速',
                description: '反应时间 < 0.200秒',
                icon: '⚡',
                condition: (stats, lastTime) => lastTime < 0.200
            },
            {
                id: 'f1_driver',
                name: 'F1车手',
                description: '反应时间达到 0.215秒',
                icon: '🏎️',
                condition: (stats, lastTime) => lastTime <= 0.215
            },
            {
                id: 'stable_performance',
                name: '稳定发挥',
                description: '连续5次成绩在0.250秒以内',
                icon: '🎯',
                condition: (stats) => this.checkStablePerformance(stats.history)
            },
            {
                id: 'persistent',
                name: '坚持不懈',
                description: '完成50次测试',
                icon: '💪',
                condition: (stats) => stats.totalTests >= 50
            },
            {
                id: 'precise',
                name: '精准如钟',
                description: '3次成绩都在0.220-0.230秒之间',
                icon: '⏱️',
                condition: (stats) => this.checkPrecisePerformance(stats.history)
            },
            {
                id: 'false_start_master',
                name: '抢跑大师',
                description: '抢跑10次（有趣成就）',
                icon: '😅',
                condition: (stats) => stats.falseStarts >= 10
            },
            {
                id: 'daily_player',
                name: '日复一日',
                description: '连续7天游玩',
                icon: '📅',
                condition: (stats) => this.checkDailyStreak(stats.history)
            }
        ];
    }

    // 检查稳定发挥成就
    checkStablePerformance(history) {
        if (history.length < 5) return false;
        const recent = history.slice(-5);
        return recent.every(record => record.time < 0.250);
    }

    // 检查精准成就
    checkPrecisePerformance(history) {
        if (history.length < 3) return false;
        const inRange = history.filter(r => r.time >= 0.220 && r.time <= 0.230);
        return inRange.length >= 3;
    }

    // 检查连续游玩成就
    checkDailyStreak(history) {
        if (history.length < 7) return false;

        const dates = [...new Set(history.map(r =>
            new Date(r.date).toDateString()
        ))];

        if (dates.length < 7) return false;

        // 检查连续7天
        const sortedDates = dates.map(d => new Date(d)).sort((a, b) => a - b);
        let streak = 1;
        let maxStreak = 1;

        for (let i = 1; i < sortedDates.length; i++) {
            const diff = (sortedDates[i] - sortedDates[i-1]) / (1000 * 60 * 60 * 24);
            if (diff === 1) {
                streak++;
                maxStreak = Math.max(maxStreak, streak);
            } else if (diff > 1) {
                streak = 1;
            }
        }

        return maxStreak >= 7;
    }

    // 从本地存储加载数据
    loadData() {
        try {
            const data = localStorage.getItem('f1ReactionTest');
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.error('Error loading data:', e);
            return {};
        }
    }

    // 保存数据到本地存储
    saveData() {
        try {
            localStorage.setItem('f1ReactionTest', JSON.stringify(this.allData));
        } catch (e) {
            console.error('Error saving data:', e);
        }
    }

    // 加载当前玩家
    loadCurrentPlayer() {
        try {
            return localStorage.getItem('f1CurrentPlayer') || 'Player';
        } catch (e) {
            return 'Player';
        }
    }

    // 保存当前玩家
    saveCurrentPlayer(name) {
        try {
            localStorage.setItem('f1CurrentPlayer', name);
            this.currentPlayer = name;
        } catch (e) {
            console.error('Error saving current player:', e);
        }
    }

    // 获取玩家数据
    getPlayerData(playerName) {
        if (!this.allData[playerName]) {
            this.allData[playerName] = {
                history: [],
                achievements: [],
                totalTests: 0,
                falseStarts: 0
            };
        }
        return this.allData[playerName];
    }

    // 添加测试结果
    addTestResult(time, isFalseStart = false) {
        const playerData = this.getPlayerData(this.currentPlayer);

        if (isFalseStart) {
            playerData.falseStarts++;
        } else {
            const result = {
                time: time,
                date: new Date().toISOString(),
                player: this.currentPlayer
            };
            playerData.history.push(result);
            playerData.totalTests++;

            // 只保留最近50次记录
            if (playerData.history.length > 50) {
                playerData.history = playerData.history.slice(-50);
            }

            // 检查成就
            this.checkAchievements(playerData, time);
        }

        this.saveData();
        return playerData;
    }

    // 检查并解锁成就
    checkAchievements(playerData, lastTime) {
        const stats = this.getPlayerStats(this.currentPlayer);

        this.achievements.forEach(achievement => {
            if (!playerData.achievements.includes(achievement.id)) {
                try {
                    if (achievement.condition(stats, lastTime)) {
                        playerData.achievements.push(achievement.id);
                        soundManager.playAchievement();
                        this.showAchievementNotification(achievement);
                    }
                } catch (e) {
                    console.error('Error checking achievement:', e);
                }
            }
        });
    }

    // 显示成就解锁通知
    showAchievementNotification(achievement) {
        const notification = document.createElement('div');
        notification.className = 'achievement-notification';
        notification.innerHTML = `
            <div class="achievement-popup">
                <div class="achievement-icon">${achievement.icon}</div>
                <div class="achievement-info">
                    <div class="achievement-title">成就解锁！</div>
                    <div class="achievement-name">${achievement.name}</div>
                </div>
            </div>
        `;

        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #4ecca3 0%, #45b793 100%);
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.5);
            z-index: 1000;
            animation: slideIn 0.5s ease;
            display: flex;
            align-items: center;
            gap: 15px;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.5s ease';
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    }

    // 获取玩家统计信息
    getPlayerStats(playerName) {
        const playerData = this.getPlayerData(playerName);
        const history = playerData.history.filter(r => !r.isFalseStart);

        const stats = {
            totalTests: playerData.totalTests,
            falseStarts: playerData.falseStarts,
            history: history,
            bestTime: null,
            avgTime: null
        };

        if (history.length > 0) {
            stats.bestTime = Math.min(...history.map(r => r.time));
            stats.avgTime = history.reduce((sum, r) => sum + r.time, 0) / history.length;
        }

        return stats;
    }

    // 获取排行榜
    getLeaderboard() {
        let allResults = [];

        Object.keys(this.allData).forEach(playerName => {
            const playerData = this.allData[playerName];
            playerData.history.forEach(record => {
                allResults.push({
                    player: playerName,
                    time: record.time,
                    date: record.date
                });
            });
        });

        // 按时间排序并取前10
        allResults.sort((a, b) => a.time - b.time);
        return allResults.slice(0, 10);
    }

    // 获取玩家成就
    getPlayerAchievements(playerName) {
        const playerData = this.getPlayerData(playerName);
        return this.achievements.map(achievement => ({
            ...achievement,
            unlocked: playerData.achievements.includes(achievement.id)
        }));
    }

    // 切换玩家
    switchPlayer(playerName) {
        if (playerName && playerName.trim()) {
            this.saveCurrentPlayer(playerName.trim());
            return true;
        }
        return false;
    }
}

// 创建全局数据管理器实例
const dataManager = new DataManager();
