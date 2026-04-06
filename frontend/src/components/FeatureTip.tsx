import React, { useState } from 'react'

export default function FeatureTip({ id, children, tip }: { id: string; children: React.ReactNode; tip: string }) {
  const [show, setShow] = useState(() => !localStorage.getItem(`hpe_tip_${id}`))
  const dismiss = () => { setShow(false); localStorage.setItem(`hpe_tip_${id}`, '1') }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {children}
      {show && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--accent)', color: '#fff', padding: '6px 12px', borderRadius: 6,
          fontSize: 11, whiteSpace: 'nowrap', marginBottom: 6, zIndex: 100,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {tip}
          <button onClick={dismiss} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13 }}>x</button>
        </div>
      )}
    </div>
  )
}
