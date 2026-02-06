// 游戏核心逻辑

class ReactionGame {
    constructor() {
        this.gameState = 'idle'; // idle, lights, waiting, result, falseStart
        this.lightsSequence = null;
        this.startTime = 0;
        this.reactTime = 0;
        this.lightInterval = 1000; // 每盏灯间隔1秒
        this.currentLight = 0;
        this.randomDelayTimeout = null;

        this.init();
    }

    init() {
        // 获取DOM元素
        this.lights = [
            document.getElementById('light1'),
            document.getElementById('light2'),
            document.getElementById('light3'),
            document.getElementById('light4'),
            document.getElementById('light5')
        ];
        this.resultTime = document.getElementById('resultTime');
        this.resultRank = document.getElementById('resultRank');
        this.resultF1 = document.getElementById('resultF1');
        this.statusMessage = document.getElementById('statusMessage');
        this.startBtn = document.getElementById('startBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.playerNameInput = document.getElementById('playerName');
        this.switchPlayerBtn = document.getElementById('switchPlayerBtn');

        // 设置当前玩家名
        this.playerNameInput.value = dataManager.currentPlayer;

        // 绑定事件
        this.startBtn.addEventListener('click', () => this.startGame());
        this.resetBtn.addEventListener('click', () => this.resetGame());
        this.switchPlayerBtn.addEventListener('click', () => this.switchPlayer());

        // 键盘事件
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.handleSpaceKey();
            }
        });

        // 标签页切换
        this.initTabs();

        // 初始更新UI
        this.updateAllUI();
    }

    // 初始化标签页
    initTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabPanels = document.querySelectorAll('.tab-panel');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;

                // 移除所有活动状态
                tabBtns.forEach(b => b.classList.remove('active'));
                tabPanels.forEach(p => p.classList.remove('active'));

                // 添加活动状态
                btn.classList.add('active');
                document.getElementById(tabName).classList.add('active');

                // 如果切换到统计标签，绘制图表
                if (tabName === 'stats') {
                    this.drawTrendChart();
                }
            });
        });
    }

    // 切换玩家
    switchPlayer() {
        const newName = this.playerNameInput.value.trim();
        if (newName && dataManager.switchPlayer(newName)) {
            this.showMessage(`已切换到玩家: ${newName}`, 'success');
            this.updateAllUI();
        }
    }

    // 开始游戏
    startGame() {
        if (this.gameState !== 'idle') return;

        // 恢复音频上下文
        soundManager.resume();

        this.gameState = 'lights';
        this.currentLight = 0;
        this.resetLights();

        // 清除上次的结果显示
        this.resultTime.textContent = '--';
        this.resultRank.textContent = '';
        this.resultF1.textContent = '';

        this.showMessage('准备...', '');

        // 禁用开始按钮
        this.startBtn.disabled = true;

        // 开始亮灯序列
        this.lightsSequence = setInterval(() => {
            this.turnOnLight(this.currentLight);
            soundManager.playBeep();
            this.currentLight++;

            if (this.currentLight >= 5) {
                clearInterval(this.lightsSequence);
                this.allLightsOn();
            }
        }, this.lightInterval);
    }

    // 亮起一盏灯
    turnOnLight(index) {
        if (this.lights[index]) {
            this.lights[index].classList.add('on');
        }
    }

    // 所有灯都亮了
    allLightsOn() {
        this.gameState = 'waiting';
        this.showMessage('等待信号...', '');

        // 随机延迟后熄灭所有灯 (0.2-3秒)
        const randomDelay = Math.random() * 2800 + 200;
        this.randomDelayTimeout = setTimeout(() => {
            this.lightsOut();
        }, randomDelay);
    }

    // 灯灭
    lightsOut() {
        this.gameState = 'result';
        this.resetLights();
        soundManager.playLightsOut();

        // 记录开始时间
        this.startTime = performance.now();
        this.showMessage('按空格键！！！', 'success');
    }

    // 处理空格键
    handleSpaceKey() {
        switch (this.gameState) {
            case 'idle':
                // 空闲状态 - 开始新游戏
                this.startGame();
                break;
            case 'lights':
            case 'waiting':
                // 游戏进行中 - 抢跑
                this.falseStart();
                break;
            case 'result':
                // 记录反应时间
                this.recordReaction();
                break;
            case 'falseStart':
                // 重置游戏
                this.resetGame();
                break;
        }
    }

    // 抢跑
    falseStart() {
        this.gameState = 'falseStart';

        // 清除定时器
        if (this.lightsSequence) {
            clearInterval(this.lightsSequence);
            this.lightsSequence = null;
        }
        if (this.randomDelayTimeout) {
            clearTimeout(this.randomDelayTimeout);
            this.randomDelayTimeout = null;
        }

        soundManager.playFalseStart();
        this.showMessage('抢跑！按空格键重新开始', 'warning');

        // 记录抢跑
        dataManager.addTestResult(0, true);
        this.updateAllUI();
    }

    // 记录反应时间
    recordReaction() {
        const endTime = performance.now();
        this.reactTime = (endTime - this.startTime) / 1000; // 转换为秒

        // 显示结果
        this.displayResult();

        // 保存结果
        const playerData = dataManager.addTestResult(this.reactTime, false);
        const isNewRecord = this.checkNewRecord(playerData);

        if (isNewRecord) {
            soundManager.playNewRecord();
            this.showMessage('新纪录！按空格键或点击开始继续测试', 'success');
        } else {
            this.showMessage('按空格键或点击开始继续测试', 'success');
        }

        // 更新UI
        this.updateAllUI();

        // 重置游戏状态
        this.gameState = 'idle';
        this.startBtn.disabled = false;
    }

    // 检查是否是新纪录
    checkNewRecord(playerData) {
        if (playerData.history.length === 0) return false;

        const bestTime = Math.min(...playerData.history.map(r => r.time));
        return this.reactTime === bestTime;
    }

    // 显示结果
    displayResult() {
        // 显示时间（保留3位小数）
        this.resultTime.textContent = this.reactTime.toFixed(3) + ' 秒';

        // 显示评级
        const rank = this.getRank(this.reactTime);
        this.resultRank.textContent = rank.text;
        this.resultRank.style.color = rank.color;

        // 显示与F1车手的对比
        const f1Avg = 0.215;
        const diff = this.reactTime - f1Avg;
        if (diff < 0) {
            this.resultF1.textContent = `比F1车手快 ${Math.abs(diff).toFixed(3)} 秒！`;
            this.resultF1.style.color = '#4ecca3';
        } else {
            this.resultF1.textContent = `比F1车手慢 ${diff.toFixed(3)} 秒`;
            this.resultF1.style.color = '#ff6b6b';
        }
    }

    // 获取评级
    getRank(time) {
        if (time < 0.200) {
            return { text: '🏆 F1 车手级别', color: '#ffd700' };
        } else if (time < 0.230) {
            return { text: '🥇 职业级', color: '#ffd700' };
        } else if (time < 0.250) {
            return { text: '🥈 优秀', color: '#c0c0c0' };
        } else if (time < 0.300) {
            return { text: '🥉 良好', color: '#cd7f32' };
        } else {
            return { text: '普通级别', color: '#aaa' };
        }
    }

    // 重置游戏
    resetGame() {
        // 清除定时器
        if (this.lightsSequence) {
            clearInterval(this.lightsSequence);
            this.lightsSequence = null;
        }
        if (this.randomDelayTimeout) {
            clearTimeout(this.randomDelayTimeout);
            this.randomDelayTimeout = null;
        }

        this.gameState = 'idle';
        this.resetLights();
        this.resultTime.textContent = '--';
        this.resultRank.textContent = '';
        this.resultF1.textContent = '';
        this.showMessage('按空格键或点击"开始测试"按钮开始', '');
        this.startBtn.disabled = false;
    }

    // 重置所有灯
    resetLights() {
        this.lights.forEach(light => {
            light.classList.remove('on');
        });
    }

    // 显示消息
    showMessage(text, type = '') {
        this.statusMessage.textContent = text;
        this.statusMessage.className = 'status-message ' + type;
    }

    // 更新所有UI
    updateAllUI() {
        this.updateLeaderboard();
        this.updateStats();
        this.updateAchievements();
    }

    // 更新排行榜
    updateLeaderboard() {
        const leaderboard = dataManager.getLeaderboard();
        const container = document.getElementById('leaderboardList');

        if (leaderboard.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:#aaa;padding:20px;">暂无记录</div>';
            return;
        }

        container.innerHTML = leaderboard.map((record, index) => {
            const rankClass = index < 3 ? `rank-${index + 1}` : '';
            const date = new Date(record.date).toLocaleDateString('zh-CN');

            return `
                <div class="leaderboard-item">
                    <div class="leaderboard-rank ${rankClass}">${index + 1}</div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${record.player}</div>
                        <div class="leaderboard-date">${date}</div>
                    </div>
                    <div class="leaderboard-time">${record.time.toFixed(3)}s</div>
                </div>
            `;
        }).join('');
    }

    // 更新统计数据
    updateStats() {
        const stats = dataManager.getPlayerStats(dataManager.currentPlayer);

        document.getElementById('totalTests').textContent = stats.totalTests;
        document.getElementById('bestTime').textContent =
            stats.bestTime ? stats.bestTime.toFixed(3) + 's' : '--';
        document.getElementById('avgTime').textContent =
            stats.avgTime ? stats.avgTime.toFixed(3) + 's' : '--';

        // 更新历史记录
        const historyList = document.getElementById('historyList');
        if (stats.history.length === 0) {
            historyList.innerHTML = '<div style="text-align:center;color:#aaa;padding:20px;">暂无记录</div>';
        } else {
            historyList.innerHTML = stats.history.slice().reverse().map(record => {
                const date = new Date(record.date);
                const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

                return `
                    <div class="history-item">
                        <span class="history-time">${record.time.toFixed(3)}s</span>
                        <span class="history-date">${dateStr}</span>
                    </div>
                `;
            }).join('');
        }

        // 绘制趋势图
        this.drawTrendChart();
    }

    // 绘制趋势图
    drawTrendChart() {
        const canvas = document.getElementById('trendChart');
        const ctx = canvas.getContext('2d');
        const stats = dataManager.getPlayerStats(dataManager.currentPlayer);

        // 清空画布
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const recentHistory = stats.history.slice(-10);
        if (recentHistory.length < 2) {
            ctx.fillStyle = '#aaa';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('需要至少2次测试数据才能显示趋势图', canvas.width / 2, canvas.height / 2);
            return;
        }

        const padding = 40;
        const graphWidth = canvas.width - padding * 2;
        const graphHeight = canvas.height - padding * 2;

        // 找出最大值和最小值
        const times = recentHistory.map(r => r.time);
        const maxTime = Math.max(...times) * 1.1;
        const minTime = Math.min(...times) * 0.9;

        // 绘制背景网格
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;

        for (let i = 0; i <= 5; i++) {
            const y = padding + (graphHeight / 5) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(canvas.width - padding, y);
            ctx.stroke();
        }

        // 绘制数据线
        ctx.strokeStyle = '#4ecca3';
        ctx.lineWidth = 3;
        ctx.beginPath();

        recentHistory.forEach((record, index) => {
            const x = padding + (graphWidth / (recentHistory.length - 1)) * index;
            const y = padding + graphHeight - ((record.time - minTime) / (maxTime - minTime)) * graphHeight;

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        // 绘制数据点
        recentHistory.forEach((record, index) => {
            const x = padding + (graphWidth / (recentHistory.length - 1)) * index;
            const y = padding + graphHeight - ((record.time - minTime) / (maxTime - minTime)) * graphHeight;

            ctx.fillStyle = '#e94560';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();

            // 显示数值
            ctx.fillStyle = '#fff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(record.time.toFixed(3), x, y - 10);
        });
    }

    // 更新成就显示
    updateAchievements() {
        const achievements = dataManager.getPlayerAchievements(dataManager.currentPlayer);
        const container = document.getElementById('achievementsList');

        container.innerHTML = achievements.map(achievement => {
            const playerData = dataManager.getPlayerData(dataManager.currentPlayer);
            const unlockedDate = playerData.achievements.includes(achievement.id) ?
                '已解锁' : '未解锁';

            return `
                <div class="achievement-item ${achievement.unlocked ? 'unlocked' : 'locked'}">
                    <div class="achievement-icon">${achievement.icon}</div>
                    <div class="achievement-name">${achievement.name}</div>
                    <div class="achievement-desc">${achievement.description}</div>
                    ${achievement.unlocked ? '<div class="achievement-date">✓ 已解锁</div>' : ''}
                </div>
            `;
        }).join('');
    }
}

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// 初始化游戏
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new ReactionGame();
});
