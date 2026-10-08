import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import LoginPage from './pages/LoginPage.jsx'
import HomePage from './pages/HomePage.jsx'
import BoardPage from './pages/BoardPage.jsx'
import PostDetailPage from './pages/PostDetailPage.jsx'
import CreatePostPage from './pages/CreatePostPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import ModulesPage from './pages/ModulesPage.jsx'
import BountyHallPage from './pages/BountyHallPage.jsx'
import BountyDetailPage from './pages/BountyDetailPage.jsx'
import RecruitHallPage from './pages/RecruitHallPage.jsx'
import RecruitDetailPage from './pages/RecruitDetailPage.jsx'
import CareerSquarePage from './pages/CareerSquarePage.jsx'
import CareerDetailPage from './pages/CareerDetailPage.jsx'
import BadgesPage from './pages/BadgesPage.jsx'
import AdminPage from './pages/AdminPage.jsx'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-loading">加载中…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/board/:slug" element={<BoardPage />} />
        <Route path="/post/:id" element={<PostDetailPage />} />
        <Route path="/create" element={<CreatePostPage />} />
        <Route path="/post/create" element={<CreatePostPage />} />
        <Route path="/profile/:id?" element={<ProfilePage />} />
        <Route path="/bounty" element={<BountyHallPage />} />
        <Route path="/bounty/:id" element={<BountyDetailPage />} />
        <Route path="/recruit" element={<RecruitHallPage />} />
        <Route path="/recruit/:id" element={<RecruitDetailPage />} />
        <Route path="/careers" element={<CareerSquarePage />} />
        <Route path="/career/:id" element={<CareerDetailPage />} />
        <Route path="/careers/:id" element={<CareerDetailPage />} />
        <Route path="/badges" element={<BadgesPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/m/:name" element={<ModulesPage />} />
        <Route path="/modules/:type" element={<ModulesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
