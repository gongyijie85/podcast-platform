# Ponytail Audit Report

> 全库过度工程扫描 — `D:\Broadcast\podcast-platform`
> 扫描日期: 2026-06-25

---

## Findings (Ranked by Impact)

### 1. `delete:` 后端类型重导出中间层 — 7 个文件全是单行透传

**位置:** `backend/src/types/shared/`  
**内容:** 7/8 文件只有一行 `export * from '../../../../shared/types/xxx'`  
**修复:** 将 tsconfig `paths` 直接指向 `shared/types/`，删除这些代理文件  
**节省:** -7 文件, ~7 行

### 2. `yagni:` pipeline.ts 类型镜像

**位置:** `backend/src/types/shared/pipeline.ts` (66 行)  
**问题:** 手动维护的共享类型副本，文件头部注释承认维护负担  
**修复:** 配置 tsconfig 路径解析，删除该镜像  
**节省:** -66 行

### 3. `delete:` doubao.adapter.ts 空壳转发

**位置:** `backend/src/modules/script/adapters/doubao.adapter.ts`  
**内容:** 1 行 `export { OpenAICompatibleLlmAdapter as DoubaoAdapter }`  
**修复:** 直接删掉，调用方导入 `openai-compatible-llm.adapter`  
**节省:** -1 文件, -1 行

### 4. `delete:` 未使用的旧版组件（4 对重复中的废弃方）

| 文件 | 状态 |
|------|------|
| `frontend/src/components/feedback/ErrorBoundary.tsx` | 未引用，保留 `common/ErrorBoundary` |
| `frontend/src/components/editor/ScriptEditor.tsx` | 未引用，保留 `script/ScriptEditor` |
| `frontend/src/components/layout/StepIndicator.tsx` | 未引用，保留 `progress/StepIndicator` |
| `frontend/src/features/config/VoiceSelector.tsx` | 未引用，保留 `tts/VoiceSelector` |
| `frontend/src/components/layout/AppFooter.tsx` | 未引用，保留 `Footer` |
| `frontend/src/components/layout/AppHeader.tsx` | 未引用，保留 `Header` |

**节省:** -6 文件, -~250 行

### 5. `delete:` Mock 适配器仍在生产代码中

| 文件 | 被引用处 |
|------|---------|
| `backend/src/modules/book/adapters/mock-book-metadata.adapter.ts` | `pipeline.module.ts` |
| `backend/src/modules/script/adapters/mock-script-gen.adapter.ts` | `pipeline.module.ts` |
| `backend/src/modules/tts/adapters/mock-tts.adapter.ts` | `tts.service.ts` |
| `backend/src/modules/tts/adapters/mock-audio.util.ts` | 多个 TTS adapter |

**建议:** 移到 `test/` 目录或放在 feature-flag 后面  
**节省:** |-4 文件, ~80 行 (移到测试目录)

### 6. `yagni:` 前端存储接口单实现

**位置:** `frontend/src/storage/storage.interface.ts` + `local-storage.adapter.ts`  
**问题:** 接口 `KVStorage` 只有 `localStorageAdapter` 一个实现  
**修复:** 删除接口，直接导出函数  
**节省:** -1 文件(interface), ~8 行

### 7. `yagni:` 空状态组件双版本

**位置:** `frontend/src/components/common/Empty.tsx` (使用中) vs `frontend/src/components/feedback/EmptyState.tsx` (未引用)  
**修复:** 删除 `EmptyState.tsx`  
**节省:** -1 文件, -30 行

### 8. `shrink:` ISBN 校验工具前后端重复

**位置:** `backend/src/common/utils/isbn.ts` (50 行) + `frontend/src/utils/isbn.ts` (61 行)  
**重复度:** 核心校验算法完全相同，前端多一个 `parseIsbnInput` 函数  
**修复:** 提取到 `shared/` 目录共享  
**节省:** -50 行 (后端重复代码)

### 9. `delete:` 根目录调试脚本

**位置:** `check-deploy.js`, `debug-frontend.js`, `verify-login.js`, `verify-login2.js`  
**问题:** Playwright 调试/验证脚本未追踪，污染项目根目录  
**修复:** 移到 `scripts/` 或在 `.gitignore` 中忽略  
**节省:** -4 文件 (可移动)

---

## 总结

```
net: -21 files, -~500 lines, -1 interface possible
```

> ⚠️ 注意：Mock 适配器删除需谨慎 — 它们可能作为 fallback 在 CI 或无外部 API 时使用。建议先移到 `test/` 目录而非直接删除。
