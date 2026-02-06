# 专注力训练游戏平台

一个完整的专注力训练游戏平台，使用 Node.js + Express + SQLite 构建，包含用户系统、多游戏、积分系统、排行榜、每日任务和管理员功能。

## 功能特点

### 🎮 游戏系统
- **F1 反应力测试**: 测试反应速度，对比 F1 车手水平
- **舒尔特方格**: 经典注意力训练游戏，支持多种难度（3x3, 4x4, 5x5）
- **经典贪吃蛇**: 控制蛇吃食物，避免撞墙，支持三种难度
- **经典打砖块**: 控制挡板反弹球击碎砖块，多关卡设计

### 👥 用户系统
- 用户注册/登录
- 密码加密存储（bcrypt）
- Session 管理
- 个人积分统计
- 游戏历史记录

### 🏆 排行榜系统
- 总积分排行榜
- 单游戏排行榜
- 今日排行榜
- 实时更新

### 📋 每日任务
- 每天自动生成 3 个任务
- 完成任务获得额外积分
- 游戏时自动检测任务完成

### 🔧 管理员功能
- 用户管理（查看、编辑、删除）
- 游戏记录管理
- 任务管理
- 平台统计数据

## 技术栈

- **后端**: Node.js + Express
- **数据库**: SQLite3
- **认证**: express-session + bcrypt
- **前端**: HTML + CSS + Vanilla JavaScript
- **端口**: 3005

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务器

```bash
npm start
```

或者使用 nodemon（开发环境）：

```bash
npm run dev
```

### 3. 访问应用

打开浏览器访问：

- 本地访问：`http://localhost:3005`
- 局域网访问：`http://[你的IP]:3005`

### 4. 默认管理员账户

```
用户名: admin
密码: admin123
```

**⚠️ 重要**: 首次登录后请立即修改管理员密码！

## 项目结构

```
专注力游戏平台/
├── package.json              # 项目依赖配置
├── server.js                 # Express 服务器入口
├── database.js               # SQLite 数据库操作
├── auth.js                   # 认证中间件
├── middleware.js             # 其他中间件
├── public/                   # 前端静态文件
│   ├── index.html            # 登录/注册页面
│   ├── lobby.html            # 游戏大厅
│   ├── admin.html            # 管理员面板
│   ├── css/
│   │   └── style.css         # 主样式文件
│   └── js/
│       └── main.js           # 前端主逻辑
├── games/                    # 游戏页面
│   ├── f1-reaction.html      # F1 反应测试游戏
│   └── schulte-grid.html     # 舒尔特方格游戏
└── focus_platform.db         # SQLite 数据库文件（自动生成）
```

## 游戏说明

### F1 反应力测试

- 等待 5 个红灯依次亮起
- 所有灯熄灭时立即点击
- 反应时间越短，积分越高

**积分规则**:
- < 0.200s: 100 分
- 0.200-0.230s: 80 分
- 0.230-0.250s: 60 分
- 0.250-0.300s: 40 分
- > 0.300s: 20 分

### 舒尔特方格

- 按顺序点击 1-25 的数字
- 完成时间越短，积分越高
- 支持三种难度：3x3、4x4、5x5

**积分规则**（5x5 难度）:
- < 20s: 100 分
- 20-30s: 80 分
- 30-40s: 60 分
- 40-50s: 40 分
- > 50s: 20 分

### 经典贪吃蛇

- 使用方向键或 WASD 控制蛇的移动
- 吃到食物得 10 分，蛇身会变长
- 撞到墙壁或自己的身体游戏结束
- 支持三种难度：简单、中等、困难

**积分规则**（包含难度倍数）:
- ≥ 500 分: 100 分
- ≥ 300 分: 80 分
- ≥ 200 分: 60 分
- ≥ 100 分: 40 分
- < 100 分: 20 分

### 经典打砖块

- 使用鼠标或左右箭头键控制挡板移动
- 击碎砖块得分，不同颜色砖块分数不同
- 球掉落底部失去一条生命
- 3 条生命用完游戏结束

**积分规则**:
- ≥ 2000 分: 100 分
- ≥ 1500 分: 80 分
- ≥ 1000 分: 60 分
- ≥ 500 分: 40 分
- < 500 分: 20 分

## API 端点

### 认证相关
- `POST /api/register` - 用户注册
- `POST /api/login` - 用户登录
- `POST /api/logout` - 用户登出
- `GET /api/me` - 获取当前用户信息

### 游戏相关
- `POST /api/games/score` - 提交游戏成绩
- `GET /api/games/scores/:gameType` - 获取游戏历史
- `GET /api/games/leaderboard/:gameType` - 游戏排行榜

### 排行榜相关
- `GET /api/leaderboard/total` - 总积分排行榜
- `GET /api/leaderboard/:gameType` - 单游戏排行榜
- `GET /api/leaderboard/today` - 今日排行榜

### 任务相关
- `GET /api/tasks/today` - 今日任务
- `GET /api/tasks/history` - 任务历史
- `POST /api/tasks/:id/complete` - 完成任务

### 管理员相关
- `GET /api/admin/users` - 用户列表
- `GET /api/admin/users/:id` - 用户详情
- `PUT /api/admin/users/:id` - 编辑用户
- `DELETE /api/admin/users/:id` - 删除用户
- `GET /api/admin/scores` - 所有成绩
- `GET /api/admin/stats` - 平台统计
- `GET /api/admin/tasks` - 管理任务
- `DELETE /api/admin/tasks/:id` - 删除任务

## 部署说明

### 生产环境配置

1. **设置环境变量**

```bash
# 设置 session 密钥（必须）
export SESSION_SECRET="your-secret-key-here"

# 可选：设置端口
export PORT=3005
```

2. **使用进程管理器**

推荐使用 PM2 保持服务器运行：

```bash
npm install -g pm2
pm2 start server.js --name focus-platform
pm2 save
pm2 startup
```

3. **配置 HTTPS（推荐）**

生产环境建议使用 Nginx 反向代理并配置 HTTPS。

### 数据库备份

数据库文件位于 `focus_platform.db`，定期备份此文件即可：

```bash
cp focus_platform.db backup/focus_platform_$(date +%Y%m%d).db
```

## 常见问题

### 端口被占用

如果端口 3005 被占用，可以修改 `server.js` 中的 PORT 变量：

```javascript
const PORT = 3006; // 改为其他端口
```

### 数据库错误

如果遇到数据库问题，删除 `focus_platform.db` 文件，重启服务器会自动创建新的数据库。

### 无法访问

确保防火墙允许端口 3005 的访问。Windows 防火墙设置：

1. 打开 Windows 防火墙
2. 允许应用通过防火墙
3. 添加 Node.js 的入站规则

## 开发说明

### 代码规范

- 使用 async/await 处理异步操作
- 统一错误处理
- 前端使用模块化 JavaScript
- 遵循 RESTful API 设计

### 添加新游戏

1. 在 `games/` 目录创建新的游戏 HTML 文件
2. 在 `server.js` 添加路由
3. 在 `public/lobby.html` 添加游戏卡片
4. 在 `middleware.js` 添加积分计算规则

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 联系方式

如有问题或建议，请通过 Issue 联系。
