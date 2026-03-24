'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// ─── Browser type shims (Web Speech API is not in TypeScript's default lib) ──

declare global {
    interface Window {
        SpeechRecognition: new () => ISpeechRecognition
        webkitSpeechRecognition: new () => ISpeechRecognition
    }
}

interface ISpeechRecognitionAlternative {
    readonly transcript: string
    readonly confidence: number
}

interface ISpeechRecognitionResult {
    readonly isFinal: boolean
    readonly length: number
    item(index: number): ISpeechRecognitionAlternative
    [index: number]: ISpeechRecognitionAlternative
}

interface ISpeechRecognitionResultList {
    readonly length: number
    item(index: number): ISpeechRecognitionResult
    [index: number]: ISpeechRecognitionResult
}

interface ISpeechRecognitionEvent extends Event {
    readonly results: ISpeechRecognitionResultList
}

interface ISpeechRecognition extends EventTarget {
    lang: string
    interimResults: boolean
    maxAlternatives: number
    continuous: boolean
    onresult: ((event: ISpeechRecognitionEvent) => void) | null
    onstart: (() => void) | null
    onend: (() => void) | null
    onerror: (() => void) | null
    start(): void
    stop(): void
    abort(): void
}

// ─── Context types ────────────────────────────────────────────────────────────

interface VoiceContextValue {
    isListening: boolean
    isSpeaking: boolean
    supported: boolean
    startListening: (onResult: (text: string) => void) => void
    stopListening: () => void
    speak: (text: string) => void
    stopSpeaking: () => void
}

const VoiceContext = createContext<VoiceContextValue>({
    isListening: false,
    isSpeaking: false,
    supported: false,
    startListening: () => { },
    stopListening: () => { },
    speak: () => { },
    stopSpeaking: () => { },
})

export function useVoice() {
    return useContext(VoiceContext)
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function VoiceProvider({ children }: { children: React.ReactNode }) {
    const [isListening, setIsListening] = useState(false)
    const [isSpeaking, setIsSpeaking] = useState(false)
    const [supported, setSupported] = useState(false)

    useEffect(() => {
        setSupported(
            ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) &&
            'speechSynthesis' in window
        )
    }, [])

    const recognitionRef = useRef<ISpeechRecognition | null>(null)

    // ── Speech-to-Text ──────────────────────────────────────────────────────────

    const startListening = useCallback(
        (onResult: (text: string) => void) => {
            if (!supported || isListening) return

            const SR: new () => ISpeechRecognition =
                window.SpeechRecognition ?? window.webkitSpeechRecognition

            const recognition = new SR()
            recognition.lang = 'en-US'
            recognition.interimResults = false
            recognition.maxAlternatives = 1
            recognition.continuous = false

            recognition.onresult = (event: ISpeechRecognitionEvent) => {
                const transcript = event.results[0][0].transcript.trim()
                if (transcript) onResult(transcript)
            }
            recognition.onstart = () => setIsListening(true)
            recognition.onend = () => setIsListening(false)
            recognition.onerror = () => setIsListening(false)

            recognitionRef.current = recognition
            recognition.start()
        },
        [supported, isListening],
    )

    const stopListening = useCallback(() => {
        recognitionRef.current?.stop()
        setIsListening(false)
    }, [])

    // ── Text-to-Speech ──────────────────────────────────────────────────────────

    const speak = useCallback(
        (text: string) => {
            if (!supported) return
            window.speechSynthesis.cancel()

            // Strip markdown for cleaner audio
            const clean = text
                .replace(/[#*_`~>]/g, '')
                .replace(/\n+/g, '. ')
                .trim()

            const utterance = new SpeechSynthesisUtterance(clean)
            utterance.rate = 1.05
            utterance.pitch = 1.0

            utterance.onstart = () => setIsSpeaking(true)
            utterance.onend = () => setIsSpeaking(false)
            utterance.onerror = () => setIsSpeaking(false)

            window.speechSynthesis.speak(utterance)
        },
        [supported],
    )

    const stopSpeaking = useCallback(() => {
        window.speechSynthesis.cancel()
        setIsSpeaking(false)
    }, [])

    useEffect(() => () => { window.speechSynthesis?.cancel() }, [])

    return (
        <VoiceContext.Provider
            value={{ isListening, isSpeaking, supported, startListening, stopListening, speak, stopSpeaking }}
        >
            {children}
        </VoiceContext.Provider>
    )
}
