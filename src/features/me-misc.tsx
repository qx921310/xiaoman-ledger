import { useEffect, useState } from 'react'
import { useLedger } from '../store'
import { readPrefs, writePrefs, type Prefs } from '../prefs'

/**
 * 我的页里「一木有、我们暂未实现」的入口落地页。
 * 原则：点了必须有内容，不能原地不动（一木这些项都对应独立页面）。
 */
const PAGES: Record<string, { title: string; body: string[] }> = {
  more: {
    title: '更多设置',
    body: ['记账偏好、提醒、导入导出等设置都在这里。', '账本管理 / 分类管理 / 标签管理请回到「我的」页对应入口。']
  },
  theme: {
    title: '主题外观',
    body: ['当前主题：琥珀暖调', '深色模式：跟随系统（未开启）', '后续会提供更多皮肤，可在设置中切换。']
  },
  activity: {
    title: '更多活动',
    body: ['暂无进行中的活动。', '有新活动时会在这里展示，参与可获得会员时长。']
  },
  apps: {
    title: '更多小满应用',
    body: ['小满记账是本系列的第一个应用。', '后续应用会在上线后在这里推荐。']
  },
  widget: {
    title: '桌面小部件',
    body: ['桌面小部件需要在手机端添加。', '网页版暂不支持，手机浏览器可将本站添加到主屏幕使用。']
  },
  invite: {
    title: '邀请好友',
    body: ['把记账这件小事分享给朋友。', '邀请链接功能开发中，敬请期待。']
  },
  feedback: {
    title: '建议与反馈',
    body: ['遇到问题或有建议，欢迎反馈：', '邮箱：hello@xiaoman.test', '请附上页面路径与操作步骤，方便定位。']
  },
  rate: {
    title: '给应用评分',
    body: ['如果小满记账对你有帮助，欢迎给个好评。', '网页版暂未接入应用商店评分入口。']
  }
}

export function MeMiscPage({ name, onBack, onOpenCurrency, onLogout }: { name: string; onBack: () => void; onOpenCurrency?: () => void; onLogout?: () => void }) {
  const page = PAGES[name] ?? { title: '敬请期待', body: ['这个功能还在开发中。'] }
  const currentBookName = useLedger((st) => st.accountBooks.find((b) => String(b.bookId) === String(st.currentBookId))?.accountBookName ?? '—')
  const defaultCurrency = useLedger((st) => st.defaultCurrency)
  const currencies = useLedger((st) => st.currencies)
  const setDefaultCurrency = useLedger((st) => st.setDefaultCurrency)
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs())
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('xiaoman-theme') ?? 'amber')
  const [baseOpen, setBaseOpen] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('xiaoman-theme', theme)
  }, [theme])

  const toggle = (key: Exclude<keyof Prefs, 'weekStart'>) => {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    writePrefs(next)
  }

  const clearCache = async () => {
    if (!window.confirm('清理本机同步缓存会删除这台设备上尚未上传的修改与冲突草稿，且无法恢复。继续？')) return
    try {
      const { clearAllBookPatches } = await import('./book-pending')
      const n = await clearAllBookPatches()
      alert(n ? `已清理 ${n} 条本机待同步修改` : '没有需要清理的本机修改')
    } catch {
      alert('清理失败，请稍后重试')
    }
  }

  const Switch = ({ label, desc, k }: { label: string; desc: string; k: Exclude<keyof Prefs, 'weekStart'> }) => (
    <label className="row me-switch">
      <span className="grow">
        <span className="me-switch-label">{label}</span>
        <small>{desc}</small>
      </span>
      <input type="checkbox" checked={Boolean(prefs[k])} onChange={() => toggle(k)} />
    </label>
  )

  if (name === 'theme') {
    return (
      <>
        <div className="subpage-head">
          <button type="button" className="link" onClick={onBack}>‹ 返回我的</button>
          <h3>{page.title}</h3>
        </div>
        <p className="hint">切换后立即生效，选择会记在这台设备上。</p>
        {([['amber', '琥珀暖调'], ['night', '夜色']] as const).map(([key, label]) => (
          <button key={key} type="button" className="row my-row-btn" onClick={() => setTheme(key)}>
            <span className="grow">{label}</span>
            <span className="muted">{theme === key ? '使用中' : ''}</span>
          </button>
        ))}
      </>
    )
  }

  if (name !== 'more') {
    return (
      <>
        <div className="subpage-head">
          <button type="button" className="link" onClick={onBack}>‹ 返回我的</button>
          <h3>{page.title}</h3>
        </div>
        {page.body.map((line) => <p key={line} className="hint">{line}</p>)}
      </>
    )
  }

  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回我的</button>
        <h3>更多设置</h3>
      </div>

      <h3>安全锁</h3>
      <div className="row me-switch"><span className="grow"><span className="me-switch-label">生物解锁</span><small>打开应用时执行指纹、人脸等安全认证</small></span><span className="muted">Web 版暂不支持</span></div>
      <div className="row me-switch"><span className="grow"><span className="me-switch-label">手势解锁</span><small>启动应用时或指纹识别失败时进行认证</small></span><span className="muted">Web 版暂不支持</span></div>

      <h3>账单设置</h3>
      <Switch label="多币种" desc="为账单、账户设置币种" k="multiCurrency" />
      {prefs.multiCurrency && (
        <>
          <button type="button" className="row my-row-btn" onClick={() => setBaseOpen((v) => !v)}>
            <span className="grow">本位币<small>设置软件的默认币种</small></span>
            <span className="muted">{currencies.find((c) => c.code === defaultCurrency)?.name ?? '人民币'}</span>
          </button>
          {baseOpen && currencies.map((c) => (
            <button key={c.code} type="button" className="row my-row-btn" onClick={() => { setDefaultCurrency(c.code); setBaseOpen(false) }}>
              <span className="grow">{c.name} {c.code}</span>
              <span className="muted">{c.code === defaultCurrency ? '使用中' : `1 ${c.code} = ${c.rate} CNY`}</span>
            </button>
          ))}
          {onOpenCurrency && (
            <button type="button" className="row my-row-btn" onClick={onOpenCurrency}>
              <span className="grow">币种与汇率<small>增删币种、修改汇率</small></span>
              <span className="muted">{currencies.length} 种</span>
            </button>
          )}
        </>
      )}
      <Switch label="备注优先显示" desc="将备注作为标题，分类作为描述" k="remarkFirst" />
      <Switch label="分类精简" desc="拥有二级分类的账单将不显示一级分类" k="simpleCategory" />
      <Switch label="显示账单时间" desc="在账单流水中显示账单的具体时间" k="showTime" />
      <Switch label="显示原金额" desc="退款、优惠账单显示原金额" k="showOriginAmount" />
      <Switch label="显示账户图标" desc="在流水中显示账户图标" k="showAssetIcon" />
      <Switch label="金额颜色" desc="支出红色，收入绿色" k="colorMoney" />

      <h3>偏好设置</h3>
      <button type="button" className="row my-row-btn" onClick={() => { const next = { ...prefs, weekStart: prefs.weekStart === 1 ? 0 : 1 } as Prefs; setPrefs(next); writePrefs(next) }}>
        <span className="grow">日历周起始日<small>设置日历视图中每周的起始日期</small></span>
        <span className="muted">{prefs.weekStart === 1 ? '周一' : '周日'}</span>
      </button>
      <div className="row"><span className="grow">当前账本</span><span className="muted">{currentBookName}</span></div>

      <h3>通用设置</h3>
      <div className="row me-switch"><span className="grow"><span className="me-switch-label">字体大小</span><small>设置软件内显示的字体大小</small></span><span className="muted">标准</span></div>
      <div className="row me-switch"><span className="grow"><span className="me-switch-label">导航栏文字</span><small>首页底部导航栏显示文字信息</small></span><span className="muted">显示</span></div>

      <h3>应用设置</h3>
      <div className="row me-switch"><span className="grow"><span className="me-switch-label">退出时提示</span><small>点击返回键退出应用时，需要再次点击确认</small></span><span className="muted">浏览器接管</span></div>

      <h3>维护</h3>
      <button type="button" className="row my-row-btn" onClick={() => void clearCache()}>
        <span className="grow">清理本机同步缓存</span>
        <span className="muted">仅本机</span>
      </button>
      {onLogout && (
        <button type="button" className="row my-row-btn" aria-label="退出登录" onClick={() => { if (confirm('确定退出登录吗？本机数据会保留。')) onLogout() }}>
          <span className="grow">退出登录</span>
        </button>
      )}
    </>
  )
}
