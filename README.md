# 青账 · 个人记账（自建版）

> 线上地址：https://ledger.yele.win

参考市面个人记账产品的**功能结构**自行实现，不复用任何第三方的品牌、文案、图标或样式资源。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 18 + TypeScript + Vite 5 |
| 状态 | Zustand + persist（localStorage） |
| 后端 | Node 24 内置 `node:http` + **`node:sqlite`**（零原生依赖） |
| 样式 | 手写 CSS，无 UI 框架 |

## 运行

```bash
npm install --registry=https://registry.npmjs.org
npm run dev     # 前端 http://127.0.0.1:5178
npm run api     # 后端 http://127.0.0.1:8787
```

> 注意：本机 npm 默认源被设成 npmmirror，该源当前不可达，必须显式指定官方源。

## 已实现

- **记账**：支出/收入/转账三种模式、两级分类、账户选择、时间、备注
- **转账**：账户间划转，本金不计收支；**手续费单独生成一条支出账单**并通过 `billId` 关联（净资产只减少手续费）
- **账单**：按月筛选、按日分组、收入/支出/结余汇总、删除
- **资产**：净资产/负资产汇总、多账户列表、新增账户（信用卡余额记负数）
- **统计**：按月支出构成条形图 + 占比
- **设置**：演示数据、JSON 导入导出、清空、服务端同步测试

## 数据模型

与逆向分析得出的结构保持一致：

- `transfers`：`transferId · fromAssetId · toAssetId · cost · serviceCharge · billId · time · remark`
- `bills`：`billId · time · cost · parentCategoryId · childCategoryId · assetId · bookId · remark · billType · tags · billShareInfo`（冗余快照）
- `assets`：`assetId · assetName · assetType · assetNumber · groupName · hide · intoTotalAsset · positionWeight`
- `billType`：1 快捷 / 2 手动 / 3 导入 / 4 周期 / 5 自动 / 6 模板
- `assetType`：1 资金 / 2 信用卡 / 3 充值 / 4 理财 / 5 二手 / 6 借出 / 7 借入 / 8 贷款 / 9 报销

**记账规则**：写入账单时同步更新账户余额；收入加、支出减；`billShareInfo` 在写入时固化分类名/账户名，避免改名影响历史账单。

## API（`/api`）

统一响应包 `{ code: 0, result }`，失败 `{ code: 1, msg }`，鉴权用自定义 `token` 头。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 |
| POST | `/sync/push` | 推送账单与账户 |
| GET | `/sync/pull` | 拉取全量 |
| POST | `/bill/addOrUpdateBill` | 写入账单 |
| POST | `/bill/deleteBill` | 删除账单 |
| GET | `/bill/getAccountBillPage/:userId/:offset` | 分页读取 |
| POST | `/asset/addOrUpdateAsset` | 写入账户 |

## 部署

已部署在腾讯云首尔（Ubuntu 24.04），单进程同时托管静态资源与 API：

```bash
./deploy/deploy.sh seoul      # 构建 → 上传 → 重启服务
```

- systemd 单元：`deploy/ledger-app.service`（`127.0.0.1:8090`）
- 反向代理：Caddy 自动 HTTPS，`ledger.yele.win → 127.0.0.1:8090`
- 数据落在服务器 `server/data/ledger.db`（SQLite），不进仓库

## 服务端只读策略

公开部署时，**写接口默认关闭**：所有 `POST /api/*` 都要求 `x-write-token`，且必须与服务端环境变量 `LEDGER_WRITE_TOKEN` 一致；未配置该变量时服务端保持完全只读，`/api/health` 会返回 `writable: false`。

这样即使域名公开，也不存在匿名的写入入口——记账数据始终留在浏览器本地。

## 隐私

- 记账数据只存在**浏览器 localStorage**；只有手动点"测试同步"才会推到服务器。
- 服务端不采集、不上报任何信息；无第三方统计脚本、无 CDN 依赖。
- 本仓库为纯代码，不含任何用户数据、密钥或凭据。

## 待办（按优先级）

1. 借入借出 / 报销退款（报销、退款是挂在账单上的附属记录）
2. 同步队列与离线优先（本地写入排队 → 联网重试）
3. 周期记账、预算
4. 用户体系与登录（token 下发）
5. 部署：反向代理 + HTTPS
