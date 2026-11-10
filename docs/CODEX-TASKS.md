# 给 Codex 的设计任务（可直接转发）

产品已定名 **小满记账**，品牌信息见 `docs/BRAND.md`。当前代码里的 logo 还是占位，需要替换。

---

## 任务 1（必须）：横版 logo 换成「小满记账」

- 文件：`public/icons/brand/logo.svg`（横版，含文字）
- 现在里面是占位字样「记账」，要改成 **小满记账**（三字）
- 建议：图形标在前 + 文字在后，整体 240×64 左右；中文用圆润厚重的黑体（思源黑体 Bold 一类），字距略松
- 同时给一版 **单色横版** `logo-mono.svg`（当前这个文件只有图形标，没有文字）
- 颜色：主色琥珀 `#E0A53C`，文字深棕 `#5A3A1E`；单色版用 `currentColor`

## 任务 2（建议）：巨细版吉祥物

现在的吉祥物（金币+账本+笑脸）细节偏多，缩到 **32×32** 会糊。

- 产出 `public/icons/brand/mark-32.svg`：只保留轮廓、去掉内部书页线和音符
- 产出 `public/icons/brand/favicon.svg`：直接用 32px 版本

## 任务 3（可选）：空状态插画 3 张

记账 App 一定会看到空数据，现在只有一行灰字。需要三张轻量插画（SVG，单色/双色即可）：

| 场景 | 建议画面 |
|---|---|
| 还没有账单 | 空账本 + 一支笔 |
| 还没有账户 | 一个空钱包 |
| 导入成功 | 账本 + 对勾 |

尺寸 320×240 左右，线条风格与分类图标一致（2px 圆角线），颜色用暖色系。

---

## 交付方式

直接放到 `public/icons/brand/`（空状态图放 `public/icons/illustrations/`），文件名按上面写的。
如果不能直接写仓库，按同样结构打包 zip 给我。

## 验收标准

- `logo.svg` 里不再出现「记账」二字，改为「小满记账」
- 32px 下图形标仍能分辨（可缩小自查）
- 单色版用 `currentColor`，不写死颜色

---

## 任务 4（新增）：补 29 个分类图标

分类体系已按一木完整版补齐：**10 个大类、93 个二级**。其中 29 个是新加的，目前**临时用 Lucide 占位**，风格与其余图标不完全一致（尤其"海运/拼多多/理财支出"这类语义偏的）。

请按现有风格（24×24、2px 圆角线性、`currentColor`、≤2KB）重绘：

### 大类（2 个）
`ic_parent_travel`（旅游度假，建议：飞机/行李箱）、`ic_parent_other`（其他，建议：层叠方块）

### 二级（27 个）
| 文件 | 分类 | 建议画面 |
|---|---|---|
| `ic_medical_social_insurance` | 社保 | 盾牌 + 勾 |
| `ic_medical_insurance` | 保险 | 伞 |
| `ic_home_rent` | 房租 | 钥匙 |
| `ic_home_money_tree` | 发财树 | 盆栽/嫩芽 |
| `ic_game_video_game` | 游戏 | 手柄 |
| `ic_game_app_member` | APP会员 | 皇冠 |
| `ic_traffic_etc` | ETC | 卡片 + 信号 |
| `ic_traffic_hotel` | 酒店 | 建筑/床 |
| `ic_traffic_ticket` | 游玩门票 | 票根 |
| `ic_shopping_overseas` | 海运 | 货船 |
| `ic_shopping_pdd` | 拼多多 | 购物车/包裹 |
| `ic_shopping_haircut` | 理发 | 剪刀 |
| `ic_travel_hotel` | 酒店民宿 | 双人床 |
| `ic_travel_drinks` | 酒水饮料 | 鸡尾酒杯 |
| `ic_travel_subway` | 地铁 | 列车 |
| `ic_travel_ship` | 轮船 | 客轮 |
| `ic_travel_massage` | 按摩 | 手部/花瓣 |
| `ic_travel_flight` | 机票 | 机票/飞机 |
| `ic_travel_ticket` | 门票 | 票根 |
| `ic_travel_taxi` | 打车 | 出租车 |
| `ic_travel_meal` | 餐食 | 刀叉 |
| `ic_travel_shopping` | 购物 | 购物袋 |
| `ic_travel_pray` | 祈愿还愿 | 香/合十 |
| `ic_travel_train` | 火车高铁 | 高铁车头 |
| `ic_misc_charity` | 慈善捐助 | 双手捧心 |
| `ic_misc_invest_loss` | 理财支出 | 下跌折线 |
| `ic_misc_penalty` | 罚款赔偿 | 警示三角 |

页面里已有 "其他" 复用 `ic_misc_other`（已交付），不用重画。

交付时直接覆盖 `public/icons/categories/` 下同名文件即可，文件名必须一致。

---

## 任务 4 的最新版清单

以 `docs/icons/待补清单.md` 为准（当前 34 个待重绘：2 个支出大类 + 32 个二级）。
交付时**直接覆盖 `public/icons/categories/{parent|child|income}/` 下的同名文件即可**，文件名必须一字不差。
