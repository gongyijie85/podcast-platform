# 代码审查清单

> 每次 PR 或交付前对照本清单逐项检查。目标：在合并到 main 之前拦截常见问题。

## 1. 基础检查（必过）

- [ ] `pnpm lint` 无新增 error，warning 数量不增加
- [ ] `pnpm --filter frontend exec tsc --noEmit` 通过
- [ ] `pnpm --filter backend exec tsc --noEmit` 通过
- [ ] `pnpm --filter frontend test` 全部通过
- [ ] `pnpm --filter backend test` 全部通过
- [ ] `pnpm build` 前后端构建均通过

## 2. 代码质量

- [ ] 无未使用的 import / 变量 / 参数（或以下划线 `_` 开头命名）
- [ ] 无无效 `eslint-disable` 指令（删掉指令后该行无对应 warning）
- [ ] 无 `any` 类型（测试文件可用具体交叉类型或 `never` 替代）
- [ ] 无 `require()` import（改用 ESM `import`）
- [ ] 新增函数有明确返回类型标注
- [ ] 公共 API / 接口变更已同步更新 `docs/api-contract.md`

## 3. 安全

- [ ] 密码 / token / 密钥不出现在日志、响应体、前端代码中
- [ ] 用户输入经过 `ValidationPipe` 或手动校验
- [ ] 文件路径操作经过 `resolveSafeKey` 或等效白名单校验
- [ ] 新增 API 路由默认需要认证（`@Public()` 需显式声明并说明理由）
- [ ] SQL 查询使用 Prisma 参数化，无字符串拼接
- [ ] 环境变量在 `.env.example` 中有记录，生产必需变量在 `main.ts` 启动校验

## 4. 数据库与迁移

- [ ] schema 变更已生成 migration 文件
- [ ] migration 可正向执行（`prisma migrate deploy`）
- [ ] 破坏性变更（删列 / 改类型）有数据迁移脚本或回滚说明
- [ ] 新增字段有合理默认值或 nullable，不破坏存量数据

## 5. 前端

- [ ] 新增页面使用 `React.lazy()` 懒加载
- [ ] 表单有客户端校验 + 服务端校验
- [ ] 关键操作（删除 / 重新生成）有二次确认
- [ ] 按钮有 `aria-label`，图标按钮有 `Tooltip`
- [ ] 错误状态有用户可读的提示（不只是控制台报错）
- [ ] i18n 文案已添加到 `zh-CN.json` 和 `en-US.json`

## 6. 测试

- [ ] 新增功能有对应单元测试
- [ ] 测试不依赖外部网络（用 mock adapter 或 fixture）
- [ ] 测试命名清晰（`should ... when ...`）
- [ ] 异步测试用 `async/await`，不用回调
- [ ] 测试清理副作用（localStorage / timer / mock restore）

## 7. 性能

- [ ] 列表页有分页或虚拟滚动
- [ ] 图片有 `loading="lazy"`
- [ ] 大依赖动态 `import()` 而非顶层 import
- [ ] 数据库查询无 N+1（用 `include` 或批量查询）
- [ ] 准静态数据（BGM / 音色）有 `Cache-Control` 或前端缓存

## 8. 文档与版本

- [ ] `CHANGELOG.md` 记录本次变更
- [ ] `package.json` 版本号三处（root / frontend / backend）一致
- [ ] 新增依赖在 `package.json` 中标注用途
- [ ] 破坏性变更在 CHANGELOG 中醒目标注 `BREAKING`

---

## 快速命令

```powershell
# 一键跑完基础检查
cd d:\Broadcast\podcast-platform
pnpm --filter frontend exec tsc --noEmit
pnpm --filter backend exec tsc --noEmit
pnpm --filter frontend test
pnpm --filter backend test

# lint（注意 frontend 需从根 node_modules 调用）
cd frontend; ..\node_modules\.bin\eslint.cmd . --ext .ts,.tsx
cd ..\backend; ..\node_modules\.bin\eslint.cmd . --ext .ts
```
