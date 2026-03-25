'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getShare } from '@/lib/api'

interface SharedMessage {
    role: 'user' | 'assistant'
    content: Record<string, unknown> | string
}

export default function SharePage() {
    const params = useParams()
    const shareId = params?.id as string

    const [messages, setMessages] = useState<SharedMessage[]>([])
    const [files, setFiles] = useState<string[]>([])
    const [createdAt, setCreatedAt] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!shareId) return
        getShare(shareId)
            .then((data) => {
                const msgs: SharedMessage[] = data.messages.map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                }))
                setMessages(msgs)
                setFiles(data.files)
                setCreatedAt(data.created_at)
            })
            .catch((e: Error) => setError(e.message))
            .finally(() => setLoading(false))
    }, [shareId])

    const date = createdAt
        ? new Date(createdAt * 1000).toLocaleDateString(undefined, {
            year: 'numeric', month: 'long', day: 'numeric',
        })
        : ''

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-bg">
                <div className="flex flex-col items-center gap-4 text-muted">
                    <span className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm">Loading shared report…</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen bg-bg">
                <div className="text-center">
                    <p className="text-4xl mb-4">🔗</p>
                    <p className="text-lg font-medium text-text mb-2">Report not found</p>
                    <p className="text-sm text-muted">{error}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-bg text-text">
            {/* Header */}
            <header className="sticky top-0 z-10 px-6 py-4 border-b border-border bg-bg/80 backdrop-blur-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="font-heading text-2xl text-accent tracking-wider">BI TOOL</h1>
                    <span className="text-xs text-muted border border-border rounded-full px-2 py-0.5">Shared Report</span>
                </div>
                <div className="text-right">
                    {date && <p className="text-xs text-muted">{date}</p>}
                    {files.length > 0 && (
                        <p className="text-xs text-muted mt-0.5">
                            {files.map(f => f.replace('df_', '')).join(', ')}
                        </p>
                    )}
                </div>
            </header>

            {/* Messages */}
            <main className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-6">
                {messages.map((msg, i) => {
                    const isUser = msg.role === 'user'
                    const content = msg.content

                    if (isUser) {
                        const text = typeof content === 'string' ? content : (content as { text?: string }).text ?? ''
                        return (
                            <div key={i} className="flex justify-end">
                                <div className="bg-accent text-bg rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm font-medium max-w-[75%]">
                                    {text}
                                </div>
                            </div>
                        )
                    }

                    const response = typeof content === 'string' ? null : content
                    const chatMessage = response?.chat_message as string ?? ''
                    const insight = response?.insight as string ?? ''
                    const isMetric = response?.output_type === 'metric'

                    return (
                        <div key={i} className="flex justify-start">
                            <div className="card px-4 py-3 rounded-2xl rounded-tl-sm text-sm max-w-[85%] flex flex-col gap-2">
                                <p className={isMetric ? 'font-mono text-accent text-xl font-medium' : 'text-text leading-relaxed'}>
                                    {chatMessage}
                                </p>
                                {insight && (
                                    <p className="text-sm text-muted italic border-l-2 border-accent/40 pl-3 leading-relaxed">
                                        {insight}
                                    </p>
                                )}
                            </div>
                        </div>
                    )
                })}
            </main>

            <footer className="text-center pb-8 text-xs text-muted">
                This is a read-only shared report · Powered by BI Tool
            </footer>
        </div>
    )
}
