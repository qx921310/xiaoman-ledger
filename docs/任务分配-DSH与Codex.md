# 任务分配：DSH 与 Codex（P0/P1 收口）

基线提交：`720b79e` 之后的最新 `master`。两人同时改同一仓库，**按文件所有权分工，互不重叠**。

## 一、环境约定（新增）

| 环境 | 地址 | 服务 | 数据 |
|---|---|---|---|
| 生产 | https://ledger.yele.win | `ledger-app`（8090） | `/opt/ledger-app/server/data` |
| **预发 staging** | 待 DNS：`staging.ledger.yele.win` | `ledger-app-staging`（8091） | `/opt/ledger-app-staging/server/data` |

- 部署：`bash deploy/deploy.sh seoul` （生产）/ `bash deploy/deploy.sh seoul staging`（预发）
- **纪律：所有"先跑一下看看"的验证走 staging**；生产只放真实账本。
- staging 需要一条 DNS：`staging` A → `43.155.129.186`（Cloudflare，代理关闭），加完我配 Caddy。

## 二、分工（按文件所有权）

### DSH 负责（不要再动这些文件）

| 文件 | 任务 |
|---|---|
| `src/sync.ts`、`src/domain/sync-merge.ts`、`src/store.ts` | **P0-1**：把 9 类新实体纳入同步与备份 |
| `src/types.ts` | 先加 kind 常量与类型（我会先提交，避免冲突） |
| `tests/balance.test.ts` | P0-1 的回归测试 |

**P0-1 范围**：`splitGroups` / `splitMembers` / `splitExpenses` / `stockAssets` / `stockInfos` / `templates` / `homeLoans` / `instalments` / `billGroups` / `billRelated`

**验收标准**：
1. 每类实体都能 `collectRecords()` 被推送，另一设备 `pull` 后可见
2. 删除会写墓碑，另一设备同步后删除
3. `exportAll()` 包含全部实体，`importAll()` 能还原；备份 `version` 升级且旧备份可迁移
4. 不出现悬空引用（如账单有 AA 引用但 AA 记录未同步）

### Codex 负责（DSH 不碰）

| 文件 | 任务 |
|---|---|
| `server/server.mjs` | **P1-1**：共享账本里私有账户的**服务端**校验与历史账单脱敏 |
| `src/features/settings.tsx`（OCR 卡片） | **P1-7**：识别结果确认前可编辑（金额/方向/账户/分类），不要默认选第一个账户 |
| 部署与 Caddy | staging 的 HTTPS 站点（DNS 加好后） |
| 独立验证 | P1-3（AA 记录互相覆盖）、P1-4（成本法 LIFO/FIFO 边界） |

**P1-1 要求**：
1. 服务端在 `push` 阶段校验：账单引用的账户若为私有（`book_id` 为空）且写入的是多人账本 → 拒绝或脱敏
2. 邀请新成员时，对**历史账单里已存在的私有账户名快照**做处理（脱敏为空/“私有账户”），并把策略写进文档
3. 覆盖路径：新增、编辑、导入、OCR、模板、周期、转账、AA

**P1-7 要求**：
1. 识别结果在入账前可编辑四个字段：日期、金额、方向（支出/收入）、账户
2. 账户默认不预选；无账户时提示先建账户
3. 识别失败/超时给出可读错误，不吞异常

## 三、冲突规避规则

1. **文件级所有权**：上表列出的文件只有对应负责人能改
2. `src/types.ts` 由 DSH 先加类型并提交，Codex 之后只读
3. 提交前各自跑 `npm run check`
4. 提交信息前缀：DSH 用 `feat/fix`，Codex 用 `fix(codex)`，避免混淆
5. **不要用 `git add -A`**（DSH 已经踩过三次，把临时文件/他人文档带进提交）；只 add 自己改的路径

## 四、DSH 当前进度（本表签发时）

已完成并上线：
- 无账户时记账页显示空态引导（`去添加账户`）
- P0-2：期号冲突比对覆盖账户/币种/标签/附件，关联按 `billId` 判定
- P1-2：AA 按金额精确到分（5+5.01 拒绝）

进行中：P0-1（同步与备份）
