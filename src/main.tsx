import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'
import { configMissing } from './lib/supabase'

function SetupMessage() {
  return (
    <div className="auth-main solo">
      <div className="auth-card">
        <h1>Site not configured</h1>
        <p className="auth-sub">
          This copy of PawTrack was built with missing or invalid Supabase settings. Check the build variables
          <b> VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_ANON_KEY</b>, then rebuild and deploy.
        </p>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {configMissing ? <SetupMessage /> : <App />}
  </StrictMode>,
)
