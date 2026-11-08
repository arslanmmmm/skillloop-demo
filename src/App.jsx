import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import ChatPage from './pages/Chat.jsx'
import FeedPage from './pages/Feed.jsx'
import LoginPage from './pages/Login.jsx'
import MatchesPage from './pages/Matches.jsx'
import ProfilePage from './pages/Profile.jsx'
import ReviewPage from './pages/Review.jsx'
import WritePage from './pages/Write.jsx'
import './App.css'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/matches" element={<MatchesPage />} />
          <Route path="/chat/:requestId" element={<ChatPage />} />
          <Route path="/write" element={<WritePage />} />
          <Route path="/review" element={<ReviewPage />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/feed" replace />} />
      <Route path="*" element={<Navigate to="/feed" replace />} />
    </Routes>
  )
}
