# 小满记账 · 个人记账（自建版）

> 线上地址：https://ledger.yele.win

参考市面个人记账产品的**功能结构**自行实现，不复用任何第三方的品牌、文案、图标或样式资源。

## 素材库

- 目录：`public/icons/{categories/{parent,child,income}, assets, brands, brand}`
- **清单**：`public/icons/manifest.json`（key / 分组 / 体积 / sha256 前 16 位 / 来源 / 许可），由脚本生成
- **校验**：`npm run icons:check` —— 检查「taxonomy 引用的图标是否都存在」「有没有多余文件」「分类图标是否 ≤2KB」
- 重新生成清单：`npm run icons`
- 银行没有官方 SVG 时，用「品牌色方块 + 首字」兜底（招/工/建/农/中/交…），识别度好于通用类型图标

## 图标来源

- 分类与账户：Codex 绘制（基于 Lucide 1.69，ISC），`public/icons/{categories,assets}`
- 第三方钱包/卡组织：**Simple Icons（CC0）**，`public/icons/brands`，按账户名匹配（支付宝/微信/Apple Pay/PayPal/Visa…），用 CSS mask 上品牌色
- 银行图标暂用类型图标兜底；如需彩色行徽，从银行官网品牌资源下载后放 `public/icons/brands/` 并加规则即可

## 账号

- 邮箱 + 密码注册/登录，密码用 **scrypt + 随机 salt** 哈希，服务端不保存明文
- 会话用 **httpOnly Cookie**（30 天），前端读不到令牌
- 每个账号一份本地数据（`xiaoman-data:<userId>`），互不串号
- 首个登录的账号会一次性接管这台机器上未绑定账号的数据，接管后删除源数据

## 多币种

- `Currency` 表：`code / name / symbol / rate`，rate 语义为「1 单位该币种 = 多少本币」，默认币种 CNY 锁定为 1
- 账单三件套（与一木一致）：`currencyInfo`（币种）+ `currencyAssetNumber`（外币原额）+ `currencyDiscountNumber`，`cost` 始终存**折合本币**
- 记账页可切换币种，实时显示「折合 ¥xx（1 USD = 7.2 CNY）」
- 账户可设币种，资产汇总前按汇率折算
- 汇率非法（NaN/0/负数）一律拒绝写入；发现 0 会在启动时自修复为默认值

## 同步

- **打开应用自动同步一次**（失败静默，不打扰）；其余时候设置页「立即同步」手动触发
- 同步为**先推后拉**
- 服务端按 `(user_id, kind, rid)` 存记录，逐条 **last-write-wins**（比较 `updateTime`）
- 删除会写**墓碑**（`deleted=1`），否则别的设备会把删掉的数据拉回来
- 账号之间完全隔离；未登录访问返回「请先登录」

## 视觉

- 暖色主题（取自设计画布），全部走 CSS 变量，换色不改布局
- 图标：分类/账户/品牌标，`public/icons/`，线性 `currentColor`，用 CSS mask 上色
- 品牌标记用 `logo-mark.svg`；横版 logo 的占位文字待正式命名后替换

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
- **转账**：账户间划转，支持**到账金额 ≠ 转出金额**（跨币种、对方扣费、手续费内扣）；本金不计收支；**手续费单独生成一条支出账单**并通过 `billId` 关联（净资产只减少手续费）；可编辑，改动会先撤销旧记录再重记
- **周期记账**：每月固定日期自动生成账单（房租/工资），打开应用时补生成，同月只生成一次
- **多账本**：顶部可切「全部账本」或具体账本，账单按账本过滤
- **账单**：按月筛选、按日分组、收入/支出/结余汇总；**关键词/分类/账户筛选**；**改单**（改后自动冲正账户余额）
- **资产**：净资产/负资产汇总、多账户列表、新增账户（信用卡余额记负数）
- **统计**：按月支出构成（条形 + 占比 + 图标）；**预算**（总预算 / 分类预算，年月进度与超支标红）
- **转账删除**：删掉转账会两端冲正（转出方退回本金+手续费、转入方扣回本金）
- **数据迁移**：直接导入 **一木记账导出的 Excel/CSV**（日期/收支类型/金额/类别/二级分类/账户/备注/标签），
  自动建分类、账户与账本、**重复账单自动跳过**、坏行单独列出，导入后**账户余额随流水联动**；
  **23 列全量映射**（退款、优惠、报销账户/金额/明细、多币种、地址、创建用户、附件、不计入收支/预算），
  预览里会列出「识别到的列」与报销/退款条数；
  内置 471 条示例数据可一键体验同一套导入流程；也可导出 Excel（同构表头）与 JSON 备份
- **资产**：多账户、净资产/负资产；点「改」可直接填入实际余额（迁移后对账用）
- **借入借出**：借出/收回/借入/归还四类，直接冲账户余额，不计收支，显示待收回与待归还
- **报销/退款**：账单可登记报销（待报销→确认到账才进报销账户）与退款（原路退回支付账户）
- **设置**：演示数据、清空、服务端连接测试

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
3. 周期记账、报销退款
4. 用户体系与登录（token 下发）
5. 部署：反向代理 + HTTPS
