'use client'

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import type { ArtifactPanelRef } from '@/types'

interface ArtifactState {
  content: string
  title: string
}

const ArtifactPanel = forwardRef<ArtifactPanelRef>(function ArtifactPanel(_, ref) {
  const [artifact, setArtifact] = useState<ArtifactState | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useImperativeHandle(ref, () => ({
    openArtifact(content: string, title: string) {
      setArtifact({ content, title })
    },
    close() {
      setArtifact(null)
    },
  }))

  const exportHTML = () => {
    if (!artifact) return
    const blob = new Blob([artifact.content], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `artifact-${Date.now()}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleFullscreen = () => setIsFullscreen((f) => !f)

  if (!artifact) return null

  return (
    <div
      id="artifact-panel-root"
      className={[
        'flex flex-col bg-surface border-l border-border',
        'transition-all duration-300 ease-out',
        isFullscreen ? 'fixed inset-0 z-50' : 'relative h-full resize-x overflow-auto min-w-[300px]',
        isFullscreen ? 'w-full' : 'w-full md:w-1/2',
        'animate-slide-in',
      ].join(' ')}
      role="region"
      aria-label="Artifact panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 sm:px-4 py-3 border-b border-border shrink-0 w-full overflow-hidden">
        <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
          <span className="text-accent text-sm shrink-0">◈</span>
          <h2
            className="text-sm font-medium truncate"
            title={artifact.title}
          >
            {artifact.title}
          </h2>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Export PDF */}
          <button
            onClick={async () => {
              const { exportToPDF } = await import('@/lib/exportPDF');
              const el = document.getElementById('artifact-panel-root');
              if (el) await exportToPDF(document.createElement('div'), el);
            }}
            className="btn-ghost flex items-center gap-1.5"
            title="Export as PDF"
            aria-label="Export artifact as PDF"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <span className="hidden sm:inline">PDF</span>
          </button>

          {/* Export HTML */}
          <button
            onClick={exportHTML}
            className="btn-ghost flex items-center gap-1.5"
            title="Export as HTML"
            aria-label="Export artifact as HTML"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="hidden sm:inline">HTML</span>
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="btn-ghost"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                <line x1="10" y1="14" x2="3" y2="21" /><line x1="21" y1="3" x2="14" y2="10" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </button>

          {/* Close */}
          <button
            onClick={() => setArtifact(null)}
            className="btn-ghost"
            title="Close"
            aria-label="Close artifact panel"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* iframe renderer */}
      <div className="flex-1 relative bg-bg overflow-hidden">
        <iframe
          ref={iframeRef}
          srcDoc={artifact.content}
          sandbox="allow-scripts allow-same-origin"
          title="Artifact visualization"
          className="w-full h-full border-0"
          aria-label="Visualization artifact"
        />
      </div>
    </div>
  )
})

export default ArtifactPanel
