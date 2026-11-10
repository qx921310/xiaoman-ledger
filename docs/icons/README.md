# 图标交付说明（给 Codex）

## 放哪里

**直接放进仓库**，构建会自动带上（Vite 的 `public/` 原样复制）：

```
projects/ledger-app/public/icons/
├── brand/
│   ├── logo.svg            # 横版主标（含文字），建议 240×64
│   ├── logo-mark.svg       # 方形图形标，建议 64×64，用于头像/加载页
│   ├── favicon.svg         # 简化版，32×32 视觉重量要够
│   └── app-icon-512.png    # 512×512，桌面/分享用
├── categories/
│   ├── parent/             # 8 个支出大类
│   ├── child/              # 52 个支出二级
│   └── income/             # 14 个收入分类
└── assets/                 # 账户类型图标（见文末，数量待定）
```

**文件名必须用 `manifest.json` 里的 `key`**（如 `ic_parent_restaurant.svg`、`ic_shopping_phone.svg`、`ic_income_wages.svg`），我按 key 自动映射，不用改代码。

如果 Codex 不能直接写仓库，就按同样目录结构打一个 zip 丢给我，我解压到上述路径。

## 规格

| 项 | 要求 |
|---|---|
| 画布 | `viewBox="0 0 24 24"`，不要写死 width/height |
| 线条 | 单色 `stroke="currentColor"`，`stroke-width="2"`，`fill="none"` |
| 端点 | `stroke-linecap="round"`、`stroke-linejoin="round"` |
| 体积 | 每个 ≤ 2 KB，路径尽量合并，不要嵌文字、不要位图 |
| 风格 | 线性、几何简化，风格统一；避免渐变/阴影/多色 |
| 命名 | 纯小写 + 下划线，全 ASCII |

深浅色主题靠 `currentColor` 自动适配，**不要**出两套颜色。

> 例外：`brand/` 下的 logo 可以有主色，但请同时给一个纯单色版本（`logo-mono.svg`），我被要求换主题色时能直接替换。

## 清单

- 完整 74 个分类图标：见 `manifest.json`（`key` / `group` / `name` / `hint`）
- 8 大类：健康医疗、送礼人情、文化教育、居家生活、休闲娱乐、出行交通、食品餐饮、购物消费
- 52 个二级：如 早餐/午餐/晚餐、地铁/打车/加油、水费/电费/燃气费、房租还贷…
- 14 个收入：工资、奖金、补贴、兼职外快、理财盈利、礼金人情、借入、中奖、二手闲置、慈善捐助、理财支出、罚款赔偿、报销、其他

## 账户图标（额外，先看下面的说明再定）

一木有 **28 个账户图标 + 55 个银行图标**，我们没有。但里面大部分是**品牌标识**（招商/建设/工商…，支付宝/微信/花呗/白条…），属于他人商标，**不建议照着做**。

建议只做**通用类型图标**，约 14 个：

现金 · 储蓄卡 · 信用卡 · 借记卡 · 钱包 · 基金 · 股票 · 理财 · 保险 · 定期存款 · 房产 · 车辆 · 押金 · 其他（`default`）

品牌类账户（支付宝/微信/花呗…）用**首字母色块**表示，不做品牌图形。

已交付账户 key：`ic_asset_cash`、`ic_asset_savings_card`、`ic_asset_credit_card`、`ic_asset_debit_card`、`ic_asset_wallet`、`ic_asset_fund`、`ic_asset_stock`、`ic_asset_investment`、`ic_asset_insurance`、`ic_asset_fixed_deposit`、`ic_asset_property`、`ic_asset_vehicle`、`ic_asset_deposit`、`ic_asset_default`。银行卡类型目前共用卡片轮廓，适合搭配文字区分。

分类和账户图标基于 Lucide 1.69.0，许可见 `public/icons/LICENSE-lucide.txt`。`build_icons.cjs` 记录清单到原图标的映射。品牌标识是独立绘制的暖色小金币与账本，横版中的“记账”为暂定通用字样；`logo-mono.svg` 是图形标的单色版。

## 交付后我做什么

1. 按 key 映射进 `taxonomy.ts` 的 `icon` 字段，替换现在的 emoji 占位
2. 校验每个文件存在、尺寸合规、单色可用
3. 构建部署，线上逐个截图核对
