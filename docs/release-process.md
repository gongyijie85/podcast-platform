# 发布流程

> 版本：v1.0（2026-07-05）
> 目标：规范 podcast-platform 从开发到生产的发布流程，确保每次发布可追溯、可回滚。

## 1. 版本号规范

- 采用 `语义化版本`：`MAJOR.MINOR.PATCH`
- 三处 `package.json` 版本号必须一致：
  - `podcast-platform/package.json`（root）
  - `podcast-platform/frontend/package.json`
  - `podcast-platform/backend/package.json`
- 当前版本：`0.5.0`

## 2. 发布前检查清单

### 2.1 代码质量
- [ ] `pnpm lint` 无新增 error
- [ ] 前端 lint：`cd frontend; ..\node_modules\.bin\eslint.cmd . --ext .ts,.tsx` → 0 warnings
- [ ] 后端 lint：`cd backend; ..\node_modules\.bin\eslint.cmd . --ext .ts` → 0 warnings
- [ ] 对照 [docs/code-review-checklist.md](code-review-checklist.md) 逐项检查

### 2.2 测试
- [ ] `pnpm --filter frontend exec tsc --noEmit` 通过
- [ ] `pnpm --filter backend exec tsc --noEmit` 通过
- [ ] `pnpm --filter frontend test` 全部通过
- [ ] `pnpm --filter backend test` 全部通过
- [ ] （可选）本地 Docker 环境跑 E2E：`cd backend && pnpm test:e2e`

### 2.3 构建
- [ ] `pnpm --filter frontend build` 通过（`tsc -b && vite build`）
- [ ] `pnpm --filter backend build` 通过（`nest build`）

### 2.4 数据库
- [ ] 如有 schema 变更，已生成 migration 文件
- [ ] `prisma migrate deploy` 可正向执行
- [ ] 破坏性变更有数据迁移脚本或回滚说明

## 3. 发布步骤

### 3.1 更新版本号与文档
1. 修改三处 `package.json` 的 `version` 字段
2. 更新 `CHANGELOG.md`，新增版本条目，包含：
   - 修改时间（上海时间）
   - 变更摘要
   - 新增 / 变更 / 修复 / 验证 分组
   - 破坏性变更醒目标注 `BREAKING`
3. 更新 `README.md` 顶部版本号
4. 在 `.trae/documents/` 下创建 `v{版本号}-change-log-{日期}.md` 记录详细变更

### 3.2 提交与打 tag
```powershell
cd d:\Broadcast\podcast-platform
git add -A
git commit -m "release: v{版本号}"
git tag v{版本号}
git push origin main --tags
```

### 3.3 部署
1. **后端（Render）**：
   - Render Dashboard → Service → Manual Deploy → Deploy last commit
   - 或配置 autoDeploy on push to main
   - 部署后验证：`curl https://podcast-platform-backend-8065.onrender.com/api/health`

2. **前端（Vercel）**：
   - Vercel Dashboard → Deployments → Redeploy（关闭 Use existing Build Cache）
   - 或配置 Git Integration 自动部署
   - 部署后验证：浏览器访问 `https://podcast-platform.vercel.app/`

3. **数据库迁移**（如有）：
   ```powershell
   cd backend
   DATABASE_URL=<生产数据库连接串> pnpm prisma:deploy
   ```

### 3.4 部署后验证（Smoke Test）
- [ ] `https://podcast-platform-backend-8065.onrender.com/api/health` 返回 `code: 0`
- [ ] `https://podcast-platform.vercel.app/` 能正常加载
- [ ] 登录 / 注册功能正常
- [ ] 选书 → 配置 → 生成 → 导出 流程走通
- [ ] `/api/metrics` 可访问

## 4. 回滚流程

详见 [docs/rollback-playbook.md](rollback-playbook.md)。

### 4.1 应用回滚
```powershell
# 回滚到上一个 tag
git checkout v{上一版本号}
git push origin main --force-with-lease
# Render / Vercel 自动重新部署
```

### 4.2 数据库回滚
```powershell
# 1. 备份当前数据库
./infra/scripts/backup-db.ps1

# 2. 将失败的 migration 标记为 rolled-back
cd backend
DATABASE_URL=<生产数据库连接串> npx prisma migrate resolve --rolled-back <migration_name>

# 3. 恢复备份（如有必要）
# pg_restore -d <database_url> backup_file.sql
```

## 5. 发布记录

| 版本 | 发布日期 | 变更摘要 |
|------|----------|----------|
| 0.5.0 | 2026-07-05 | 质量运维审计整改闭环（安全、监控、测试修复、lint 收敛） |
| 0.4.1 | 2026-07-05 | S1 部署与数据平台整改（Dockerfile 统一、备份脚本、回滚手册） |
| 0.4.0 | 2026-07-01 | 选书模块解耦与主播口播稿 |
| 0.3.1 | 2026-06-25 | Ponytail Audit 清理（删除 15 个冗余文件） |
| 0.3.0 | 2026-06-24 | Security + Build + Quality 修复 |
| 0.2.0 | 2026-06-18 | 质量闭环 + Smoke Test |
| 0.1.1 | 2026-06-14 | 项目收尾接口 + 部署验证 |
| 0.1.0 | 2026-06-14 | 交接版本 |
