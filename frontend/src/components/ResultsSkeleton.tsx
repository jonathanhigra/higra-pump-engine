import React from 'react'
import Skeleton from './Skeleton'

/**
 * Skeleton placeholder that mimics the ResultsView layout.
 * Shown while the sizing computation is running.
 */
export default function ResultsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Hero strip — 3 metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <Skeleton variant="card" height="80px" />
        <Skeleton variant="card" height="80px" />
        <Skeleton variant="card" height="80px" />
      </div>

      {/* Text lines — title + rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
        <Skeleton variant="text" width="40%" height="16px" />
        <Skeleton variant="text" width="100%" />
        <Skeleton variant="text" width="85%" />
      </div>

      {/* Two card skeletons — gauge + status area */}
      <Skeleton variant="card" />
      <Skeleton variant="card" />

      {/* Chart skeleton — performance chart area */}
      <Skeleton variant="chart" />
    </div>
  )
}
