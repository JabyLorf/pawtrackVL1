import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { DeviceProvider } from './context/DeviceContext'
import { OpsLayout } from './components/OpsLayout'
import { AdoptPage, HomePage } from './pages/PublicPages'
import { AboutPage, ContactPage, DonatePage } from './pages/SitePages'
import { LoginPage, SignupPage, StaffLoginPage } from './pages/AuthPages'
import {
  AdoptedPage,
  AdoptionsPage,
  DashboardPage,
  DogEditPage,
  DogsPage,
  DonationsPage,
  InboxPage,
  MortalityPage,
  StaffAdminPage,
} from './pages/OpsPages'

export default function App() {
  return (
    <DeviceProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/adopt" element={<AdoptPage />} />
            <Route path="/donate" element={<DonatePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/staff-login" element={<StaffLoginPage />} />
            <Route path="/ops" element={<OpsLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="dogs" element={<DogsPage />} />
              <Route path="dogs/new" element={<DogEditPage />} />
              <Route path="dogs/:id" element={<DogEditPage />} />
              <Route path="adopted" element={<AdoptedPage />} />
              <Route path="mortality" element={<MortalityPage />} />
              <Route path="adoptions" element={<AdoptionsPage />} />
              <Route path="donations" element={<DonationsPage />} />
              <Route path="inbox" element={<InboxPage />} />
              <Route path="staff" element={<StaffAdminPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </DeviceProvider>
  )
}
