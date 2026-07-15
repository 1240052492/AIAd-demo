import type { ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from '@/components/layout/MainLayout'
import AuthLayout from '@/components/layout/AuthLayout'
import HomePage from '@/pages/Home'
import EditorPage from '@/pages/Editor'
import ProjectsPage from '@/pages/Projects'
import AdminPage from '@/pages/Admin'
import { TemplateLibrary } from '@/components/projects/TemplateLibrary'
import PromptLibrary from '@/pages/Prompts'
import WorkflowLibrary from '@/pages/Workflows'
import AccountPage from '@/pages/Account'
import LoginPage from '@/pages/Login'
import RegisterPage from '@/pages/Register'
import { ExportCenter, SupportCenter } from '@/pages/Utility'
// === AGENT_F1_ROUTES ===
import { useAuthStore } from '@/stores'

/** 受保护路由：restoreSession 完成后，若仍未登录则跳转登录页。
 * 关键：必须等 restored=true，避免硬导航时（内存 token 尚未回填）抢先误弹回 /login。 */
function Protected({ children }: { children: ReactNode }) {
  const restored = useAuthStore((s) => s.restored)
  const user = useAuthStore((s) => s.user)
  if (!restored) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function hasAdminRole(user: ReturnType<typeof useAuthStore.getState>['user']): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  return !!user.roles?.some((item) => item?.role?.code === 'admin')
}

function AdminOnly({ children }: { children: ReactNode }) {
  const restored = useAuthStore((s) => s.restored)
  const user = useAuthStore((s) => s.user)
  if (!restored) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace />
  if (!hasAdminRole(user)) return <Navigate to="/" replace />
  return <>{children}</>
}

function FullScreenLoader() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
        <span className="text-sm text-slate-500">加载中…</span>
      </div>
    </div>
  )
}

export default function App() {
  const restored = useAuthStore((s) => s.restored)

  // 应用启动后、restoreSession() 完成前，先展示全屏加载，避免受保护路由抢先渲染导致误登出
  if (!restored) return <FullScreenLoader />

  return (
    <Routes>
      {/* 认证页面（无侧边栏） */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* 主应用（带侧边栏布局） */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects" element={<Protected><ProjectsPage /></Protected>} />
        <Route path="/projects/new" element={<Protected><Navigate to="/projects?create=1" replace /></Protected>} />
        <Route path="/projects/:id" element={<Protected><ProjectsPage /></Protected>} />
        <Route path="/templates" element={<div className="mx-auto max-w-[1200px] px-6 py-6"><TemplateLibrary /></div>} />
        <Route path="/prompts" element={<PromptLibrary />} />
        <Route path="/workflows" element={<Protected><WorkflowLibrary /></Protected>} />
        <Route path="/account" element={<Protected><AccountPage /></Protected>} />
        <Route path="/export" element={<Protected><ExportCenter /></Protected>} />
        <Route path="/support" element={<SupportCenter />} />
        {/* 携带图生图编辑器：?seedImg=<url>&polishPrompt=<text> */}
        <Route path="/editor" element={<Protected><EditorPage /></Protected>} />
        <Route path="/editor/:projectId" element={<Protected><EditorPage /></Protected>} />
        <Route path="/admin/*" element={<AdminOnly><AdminPage /></AdminOnly>} />
        {/* === AGENT_F1_ROUTES === 会员/积分/个人中心 已改为顶栏弹框，见 MainLayout */}
        {/* === AGENT_F3_ROUTES === */}
        <Route path="/dashboard" element={<AdminOnly><Navigate to="/admin" replace /></AdminOnly>} />
        {/* === AGENT_F3_ROUTES === */}
      </Route>

      {/* 兜底 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
