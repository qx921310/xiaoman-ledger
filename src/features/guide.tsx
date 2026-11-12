/**
 * 使用指南（对应一木 activity_user_guide：原生侧是 web_view 加载内容页）
 * 一木加载远程教程；我们没有那套内容，按「功能保留、内容自有」做成内置静态指南。
 */
export function Guide({ onBack }: { onBack: () => void }) {
  const sections: Array<[string, string[]]> = [
    ['记账', ['首页右下「＋」或「记一笔」进入记账', '分类可选大类与子类，金额支持算式', '「存为模板」可复用常用记账']],
    ['账户与资产', ['先在资产页建账户（资金/信贷/理财等）', '净资产、存款、负债可点开看构成', '资产页下拉进入隐藏资产']],
    ['日历', ['格子显示农历/节日与当日收支', '「更多」里可开热力背景', '选中某天查看当日明细与还款提醒']],
    ['统计', ['普通/年度/自定义三种视图', '分类占比饼图与趋势图', '预算按月生效，可在「我的」查看']],
    ['搜索', ['空格分隔多个关键词', '# 开头按标签匹配', '支持按分类/账户/日期筛选']],
    ['附件与同步', ['附件仅保留 30 天，到期销毁', '导出备份只含账目数据，不含附件', '登录后自动同步，冲突会提示核对']],
  ]
  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>使用指南</h3>
      </div>
      {sections.map(([title, lines]) => (
        <div key={title} className="guide-block">
          <b>{title}</b>
          <ul>
            {lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </div>
      ))}
    </>
  )
}
