# 回滚手册（Rollback Playbook）

> 目标：应用或数据库发生故障时，能在 10 分钟内安全回滚到上一个可用版本。
>
> 适用范围：Vercel 前端 + Render 后端 Docker + PostgreSQL 数据库。

## 1. 应用回滚（代码 / 容器）

### 1.1 事前准备：每次发版都打 tag

每次把 `main` 分支部署到生产前，先打 Git tag：

```bash
git tag -a v0.4.0 -m "release v0.4.0"
git push origin v0.4.0
```

这样 Render / Vercel 都能通过 commit hash 或 tag 找到旧版本。

### 1.2 Render 后端回滚

1. 打开 Render Dashboard → 你的 Web Service。
2. 点击 **Settings**。
3. 找到 **Branch** 或 **Runtime** 区域的 commit 选择器。
4. 在 **Manual Deploy** 里选择：
   - **Deploy a specific commit**：输入要回滚到的 commit hash（例如上一个 tag 对应的 hash）。
   - 或者临时把 Branch 切到一个只包含旧版本的 branch（如 `release/v0.3.9`）。
5. 点击 **Deploy Latest Commit** 或 **Manual Deploy**。
6. 等待构建完成（Free tier 约 5~10 分钟），直到 `/api/health` 返回 `{"status":"ok"}`。

```bash
# 验证后端是否恢复
curl https://<你的后端>.onrender.com/api/health
```

### 1.3 Vercel 前端回滚

1. 打开 Vercel Dashboard → 你的 Project。
2. 进入 **Deployments**。
3. 找到上一个正常版本的部署，点击右侧 **...** → **Promote to Production**。
4. Vercel 会立即把该版本的构建产物切到生产域名，通常 30 秒内生效。

```bash
# 验证前端是否恢复
curl -I https://<你的项目>.vercel.app
```

### 1.4 本地 Docker Compose 回滚

如果本地用 `docker compose` 部署：

```bash
cd podcast-platform

# 切到旧 tag
git checkout v0.4.0

# 重新构建并启动
docker compose down
docker compose up -d --build
```

## 2. 数据库回滚

### 2.1 第一步：先备份

**任何回滚操作前都必须先备份当前数据库**，防止回滚失败导致数据彻底丢失。

#### Linux / macOS / Docker

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/podcast"
./infra/scripts/backup-db.sh
```

#### Windows PowerShell

```powershell
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/podcast"
.\infra\scripts\backup-db.ps1
```

备份文件会生成在 `podcast-platform/backups/podcast_backup_YYYYMMDD_HHMMSS.sql`。

### 2.2 迁移出错的场景

Prisma 不支持自动“向下迁移”，因此回滚数据库需要分情况处理。

#### 场景 A：新迁移还没应用到数据库，只想取消本次部署

直接回滚应用版本即可，数据库不需要动。

#### 场景 B：新迁移已经应用，但业务代码有 bug，需要回退到旧代码

1. **先备份**（见 2.1）。
2. 回滚应用代码到旧版本（见 1.2 / 1.3 / 1.4）。
3. 如果旧代码兼容新数据库 schema，直接重启即可。
4. 如果旧代码不兼容新 schema：
   - 手动写 SQL 把 schema 改回旧版本（参考 `prisma/migrations/` 里的 migration 文件逆向操作）。
   - 或者用 `pg_restore` 恢复之前的备份（见 2.3）。

#### 场景 C：迁移执行失败，数据库处于脏状态

使用 Prisma 的迁移修复命令：

```bash
cd podcast-platform/backend

# 查看迁移状态
npx prisma migrate status

# 如果某条迁移标记为“已开始但未完成”，可以手动标记为已应用或已回滚
# ⚠️ 仅在确认该迁移确实不需要时执行
npx prisma migrate resolve --applied <migration_name>
npx prisma migrate resolve --rolled-back <migration_name>
```

`<migration_name>` 是 `prisma/migrations/` 目录下的文件夹名，例如 `20250701000000_add_share_link`。

### 2.3 从备份恢复

如果手动改 schema 风险太高，直接用备份恢复：

```bash
# 1. 先再备份一次当前状态（防止二次丢失）
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/podcast"
./infra/scripts/backup-db.sh

# 2. 断开应用连接（避免写入）
#    例如：docker compose stop backend

# 3. 重建数据库并恢复
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql "$DATABASE_URL" < backups/podcast_backup_YYYYMMDD_HHMMSS.sql

# 4. 重启应用
docker compose up -d backend
```

> ⚠️ 恢复备份会丢失备份时间点之后的所有数据，请谨慎评估。

## 3. 紧急检查清单

回滚前逐项确认：

- [ ] 已通知相关用户或客服“平台正在维护”。
- [ ] 已备份当前数据库（`backups/` 目录下有新文件）。
- [ ] 已记录故障现象、错误日志、出问题的 commit / tag。
- [ ] 已确认要回滚到的目标版本（git tag 或 commit hash）。
- [ ] 已检查目标版本的后端 env 变量与当前环境一致。
- [ ] 回滚后已验证 `/api/health`、登录页、核心流程（ISBN → 生成 → 导出）。
- [ ] 回滚完成后在团队群/日志中记录回滚原因与结果。

## 4. 紧急联系人

| 角色 | 姓名 | 联系方式 | 备注 |
|------|------|----------|------|
| 技术负责人 | （待填写） | （待填写） | 决策是否回滚 |
| 后端开发 | （待填写） | （待填写） | 数据库 / Render |
| 前端开发 | （待填写） | （待填写） | Vercel / 页面验证 |
| 运维/值班 | （待填写） | （待填写） | 监控告警、用户通知 |

> 建议把本表替换为真实联系方式，并同步到团队通讯录。

## 5. 常用命令速查

```bash
# 查看当前 git tag
git tag --sort=-creatordate | head -5

# 查看某个 tag 对应的 commit
git rev-list -n 1 v0.4.0

# 查看 Prisma 迁移状态
cd backend && npx prisma migrate status

# 手动应用迁移（容器启动时会自动执行）
cd backend && npx prisma migrate deploy

# 快速验证后端健康
curl https://<你的后端>.onrender.com/api/health
```

---

**最后更新**：2026-07-05
