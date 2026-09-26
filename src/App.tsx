import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayoutPage } from './components/AppLayout'
import { OnboardingPage } from './features/onboarding/OnboardingPage'
import { TodayPage } from './features/today/TodayPage'
import { FeedingPage } from './features/feeding/FeedingPage'
import { SleepPage } from './features/sleep/SleepPage'
import { DiapersPage } from './features/diapers/DiapersPage'
import { MilestonesPage } from './features/milestones/MilestonesPage'
import { RoutinesPage } from './features/routines/RoutinesPage'
import { TrendsPage } from './features/trends/TrendsPage'
import { MomPage } from './features/mom/MomPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { ChangelogPage } from './features/changelog/ChangelogPage'

export default function App() {
  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route element={<AppLayoutPage />}>
        <Route path="/" element={<TodayPage />} />
        <Route path="/feeding" element={<FeedingPage />} />
        <Route path="/sleep" element={<SleepPage />} />
        <Route path="/diapers" element={<DiapersPage />} />
        <Route path="/milestones" element={<MilestonesPage />} />
        <Route path="/growth" element={<Navigate to="/milestones" replace />} />
        <Route path="/routines" element={<RoutinesPage />} />
        <Route path="/trends" element={<TrendsPage />} />
        <Route path="/mom" element={<MomPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/changelog" element={<ChangelogPage />} />
      </Route>
    </Routes>
  )
}