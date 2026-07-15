import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Download, Headphones, Loader2, Paintbrush } from 'lucide-react'
import { projectApi } from '@/services/api'

export function ExportCenter() {
  const projects = useQuery({
    queryKey: ['projects', 'export-center'],
    queryFn: () => projectApi.list({ page: 1, pageSize: 50 }),
  })
  const items = projects.data?.data.items ?? []

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-6">
      <header className="mb-5 flex items-center gap-3">
        <Download className="h-6 w-6 text-blue" />
        <div><h1 className="text-xl font-bold">导出中心</h1><p className="text-sm text-muted">选择项目进入画布，导出 PNG、SVG、JSON 或 PDF。</p></div>
      </header>
      <section className="border-t border-border">
        {projects.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted" /></div>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">暂无可导出的项目</p>
        ) : items.map((project) => (
          <div key={project.id} className="flex items-center justify-between border-b border-border py-4">
            <div><p className="font-medium">{project.title}</p><p className="mt-1 text-xs text-muted">{project.businessType} · {project.status}</p></div>
            <Link to={`/editor/${project.id}`} className="btn-primary"><Paintbrush size={15} /> 打开画布</Link>
          </div>
        ))}
      </section>
    </div>
  )
}

export function SupportCenter() {
  return (
    <div className="mx-auto max-w-[900px] px-6 py-6">
      <header className="mb-6 flex items-center gap-3">
        <Headphones className="h-6 w-6 text-blue" />
        <div><h1 className="text-xl font-bold">客服与帮助</h1><p className="text-sm text-muted">常见业务问题与当前服务状态说明。</p></div>
      </header>
      <dl className="divide-y divide-border border-y border-border">
        <div className="py-5"><dt className="font-medium">为什么无法使用高清生图？</dt><dd className="mt-2 text-sm text-muted">当图像服务未开通或管理员暂停时，高清生图会暂时不可用。你仍可使用「快速预览」查看示意图，不消耗积分。</dd></div>
        <div className="py-5"><dt className="font-medium">生成失败后积分如何处理？</dt><dd className="mt-2 text-sm text-muted">任务失败会自动退回已冻结的积分，可在积分总览查看明细。</dd></div>
        <div className="py-5"><dt className="font-medium">如何充值或开通会员？</dt><dd className="mt-2 text-sm text-muted">在线支付尚未开放，请联系管理员调整积分或开通套餐。</dd></div>
      </dl>
    </div>
  )
}
