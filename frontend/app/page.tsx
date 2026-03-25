'use client'

import { useRef, useState } from 'react'
import ArtifactPanel from '@/components/ArtifactPanel'
import ChatPanel from '@/components/ChatPanel'
import { sendQuery, uploadFiles, createShare, SessionExpiredError } from '@/lib/api'
import { useTheme } from '@/lib/ThemeContext'
import { exportToPDF } from '@/lib/exportPDF'
import type { ArtifactPanelRef, DataFrameSchema, Message, QueryResponse } from '@/types'

export default function Home() {
  const { theme, toggleTheme } = useTheme()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([])
  const [schema, setSchema] = useState<Record<string, DataFrameSchema> | null>(null)
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [artifactOpen, setArtifactOpen] = useState(false)
  const [shareStatus, setShareStatus] = useState<'idle' | 'loading' | 'copied'>('idle')
  const [isDownloading, setIsDownloading] = useState(false)

  const artifactPanelRef = useRef<ArtifactPanelRef>(null)

  const handleFileUpload = async (files: File[]) => {
    setIsUploading(true)
    setSessionError(null)
    try {
      const response = await uploadFiles(files)
      setSessionId(response.session_id)
      setUploadedFiles(response.files_processed)
      setSchema(response.schema_summary)
      setSuggestedQuestions(response.suggested_questions)
      setMessages([])
    } catch (e: unknown) {
      setSessionError(e instanceof Error ? e.message : 'Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleSendQuery = async (query: string) => {
    if (isLoading) return

    const userMessage: Message = {
      role: 'user',
      content: query,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])

    if (!sessionId) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: {
              output_type: 'text',
              render_mode: 'chat',
              aggregation_code: null,
              chat_message: 'Please attach a data file (CSV or XLSX) using the paperclip icon below before asking a question.',
              artifact: null,
              insight: '',
            },
            timestamp: new Date().toISOString(),
          },
        ])
      }, 500)
      return
    }

    setIsLoading(true)

    try {
      const response: QueryResponse = await sendQuery(sessionId, query)

      const assistantMessage: Message = {
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMessage])

      if (response.render_mode === 'artifact' && response.artifact?.content) {
        setArtifactOpen(true)
        artifactPanelRef.current?.openArtifact(response.artifact.content, query)
      }
    } catch (e: unknown) {
      if (e instanceof SessionExpiredError) {
        setSessionError('Your session has expired. Please re-attach your files.')
        setSessionId(null)
      } else {
        const errorMessage: Message = {
          role: 'assistant',
          content: {
            output_type: 'text',
            render_mode: 'chat',
            aggregation_code: null,
            chat_message: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
            artifact: null,
            insight: '',
          },
          timestamp: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, errorMessage])
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleViewArtifact = (content: string, title: string) => {
    setArtifactOpen(true)
    artifactPanelRef.current?.openArtifact(content, title)
  }

  const handleReset = () => {
    setSessionId(null)
    setMessages([])
    setUploadedFiles([])
    setSchema(null)
    setSuggestedQuestions([])
    setSessionError(null)
    setArtifactOpen(false)
    setShareStatus('idle')
    artifactPanelRef.current?.close()
  }

  const handleDownloadPDF = async () => {
    if (isDownloading) return
    setIsDownloading(true)
    try {
      const chatEl = document.getElementById('chat-panel-root')
      const artifactEl = artifactOpen ? document.getElementById('artifact-panel-root') : null
      if (chatEl) {
        await exportToPDF(chatEl, artifactEl)
      }
    } finally {
      setIsDownloading(false)
    }
  }

  const handleShare = async () => {
    if (!sessionId || shareStatus === 'loading') return
    setShareStatus('loading')
    try {
      const { share_id } = await createShare(sessionId)
      const url = `${window.location.origin}/share/${share_id}`
      await navigator.clipboard.writeText(url)
      setShareStatus('copied')
      setTimeout(() => setShareStatus('idle'), 3000)
    } catch {
      setShareStatus('idle')
      setSessionError('Could not generate share link. Please try again.')
    }
  }

  const emptyStateNode = (
    <div className="flex flex-col items-center justify-center animate-fade-in mb-8">
      <div className="w-16 h-16 bg-surface border border-border rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-accent/5">
        <span className="text-3xl">✨</span>
      </div>
      <h2 className="font-heading text-3xl md:text-4xl text-text mb-4 text-center">What data are we analysing today?</h2>
      <p className="text-muted text-sm md:text-base text-center max-w-md leading-relaxed">
        Attach your CSV or XLSX files using the <strong className="text-text font-medium">paperclip icon</strong> below and start asking questions in plain English.
      </p>
    </div>
  )

  return (
    <div className="flex flex-col h-screen bg-bg">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-2xl text-accent tracking-wider">BI TOOL</h1>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            className="btn-ghost p-2 relative"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
              theme === 'dark' ? 'opacity-100 rotate-0' : 'opacity-0 rotate-90'
            }`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </span>
            <span className={`flex items-center justify-center transition-all duration-300 ${
              theme === 'light' ? 'opacity-100 rotate-0' : 'opacity-0 -rotate-90'
            }`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            </span>
          </button>

          {messages.length > 0 && (
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-50"
              title="Download chat & dashboard as PDF"
            >
              {isDownloading ? (
                <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )}
              {isDownloading ? 'Generating…' : 'Download PDF'}
            </button>
          )}

          {sessionId && messages.length > 0 && (
            <button
              onClick={handleShare}
              disabled={shareStatus === 'loading'}
              className={`btn-ghost text-xs flex items-center gap-1.5 ${shareStatus === 'copied' ? 'text-accent' : ''
                }`}
              title="Copy shareable link"
            >
              {shareStatus === 'loading' ? (
                <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              ) : shareStatus === 'copied' ? (
                '✓ Copied!'
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                  Share
                </>
              )}
            </button>
          )}
          {sessionId && (
            <button onClick={handleReset} className="btn-ghost text-xs" title="Start new session">
              + New Session
            </button>
          )}
        </div>
      </header>

      {sessionError && (
        <div role="alert" className="flex items-center justify-center gap-2 bg-red-500/10 border-b border-red-500/20 px-6 py-3 text-sm text-red-400">
          <span>⚠</span>
          <span>{sessionError}</span>
        </div>
      )}

      <main className="flex flex-1 overflow-hidden">
        <div
          id="chat-panel-root"
          className={[
            'flex flex-col h-full transition-all duration-300 ease-in-out bg-bg relative',
            artifactOpen ? 'w-full md:w-1/2 border-r border-border' : 'w-full',
          ].join(' ')}>

          {schema && (
            <div className="px-4 py-2 border-b border-border bg-surface/30 shrink-0 flex justify-center z-10">
              <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center max-w-3xl w-full">
                {Object.entries(schema).map(([key, info]) => (
                  <span key={key} className="text-xs text-muted">
                    <span className="text-accent font-mono">{key}</span>
                    {' · '}<span>{info.rows.toLocaleString()} rows</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <ChatPanel
            messages={messages}
            sessionId={sessionId}
            suggestedQuestions={suggestedQuestions}
            isLoading={isLoading}
            isUploadingFiles={isUploading}
            uploadedFiles={uploadedFiles}
            onSendMessage={handleSendQuery}
            onFileUpload={handleFileUpload}
            onViewArtifact={handleViewArtifact}
            emptyStateNode={emptyStateNode}
          />
        </div>

        {artifactOpen && (
          <ArtifactPanel ref={artifactPanelRef} />
        )}
      </main>
    </div>
  )
}