import { Outlet } from 'react-router-dom'

/** 渐变 Logo 图标 */
function LogoMark() {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-card bg-gradient-to-br from-blue to-[#7cc7ff] text-2xl font-extrabold text-[#07121d] shadow-lg shadow-blue/25">
      A
    </div>
  )
}

/**
 * 认证布局：简洁的居中卡片，用于登录 / 注册页面。
 * 作为布局路由，子页面（Login / Register）通过 Outlet 渲染。
 */
export default function AuthLayout() {
  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-bg px-4 py-10 text-text">
      {/* 背景光晕装饰 */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-blue/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-160px] right-[-80px] h-[360px] w-[360px] rounded-full bg-[#7cc7ff]/10 blur-[120px]" />

      {/* 顶部品牌 */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <LogoMark />
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-tight">AdCraft AI 广告工作台</h1>
          <p className="mt-1 text-xs text-muted">从一句客户需求，到可交付的广告效果图</p>
        </div>
      </div>

      {/* 卡片容器：子页面在此渲染 */}
      <div className="relative z-10 w-full max-w-[420px]">
        <Outlet />
      </div>

      <p className="relative z-10 mt-8 text-center text-xs text-muted/70">
        © {new Date().getFullYear()} AdCraft AI · 让广告生产更简单
      </p>
    </div>
  )
}
