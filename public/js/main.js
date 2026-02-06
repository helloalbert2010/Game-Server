// API 基础 URL
const API_BASE = window.location.origin;

// 工具函数：显示 toast 通知
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:20px;">&times;</button>
  `;
  container.appendChild(toast);

  // 3秒后自动移除
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

// 工具函数：发送 API 请求
async function apiRequest(endpoint, options = {}) {
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const response = await fetch(`${API_BASE}/api${endpoint}`, {
    ...defaultOptions,
    ...options
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || '请求失败');
  }

  return data;
}

// 检查登录状态
async function checkAuth() {
  try {
    const response = await fetch(`${API_BASE}/api/me`);
    if (response.ok) {
      const data = await response.json();
      return data.user;
    }
    return null;
  } catch (error) {
    return null;
  }
}

// 登录
async function login(username, password) {
  try {
    const data = await apiRequest('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    showToast('登录成功！', 'success');
    return data.user;
  } catch (error) {
    showToast(error.message, 'error');
    throw error;
  }
}

// 注册
async function register(username, password) {
  try {
    const data = await apiRequest('/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    showToast('注册成功！', 'success');
    return data.user;
  } catch (error) {
    showToast(error.message, 'error');
    throw error;
  }
}

// 登出
async function logout() {
  try {
    await apiRequest('/logout', { method: 'POST' });
    showToast('已登出', 'info');
    window.location.href = '/';
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// 获取当前用户信息
async function getCurrentUser() {
  try {
    const data = await apiRequest('/me');
    return data.user;
  } catch (error) {
    return null;
  }
}

// 格式化时间
function formatTime(seconds) {
  if (seconds < 1) {
    return `${(seconds * 1000).toFixed(0)}ms`;
  }
  return `${seconds.toFixed(2)}s`;
}

// 格式化日期
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;

  // 小于1分钟
  if (diff < 60000) {
    return '刚刚';
  }

  // 小于1小时
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`;
  }

  // 小于1天
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`;
  }

  // 小于1周
  if (diff < 604800000) {
    return `${Math.floor(diff / 86400000)}天前`;
  }

  // 返回完整日期
  return date.toLocaleDateString('zh-CN');
}

// 加载动画
function showLoading(element) {
  element.innerHTML = '<div class="loading">加载中</div>';
}

function hideLoading(element, content) {
  element.innerHTML = content;
}

// 提交游戏成绩
async function submitScore(gameType, score) {
  try {
    const data = await apiRequest('/games/score', {
      method: 'POST',
      body: JSON.stringify({ gameType, score })
    });

    let message = `+${data.pointsEarned} 积分`;
    if (data.taskReward > 0) {
      message += `\n任务奖励: +${data.taskReward} 积分`;
    }

    showToast(message, 'success');
    return data;
  } catch (error) {
    showToast(error.message, 'error');
    throw error;
  }
}

// 获取排行榜
async function getLeaderboard(type = 'total') {
  try {
    const data = await apiRequest(`/leaderboard/${type}`);
    return data.leaderboard;
  } catch (error) {
    console.error('获取排行榜失败:', error);
    return [];
  }
}

// 获取今日任务
async function getTodayTasks() {
  try {
    const data = await apiRequest('/tasks/today');
    return data.tasks;
  } catch (error) {
    console.error('获取任务失败:', error);
    return [];
  }
}

// 获取用户统计
async function getUserStats() {
  try {
    const data = await apiRequest('/stats/user');
    return data.stats;
  } catch (error) {
    console.error('获取统计失败:', error);
    return null;
  }
}

// 渲染排行榜
function renderLeaderboard(leaderboard, container) {
  if (!leaderboard || leaderboard.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-400">暂无数据</p>';
    return;
  }

  const html = `
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th>排名</th>
          <th>用户</th>
          <th>分数/积分</th>
          <th>时间</th>
        </tr>
      </thead>
      <tbody>
        ${leaderboard.map((item, index) => `
          <tr>
            <td class="rank-${index + 1}">#${index + 1}</td>
            <td>${item.username}</td>
            <td>${item.points !== undefined ? item.points : formatTime(item.score)}</td>
            <td>${item.played_at ? formatDate(item.played_at) : '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

// 渲染任务列表
function renderTasks(tasks, container) {
  if (!tasks || tasks.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-400">暂无任务</p>';
    return;
  }

  const html = tasks.map(task => `
    <div class="task-item ${task.completed ? 'completed' : ''}">
      <div class="task-info">
        <div class="task-title">${task.description}</div>
        <div class="task-reward">⭐ 奖励: ${task.points_reward} 积分</div>
      </div>
      <div class="task-status ${task.completed ? 'completed' : 'pending'}">
        ${task.completed ? '✓ 已完成' : '进行中'}
      </div>
    </div>
  `).join('');

  container.innerHTML = html;
}

// 获取活跃赛季信息
async function getActiveSeason() {
  try {
    const data = await apiRequest('/seasons/active');
    return data.season;
  } catch (error) {
    console.error('获取赛季信息失败:', error);
    return null;
  }
}

// 获取赛季排行榜
async function getSeasonLeaderboard(seasonId) {
  try {
    const data = await apiRequest(`/seasons/${seasonId}/leaderboard/total`);
    return data.leaderboard;
  } catch (error) {
    console.error('获取赛季排行榜失败:', error);
    return [];
  }
}

// 获取赛季统计
async function getSeasonStats(seasonId) {
  try {
    const data = await apiRequest(`/seasons/${seasonId}/stats`);
    return data.stats;
  } catch (error) {
    console.error('获取赛季统计失败:', error);
    return null;
  }
}

// 计算剩余时间
function calculateRemainingTime(endDate) {
  const now = new Date();
  const end = new Date(endDate);
  const diff = end - now;

  if (diff <= 0) {
    return { text: '已结束', days: 0, hours: 0, minutes: 0 };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  let text = '';
  if (days > 0) {
    text = `${days}天 ${hours}小时`;
  } else if (hours > 0) {
    text = `${hours}小时 ${minutes}分钟`;
  } else {
    text = `${minutes}分钟`;
  }

  return { text, days, hours, minutes };
}

// 更新用户信息显示
function updateUserInfo(user) {
  const userInfoElements = document.querySelectorAll('[data-user-info]');
  userInfoElements.forEach(element => {
    const field = element.dataset.userInfo;
    if (user[field] !== undefined) {
      element.textContent = user[field];
    }
  });

  // 更新积分显示
  const pointsBadges = document.querySelectorAll('[data-points]');
  pointsBadges.forEach(badge => {
    badge.textContent = user.points || 0;
  });

  // 更新用户名显示
  const usernameDisplays = document.querySelectorAll('[data-username]');
  usernameDisplays.forEach(display => {
    display.textContent = user.username;
  });

  // 显示/隐藏管理员链接
  const adminLinks = document.querySelectorAll('[data-admin-only]');
  adminLinks.forEach(link => {
    if (user.isAdmin) {
      link.classList.remove('hidden');
    } else {
      link.classList.add('hidden');
    }
  });
}

// 初始化页面
async function initPage() {
  const user = await getCurrentUser();

  // 如果需要登录的页面但用户未登录，跳转到首页
  const requiresAuth = document.body.dataset.authRequired === 'true';
  if (requiresAuth && !user) {
    window.location.href = '/';
    return;
  }

  // 如果已登录用户访问首页，跳转到大厅
  if (user && window.location.pathname === '/') {
    window.location.href = '/lobby';
    return;
  }

  // 更新用户信息显示
  if (user) {
    updateUserInfo(user);
  }

  return user;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initPage);
