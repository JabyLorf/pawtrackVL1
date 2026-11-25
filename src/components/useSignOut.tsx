import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from './ConfirmDialog'

/** "Sign out?" confirmation. Call `askSignOut()` and render `signOutDialog`. */
export function useSignOut() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirm()
  const askSignOut = () =>
    confirm({
      title: 'Sign out?',
      body: 'You will need your email and password to sign in again.',
      confirmLabel: 'Yes, sign out',
      busyLabel: 'Signing out…',
      action: async () => {
        await signOut()
        navigate('/')
      },
    })
  return { askSignOut, signOutDialog: dialog }
}
