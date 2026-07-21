# F1 — 注册 Northflank + 3 个外部服务

> 类型：task / HITL
> 状态：✅ Northflank + Redis 已完成；Neon 已复用现有实例，B2/Upstash 待定
> 标签：`wayfinder:task`

## Question

注册 Northflank + Neon + Upstash + Backblaze B2，初始化各服务资源，拿到连接字符串。

## 当前证据（2026-07-21）

- Koyeb 账号已登录，账户名显示为 `gongyijie85`。
- `https://app.koyeb.com/` 返回 200，但控制台首页没有服务创建入口。
- 控制台请求的 `glb-rl-infra.infra.prod.koyeb.com` 在本机、1.1.1.1、8.8.8.8、Cloudflare DoH 和 Google DoH 均返回 NXDOMAIN。
- 因此尚未创建 App/Service；没有修改 Render，也没有注入任何生产密钥。
- 备用 Fly.io 账号可登录，但只有个人组织、没有现有 App，成员 `EnablePaidHobby=false`；不在未确认计费前创建资源。
- Northflank：已创建免费项目 `podcast-platform`，区域为 Europe-West London；服务 `podcast-platform-backend` 已部署，Redis addon `nf-redis` 已运行，且由 `nf-redis-env` secret group 关联。Asia Southeast/Jurong West 需要付费项目，不能迁移现有项目区域。
- Railway：本机 CLI 登录态可用，但只存在既有 `xhs-content-lab` 项目；未创建 Podcast 项目。新项目不属于无条件永久免费路线。

## 行动清单（HITL，约 30 分钟）

### 1. Northflank

1. Northflank 项目和 Service 已完成，URL 为 `https://p01--podcast-platform-backend--hffrlmw2zxcy.code.run`。
2. Redis 使用同项目 `nf-redis` addon；不用 Upstash。
3. 继续使用现有 Neon 前，先完成 F3 的 Render 数据库身份核对。

### 2. Neon

1. https://console.neon.tech/ → GitHub 登录
2. **New Project**：
   - Name: `podcast-platform`
   - Region: `AWS US East (Ohio)` 或 `AWS Asia Pacific (Singapore)`，推荐 Singapore
   - Postgres version: 16
3. 创建后从 Dashboard → Connection Details 拷贝 **Connection string**：
   ```
   postgresql://neondb_owner:xxx@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

### 3. Upstash

1. https://console.upstash.com/ → GitHub 登录
2. **Create Database**：
   - Name: `podcast-platform`
   - Type: **Regional**
   - Region: **AP-Southeast-1**（新加坡）
3. 创建后从详情页拷贝 **Redis URL**：
   ```
   rediss://default:xxx@apn1-xxx-12345.upstash.io:6379
   ```

### 4. Backblaze B2

1. https://www.backblaze.com/b2/cloud-storage.html → 邮箱注册
2. **Buckets → Create a Bucket**：
   - Bucket Name: `podcast`
   - Privacy: **Private**
   - Default Encryption: 启用
3. 创建后：
   - **App Keys → Create New Key**：
     - Name: `podcast-platform-key`
     - Type: **Master Application Key**（或 Limited，权限勾 `List Buckets` + `Read/Write`）
     - Restrict to bucket: `podcast`
   - 拷贝 **keyID** 和 **applicationKey**
4. 从 Bucket 详情页找 **S3 Endpoint**（例如 `s3.us-west-001.backblazeb2.com`）

### 5. 把信息汇总

完成后请告诉我：

| 字段 | 值 |
|---|---|
| Northflank service URL | `https://p01--podcast-platform-backend--hffrlmw2zxcy.code.run` |
| Neon DATABASE_URL | `postgresql://...` |
| Upstash REDIS_URL | `rediss://...` |
| B2 Endpoint | `s3.us-west-001.backblazeb2.com` |
| B2 keyID | `xxx` |
| B2 applicationKey | `xxx` |
| B2 Bucket | `podcast` |

## 完成后

把上表数据填到本 ticket 评论。
关单，启动 F2。
