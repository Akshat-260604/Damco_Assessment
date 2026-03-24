'use client'

import { memo, useState } from 'react'
import type { Message, QueryResponse, SourceCitation, AnomalyWarning } from '@/types'
import { useVoice } from '@/lib/VoiceContext'

interface Props {
  message: Message
  onViewArtifact?: (content: string, title: string) => void
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  return String(value ?? '')
}

function downloadCSV(data: unknown[], filename = 'export.csv') {
  if (!data?.length) return
  const keys = Object.keys(data[0] as object)
  const rows = [
    keys.join(','),
    ...data.map(row =>
      keys.map(k => {
        const val = String((row as Record<string, unknown>)[k] ?? '')
        return val.includes(',') ? `"${val}"` : val
      }).join(',')
    ),
  ]
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function CitationPill({ c }: { c: SourceCitation }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      title="Click to toggle full column list"
      className="inline-flex text-left items-start sm:items-center gap-1.5 text-[11px] bg-bg border border-border rounded-full px-2.5 py-1 text-muted hover:text-text hover:border-accent/40 transition-all"
    >
      <span className="text-accent shrink-0 mt-[1px] sm:mt-0">📄</span>
      <span className="flex flex-wrap items-center gap-1.5 overflow-hidden">
        <span className="font-medium text-text shrink-0">{c.filename}</span>
        <span className="text-muted/60 shrink-0">·</span>
        <span className="shrink-0">{c.row_count.toLocaleString()} rows</span>
        {c.columns_used.length > 0 && (
          <>
            <span className="text-muted/60 shrink-0">·</span>
            <span className={`font-mono transition-all ${expanded ? 'whitespace-normal break-words' : 'truncate max-w-[140px]'}`}>
              {c.columns_used.join(', ')}
            </span>
          </>
        )}
      </span>
    </button>
  )
}

function SourceCitations({ citations }: { citations: SourceCitation[] }) {
  const [showAll, setShowAll] = useState(false)
  if (!citations || citations.length === 0) return null

  const visible = showAll ? citations : citations.slice(0, 2)

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-widest text-muted font-semibold shrink-0">Sources</span>
        {visible.map((c, i) => (
          <CitationPill key={i} c={c} />
        ))}
        {citations.length > 2 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[11px] text-accent hover:text-accent/70 transition-colors shrink-0"
          >
            {showAll ? 'Show less' : `+${citations.length - 2} more`}
          </button>
        )}
      </div>
    </div>
  )
}

function AssistantContent({
  response,
  onViewArtifact,
}: {
  response: QueryResponse
  onViewArtifact?: (content: string, title: string) => void
}) {
  const isMetric = response.output_type === 'metric'
  const hasArtifact = !!(response.render_mode === 'artifact' && response.artifact?.content)
  const { speak, stopSpeaking, isSpeaking } = useVoice()

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Main message + speaker button */}
      <div className="flex items-start gap-2">
        <p className={`flex-1 ${isMetric ? 'font-mono text-accent text-xl font-medium' : 'text-text leading-relaxed'}`}>
          {response.chat_message}
        </p>
        <button
          onClick={() => isSpeaking ? stopSpeaking() : speak(response.chat_message)}
          title={isSpeaking ? 'Stop speaking' : 'Read aloud'}
          aria-label={isSpeaking ? 'Stop speaking' : 'Read aloud'}
          className={`shrink-0 mt-0.5 p-1.5 rounded-lg transition-colors ${isSpeaking ? 'text-accent bg-accent/10' : 'text-muted hover:text-text hover:bg-bg'
            }`}
        >
          {isSpeaking ? (
            // Animated bars when speaking
            <span className="flex gap-0.5 items-end h-4 w-4">
              {[0, 1, 2].map(i => (
                <span key={i} className="w-0.5 bg-current rounded-full animate-pulse" style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 120}ms` }} />
              ))}
            </span>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          )}
        </button>
      </div>

      {/* Execution error */}
      {response.execution_error && (
        <p className="text-xs text-red-400 bg-red-500/10 rounded px-3 py-2">
          ⚠ Code execution error: {response.execution_error}
        </p>
      )}

      {/* View artifact button */}
      {hasArtifact && (
        <button
          onClick={() =>
            onViewArtifact?.(response.artifact!.content, response.chat_message)
          }
          className="self-start flex items-center gap-1.5 text-sm font-medium text-accent
                     hover:text-accent/80 transition-colors"
          aria-label="View artifact visualization"
        >
          <span>→</span>
          <span>View {response.output_type === 'dashboard' ? 'Dashboard' : 'Chart'}</span>
        </button>
      )}

      {/* Insight */}
      {response.insight && (
        <p className="text-sm text-muted italic border-l-2 border-accent/40 pl-3 leading-relaxed">
          {String(response.insight)}
        </p>
      )}

      {/* Source Citations */}
      {response.citations && response.citations.length > 0 && (
        <SourceCitations citations={response.citations} />
      )}

      {/* Anomaly Warnings */}
      {response.anomaly_warnings && response.anomaly_warnings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {response.anomaly_warnings.map((w: AnomalyWarning, i: number) => (
            <div
              key={i}
              className={`flex items-center gap-2 text-[11px] rounded-lg px-2.5 py-1.5 border ${w.severity === 'high'
                ? 'bg-red-500/10 border-red-500/20 text-red-400'
                : w.severity === 'medium'
                  ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                  : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                }`}
            >
              <span>⚠</span>
              <span>
                <strong>{w.column}</strong> in <strong>{w.dataframe}</strong> has{' '}
                {w.outlier_count} outlier{w.outlier_count !== 1 ? 's' : ''} ({w.outlier_pct}% of rows) — result may be skewed
              </span>
            </div>
          ))}
        </div>
      )}

      {/* CSV Export for table results */}
      {(response.output_type === 'table' || response.output_type === 'comparison') &&
        !!(response.execution_result) &&
        (response.execution_result as { type?: string; data?: unknown[] }).type === 'dataframe' && (
          <button
            onClick={() => downloadCSV(
              (response.execution_result as { data: unknown[] }).data,
              'export.csv'
            )}
            className="self-start flex items-center gap-1.5 text-[11px] text-muted hover:text-text border border-border hover:border-accent/40 rounded-full px-3 py-1 transition-colors"
            aria-label="Download table as CSV"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download CSV
          </button>
        )}
    </div>
  )
}

const MessageBubble = memo(function MessageBubble({ message, onViewArtifact }: Props) {
  const isUser = message.role === 'user'
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[75%] flex flex-col items-end gap-1">
          <div className="bg-accent text-bg rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm font-medium">
            {typeof message.content === 'string' ? message.content : ''}
          </div>
          <span className="text-xs text-muted">{time}</span>
        </div>
      </div>
    )
  }

  // Assistant message
  const response = typeof message.content === 'string' ? null : (message.content as QueryResponse)

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="max-w-[85%] flex flex-col gap-1">
        <div className="card px-4 py-3 rounded-2xl rounded-tl-sm text-sm">
          {response ? (
            <AssistantContent response={response} onViewArtifact={onViewArtifact} />
          ) : (
            <p className="text-text leading-relaxed">{message.content as string}</p>
          )}
        </div>
        <span className="text-xs text-muted ml-1">{time}</span>
      </div>
    </div>
  )
})

export default MessageBubble
