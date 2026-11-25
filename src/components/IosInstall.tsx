import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Share, SquarePlus, Smartphone } from 'lucide-react'
import { Modal } from './Modal'
import { APK_URL, isIOS } from '../lib/app'

/** Steps for adding the website to an iPhone home screen. */
export function IosInstallDialog({ onClose }: { onClose: () => void }) {
  // Rendered on <body> so footer/drawer styles don't leak into the popup.
  return createPortal(
    <Modal onClose={onClose}>
      <div className="dialog">
        <div className="auth-icon"><Smartphone size={22} /></div>
        <h2>Add PawTrack to your iPhone</h2>
        <p className="auth-sub">PawTrack works on iPhone straight from Safari, with its own icon on your home screen.</p>
        <ol className="ios-steps">
          <li><span>1</span><div>Open this page in <b>Safari</b>.</div></li>
          <li><span>2</span><div>Tap the <b>Share</b> button <Share size={16} className="inline-ic" /> at the bottom of the screen (on iPad, top right).</div></li>
          <li><span>3</span><div>Scroll down and tap <b>Add to Home Screen</b> <SquarePlus size={16} className="inline-ic" />.</div></li>
          <li><span>4</span><div>Tap <b>Add</b>. Open PawTrack from its new icon.</div></li>
        </ol>
        <div className="dialog-actions">
          <button className="btn btn-primary" type="button" onClick={onClose}>Got it</button>
        </div>
      </div>
    </Modal>,
    document.body,
  )
}

/**
 * "Get the app" button: the APK on Android and computers, the
 * home-screen steps on iPhone. `both` also adds the iPhone button elsewhere.
 */
export function GetAppButtons({ className, iphoneClassName, size = 16, both, androidLabel = 'Get the Android app' }: {
  className: string
  iphoneClassName?: string
  size?: number
  both?: boolean
  androidLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const iphone = (
    <button className={(isIOS ? className : iphoneClassName) || className} type="button" onClick={() => setOpen(true)}>
      <Smartphone size={size} /> {isIOS ? 'Add to iPhone home screen' : 'On iPhone?'}
    </button>
  )
  return (
    <>
      {!isIOS ? <a className={className} href={APK_URL} download><Download size={size} /> {androidLabel}</a> : null}
      {isIOS || both ? iphone : null}
      {open ? <IosInstallDialog onClose={() => setOpen(false)} /> : null}
    </>
  )
}
