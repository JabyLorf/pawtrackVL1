import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { DeviceProvider } from './context/DeviceContext'
import { OpsLayout } from './components/OpsLayout'
import { AppBackHandler } from './components/AppBackHandler'
import { AdoptPage, HomePage } from './pages/PublicPages'
import { AboutPage, ContactPage, DonatePage } from './pages/SitePages'
import { StaffApplyPage, StaffLoginPage } from './pages/AuthPages'
import {
  AdoptedPage,
  AdoptionsPage,
  DashboardPage,
  DeletedDogsPage,
  DogEditPage,
  DogsPage,
  DonationsPage,
  InboxPage,
  MortalityPage,
  StaffAdminPage,
} from './pages/OpsPages'

// Root route: the Android back handler sits inside the router on every page.
function Root() {
  return (
    <>
      <AppBackHandler />
      <Outlet />
    </>
  )
}

// A data router, so forms can ask "Leave this page?" before navigating away.
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<Root />}>
      <Route path="/" element={<HomePage />} />
      <Route path="/adopt" element={<AdoptPage />} />
      <Route path="/donate" element={<DonatePage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/login" element={<Navigate to="/staff-login" replace />} />
      <Route path="/staff-login" element={<StaffLoginPage />} />
      <Route path="/staff-apply" element={<StaffApplyPage />} />
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
        <Route path="deleted" element={<DeletedDogsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>,
  ),
)

export default function App() {
  return (
    <DeviceProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </DeviceProvider>
  )
}
