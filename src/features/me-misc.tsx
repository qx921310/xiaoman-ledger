import { useState } from 'react'
import { useLedger } from '../store'

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

export function MeMiscPage({ name, onBack }: { name: string; onBack: () => void }) {
  const page = PAGES[name] ?? { title: '敬请期待', body: ['这个功能还在开发中。'] }
  const [modules, setModules] = useState<{ summary: boolean; budget: boolean; flow: boolean }>(() => {
    try { return { summary: true, budget: true, flow: true, ...(JSON.parse(localStorage.getItem('xiaoman-home-modules') ?? '{}')) } }
    catch { return { summary: true, budget: true, flow: true } }
  })
  const toggle = (k: 'summary' | 'budget' | 'flow') => {
    const next = { ...modules, [k]: !modules[k] }
    setModules(next)
    localStorage.setItem('xiaoman-home-modules', JSON.stringify(next))
  }
  const clearCache = async () => {
    const { clearAllBookPatches } = await import('./book-pending')
    const n = await clearAllBookPatches()
    alert(n ? `已清理 ${n} 条本机待同步修改` : '没有需要清理的本机修改')
  }
  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回我的</button>
        <h3>{page.title}</h3>
      </div>
      {name === 'more' ? (
        <>
          <h3>首页显示内容</h3>
          {([
            ['summary', '收支汇总卡'],
            ['budget', '预算进度'],
            ['flow', '最近流水'],
          ] as const).map(([k, label]) => (
            <label key={k} className="row">
              <span className="grow">{label}</span>
              <input type="checkbox" checked={modules[k]} onChange={() => toggle(k)} />
            </label>
          ))}
          <h3>维护</h3>
          <button type="button" className="row my-row-btn" onClick={() => void clearCache()}>
            <span className="grow">清理本机同步缓存</span>
            <span className="muted">仅本机</span>
          </button>
          <p className="hint">当前账本：{useLedger.getState().accountBooks.find((b) => String(b.bookId) === String(useLedger.getState().currentBookId))?.accountBookName ?? '—'}</p>
        </>
      ) : page.body.map((line) => <p key={line} className="hint">{line}</p>)}
    </>
  )
}
