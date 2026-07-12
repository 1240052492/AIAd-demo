import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from '@/components/layout/MainLayout'
import AuthLayout from '@/components/layout/AuthLayout'
import HomePage from '@/pages/Home'
import EditorPage from '@/pages/Editor'
import ProjectsPage from '@/pages/Projects'
import AdminPage from '@/pages/Admin'
import { TemplateLibrary } from '@/components/projects/TemplateLibrary'
import LoginPage from '@/pages/Login'
import RegisterPage from '@/pages/Register'

export default function App() {
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
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectsPage />} />
        <Route path="/templates" element={<div className="mx-auto max-w-[1200px] px-6 py-6"><TemplateLibrary /></div>} />
        <Route path="/editor/:projectId" element={<EditorPage />} />
        <Route path="/admin/*" element={<AdminPage />} />
      </Route>

      {/* 兜底 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
