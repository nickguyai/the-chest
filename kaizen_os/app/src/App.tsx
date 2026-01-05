import { Routes, Route, useSearchParams, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import OverviewPage from './pages/OverviewPage'
import SeasonsPage from './pages/SeasonsPage'
import ThemeViewPage from './pages/ThemeViewPage'
import ContractPage from './pages/ContractPage'
import CardEditPage from './pages/CardEditPage'
import SettingsPage from './pages/SettingsPage'
import SeasonView from './pages/SeasonView'
import ActionTableView from './pages/ActionTableView'
import SeasonGradingPage from './pages/SeasonGradingPage'
import ReviewPage from './pages/ReviewPage'
import ClassificationRulesPage from './pages/ClassificationRulesPage'
import AgentChatPage from './pages/AgentChatPage'

function CreateDirector() {
  const [searchParams] = useSearchParams()
  const type = searchParams.get('type')
  if (type?.startsWith('ACTION_')) {
    return <Navigate to={`/contract/create?${searchParams.toString()}`} replace />
  }
  return <CardEditPage />
}

function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/themes" element={<Navigate to="/" replace />} />
        <Route path="/themes-overview" element={<OverviewPage />} />
        <Route path="/seasons" element={<SeasonsPage />} />
        <Route path="/seasons/:id" element={<SeasonView />} />
        <Route path="/theme/:id" element={<ThemeViewPage />} />
        <Route path="/contract/:id" element={<ContractPage />} />
        <Route path="/card/:entryId/edit" element={<CardEditPage />} />
        <Route path="/create" element={<CreateDirector />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/rules" element={<ClassificationRulesPage />} />
        <Route path="/seasons/:id/edit" element={<SeasonView />} />
        <Route path="/seasons/:id/grading" element={<SeasonGradingPage />} />
        <Route path="/theme/:id/actions/:type" element={<ActionTableView />} />
        <Route path="/actions/:type" element={<ActionTableView />} />
        <Route path="/actions" element={<ActionTableView />} />
        <Route path="/weekly" element={<Navigate to="/review" replace />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/chat" element={<AgentChatPage />} />
        <Route path="/chat/:sessionId" element={<AgentChatPage />} />
      </Routes>
    </div>
  )
}

export default App
