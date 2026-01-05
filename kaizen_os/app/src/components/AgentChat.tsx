import { useState, useRef, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTimeline, animate, stagger } from 'animejs'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import agentIcon from '../assets/agent.png'
import type { AgentSession, AgentMessage } from '../lib/api'

interface ThinkingStep {
  type: 'analyzing' | 'reading' | 'processing' | 'reasoning'
  label: string
  text: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  thinkingSteps?: ThinkingStep[]
}

interface Checkpoint {
  uuid: string
  timestamp: Date
}

// Markdown Renderer Component
const MarkdownRenderer = ({ content }: { content: string }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
      code: ({ className, children }) => {
        const isInline = !className
        return isInline ? (
          <code className="bg-[var(--color-sage-lighter)] px-1.5 py-0.5 rounded text-[13px] font-mono">{children}</code>
        ) : (
          <code className="block bg-[var(--color-sage-lighter)] p-3 rounded-lg text-[13px] font-mono whitespace-pre-wrap break-words mb-2">{children}</code>
        )
      },
      pre: ({ children }) => <pre className="mb-2 whitespace-pre-wrap break-words">{children}</pre>,
      a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--color-sage)] underline hover:opacity-80">
          {children}
        </a>
      ),
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
      h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
      h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>,
      blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-[var(--color-sage)] pl-3 italic text-[var(--color-text-secondary)] mb-2">{children}</blockquote>
      ),
      table: ({ children }) => (
        <div className="overflow-x-auto mb-2">
          <table className="min-w-full text-sm border-collapse">{children}</table>
        </div>
      ),
      th: ({ children }) => <th className="border border-[var(--color-sage-border-light)] px-2 py-1 bg-[var(--color-sage-lighter)] font-semibold text-left">{children}</th>,
      td: ({ children }) => <td className="border border-[var(--color-sage-border-light)] px-2 py-1">{children}</td>,
    }}
  >
    {content}
  </ReactMarkdown>
)

// Thinking Panel Component
const ThinkingPanel = ({ steps }: { steps: ThinkingStep[] }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const pulseRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (pulseRef.current) {
      animate(pulseRef.current, {
        scale: [1, 1.3, 1],
        opacity: [0.6, 1, 0.6],
        duration: 1500,
        loop: true,
        ease: 'easeInOutSine'
      })
    }
  }, [])

  const toggleExpand = () => {
    const content = contentRef.current
    const inner = innerRef.current
    if (!content || !inner) return

    if (isExpanded) {
      animate(inner, { opacity: [1, 0], translateY: [0, -8], duration: 200, ease: 'easeInQuad' })
      animate(content, { maxHeight: [content.scrollHeight, 0], opacity: [1, 0], duration: 350, ease: 'easeInOutQuad', delay: 100 })
    } else {
      content.style.maxHeight = 'none'
      const targetHeight = content.scrollHeight
      content.style.maxHeight = '0'
      animate(content, { maxHeight: [0, targetHeight], opacity: [0, 1], duration: 400, ease: 'easeOutExpo' })
      animate(inner, { opacity: [0, 1], translateY: [-8, 0], duration: 350, ease: 'easeOutExpo', delay: 150 })
    }
    setIsExpanded(!isExpanded)
  }

  const getStepIcon = (type: ThinkingStep['type']) => {
    const icons = {
      analyzing: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
      reading: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>,
      processing: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>,
      reasoning: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
    }
    return icons[type]
  }

  if (steps.length === 0) return null

  return (
    <div className="thinking-container">
      <button className={`thinking-toggle ${isExpanded ? 'expanded' : ''}`} onClick={toggleExpand}>
        <span ref={pulseRef} className="thinking-pulse" />
        <span>{isExpanded ? 'Hide' : 'View'} thinking process</span>
        <svg className="thinking-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 4.5L6 7.5L9 4.5"/>
        </svg>
      </button>
      <div className="thinking-shadow">
        <div ref={contentRef} className="thinking-content">
          <div ref={innerRef} className="thinking-content-inner">
            {steps.map((step, idx) => (
              <div key={idx} className="thinking-step">
                <div className="thinking-step-icon">{getStepIcon(step.type)}</div>
                <div className="flex-1">
                  <div className="thinking-step-label">{step.label}</div>
                  <div className="thinking-step-text">{step.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Typing Indicator Component with Live Thinking
const TypingIndicator = ({ thinkingSteps = [] }: { thinkingSteps?: ThinkingStep[] }) => {
  const dotsRef = useRef<HTMLDivElement>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    if (dotsRef.current) {
      const dots = dotsRef.current.querySelectorAll('.typing-dot')
      animate(dots, {
        translateY: [-6, 0],
        opacity: [0.4, 1],
        delay: stagger(150),
        duration: 400,
        loop: true,
        alternate: true,
        ease: 'easeInOutQuad'
      })
    }
  }, [])

  const latestStep = thinkingSteps[thinkingSteps.length - 1]

  return (
    <div className="agent-message assistant">
      <div className="message-bubble assistant thinking-live">
        <div className="thinking-live-header">
          <div ref={dotsRef} className="typing-dots">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
          {latestStep && (
            <span className="thinking-live-status">{latestStep.label}: {latestStep.text}</span>
          )}
          {!latestStep && (
            <span className="thinking-live-status">Thinking...</span>
          )}
        </div>
        {thinkingSteps.length > 0 && (
          <div className="thinking-live-trace">
            <button 
              className="thinking-live-toggle"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Hide' : 'Show'} {thinkingSteps.length} action{thinkingSteps.length !== 1 ? 's' : ''}
              <svg className={`thinking-chevron ${isExpanded ? 'expanded' : ''}`} width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 4.5L6 7.5L9 4.5"/>
              </svg>
            </button>
            {isExpanded && (
              <div className="thinking-live-steps">
                {thinkingSteps.map((step, idx) => (
                  <div key={idx} className="thinking-live-step">
                    <span className="thinking-live-step-label">{step.label}</span>
                    <span className="thinking-live-step-text">{step.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


export const AgentChat = () => {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [liveThinkingSteps, setLiveThinkingSteps] = useState<ThinkingStep[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [showRollbackMenu, setShowRollbackMenu] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [markdownMode, setMarkdownMode] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  const inputTextareaRef = useRef<HTMLTextAreaElement>(null)

  const openFullPage = () => {
    if (sessionId) {
      navigate(`/chat/${sessionId}`)
    } else {
      navigate('/chat')
    }
  }

  const toggleChat = () => {
    if (isOpen) {
      if (!containerRef.current || !contentRef.current) {
        setIsOpen(false)
        return
      }
      const timeline = createTimeline({ defaults: { ease: 'easeOutExpo', duration: 400 } })
      timeline
        .add(contentRef.current, { opacity: 0, duration: 200 })
        .add(containerRef.current, { width: '60px', height: '60px', borderRadius: '30px', onComplete: () => setIsOpen(false) }, '-=100')
    } else {
      setIsOpen(true)
    }
  }

  useEffect(() => {
    if (isOpen && containerRef.current && contentRef.current) {
      const timeline = createTimeline({ defaults: { ease: 'easeOutExpo', duration: 400 } })
      timeline
        .add(containerRef.current, { width: '480px', height: '680px', borderRadius: '24px' })
        .add(contentRef.current, { opacity: [0, 1], translateY: [10, 0], duration: 300 }, '-=200')
    }
  }, [isOpen])

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  useEffect(() => { scrollToBottom() }, [messages])

  useEffect(() => {
    const lastMessage = document.querySelector('.agent-message:last-of-type')
    if (lastMessage && messages.length > 0) {
      animate(lastMessage, { opacity: [0, 1], translateY: [16, 0], scale: [0.96, 1], duration: 400, ease: 'easeOutExpo' })
    }
  }, [messages.length])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isStreaming) return
    await sendMessage(input)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !markdownMode && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !isStreaming) {
        sendMessage(input)
      }
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value)
    if (markdownMode && inputTextareaRef.current) {
      inputTextareaRef.current.style.height = 'auto'
      inputTextareaRef.current.style.height = Math.min(inputTextareaRef.current.scrollHeight, 150) + 'px'
    }
  }

  const sendMessage = async (messageContent: string) => {
    const userMessage: Message = { role: 'user', content: messageContent }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsStreaming(true)

    try {
      const response = await fetch('http://localhost:3001/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageContent, sessionId })
      })

      if (!response.ok) throw new Error('Failed to send message')
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantMessage = ''
      const thinkingSteps: ThinkingStep[] = []

      setMessages(prev => [...prev, { role: 'assistant', content: '', thinkingSteps: [] }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)

              // Handle session ID
              if (parsed.type === 'session') {
                setSessionId(parsed.sessionId)
              }

              // Handle checkpoint
              if (parsed.type === 'checkpoint') {
                setCheckpoints(prev => [...prev, { uuid: parsed.uuid, timestamp: new Date() }])
              }

              if (parsed.type === 'assistant' && parsed.message?.content) {
                for (const block of parsed.message.content) {
                  if (block.type === 'text') {
                    assistantMessage += block.text
                  } else if (block.type === 'tool_use') {
                    const toolName = block.name || 'unknown'
                    let stepType: ThinkingStep['type'] = 'processing'
                    let label = 'Processing'
                    if (toolName.includes('read') || toolName.includes('get') || toolName.includes('list')) {
                      stepType = 'reading'
                      label = 'Reading'
                    } else if (toolName.includes('search') || toolName.includes('find')) {
                      stepType = 'analyzing'
                      label = 'Analyzing'
                    } else if (toolName.includes('create') || toolName.includes('update') || toolName.includes('delete')) {
                      stepType = 'processing'
                      label = 'Modifying'
                    }
                    thinkingSteps.push({ type: stepType, label, text: `Using tool: ${toolName}` })
                    setLiveThinkingSteps([...thinkingSteps])
                  }
                }
                setMessages(prev => {
                  const newMessages = [...prev]
                  const lastMsg = newMessages[newMessages.length - 1]
                  lastMsg.content = assistantMessage
                  lastMsg.thinkingSteps = [...thinkingSteps]
                  return newMessages
                })
              } else if (parsed.type === 'result') {
                thinkingSteps.push({ type: 'reasoning', label: 'Completed', text: `Task ${parsed.subtype || 'finished'}` })
                setLiveThinkingSteps([...thinkingSteps])
                setMessages(prev => {
                  const newMessages = [...prev]
                  newMessages[newMessages.length - 1].thinkingSteps = [...thinkingSteps]
                  return newMessages
                })
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error.' }])
    } finally {
      setIsStreaming(false)
      setLiveThinkingSteps([])
    }
  }

  const handleRollback = async (checkpointUuid?: string) => {
    if (!sessionId) return
    setShowRollbackMenu(false)

    try {
      const response = await fetch('http://localhost:3001/api/agent/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, checkpointUuid })
      })

      const result = await response.json()

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✓ Rolled back ${result.rolledBack} agent changes.`
      }])
    } catch (error) {
      console.error('Rollback failed:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '✗ Rollback failed. Please try again.'
      }])
    }
  }

  const handleNewSession = () => {
    setSessionId(null)
    setMessages([])
    setCheckpoints([])
  }

  const loadSessions = async () => {
    setIsLoadingSessions(true)
    try {
      const response = await fetch('http://localhost:3001/api/agent/sessions')
      const data = await response.json()
      setSessions(data)
    } finally {
      setIsLoadingSessions(false)
    }
  }

  const handleResumeSession = async (session: AgentSession) => {
    try {
      const response = await fetch(`http://localhost:3001/api/agent/sessions/${session.id}/messages`)
      const data = await response.json()
      
      setSessionId(session.id)
      setMessages(data.messages.map((m: AgentMessage) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })))
      setCheckpoints([])
      setShowHistory(false)
    } catch (error) {
      console.error('Failed to load session:', error)
    }
  }

  const handleDeleteSession = async (e: React.MouseEvent, sessionIdToDelete: string) => {
    e.stopPropagation()
    try {
      await fetch(`http://localhost:3001/api/agent/sessions/${sessionIdToDelete}`, {
        method: 'DELETE',
      })
      setSessions(prev => prev.filter(s => s.id !== sessionIdToDelete))
      if (sessionId === sessionIdToDelete) {
        handleNewSession()
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  // Edit message handlers
  const handleStartEdit = (index: number, content: string) => {
    setEditingIndex(index)
    setEditContent(content)
    setTimeout(() => editTextareaRef.current?.focus(), 0)
  }

  const handleCancelEdit = () => {
    setEditingIndex(null)
    setEditContent('')
  }

  const handleSaveEdit = async () => {
    if (editingIndex === null || !editContent.trim()) return
    
    // Truncate messages from the edited index onward and update the content
    setMessages(prev => prev.slice(0, editingIndex))
    setEditingIndex(null)
    
    // Send the edited message
    await sendMessage(editContent)
    setEditContent('')
  }

  const handleRetry = async (index: number) => {
    const messageToRetry = messages[index]
    if (!messageToRetry || messageToRetry.role !== 'user') return
    
    // Truncate messages from this index onward
    setMessages(prev => prev.slice(0, index))
    
    // Resend the same message
    await sendMessage(messageToRetry.content)
  }


  return (
    <div
      ref={containerRef}
      className={`agent-chat-container ${isOpen ? 'open' : 'closed'}`}
      onClick={!isOpen ? toggleChat : undefined}
    >
      {!isOpen && (
        <div className="agent-chat-icon">
          <img src={agentIcon} alt="Agent" className="w-10 h-10 object-contain" />
        </div>
      )}

      {isOpen && (
        <div ref={contentRef} className="agent-chat-content">
          {/* Header */}
          <div className="agent-chat-header">
            <div className="flex items-center gap-3.5">
              <div className="agent-chat-avatar">
                <img src={agentIcon} alt="Agent" className="w-full h-full object-contain" />
              </div>
              <div>
                <h3 className="text-[17px] font-semibold text-[var(--color-text-primary)] leading-tight">Sensei</h3>
                <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wider mt-0.5">
                  {sessionId ? 'Session Active' : 'New Session'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* History button */}
              <button
                onClick={() => { setShowHistory(true); loadSessions(); }}
                className="agent-chat-action-btn"
                title="Session history"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </button>
              {/* Rollback button */}
              {sessionId && checkpoints.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowRollbackMenu(!showRollbackMenu)}
                    className="agent-chat-action-btn"
                    title="Undo agent changes"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                      <path d="M3 3v5h5"/>
                    </svg>
                  </button>
                  {showRollbackMenu && (
                    <div className="agent-rollback-menu">
                      <button onClick={() => handleRollback()} className="agent-rollback-item">
                        Undo all changes
                      </button>
                      {checkpoints.slice(-3).reverse().map((cp, idx) => (
                        <button
                          key={cp.uuid}
                          onClick={() => handleRollback(cp.uuid)}
                          className="agent-rollback-item"
                        >
                          Rollback to checkpoint {checkpoints.length - idx}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* New session button */}
              <button onClick={handleNewSession} className="agent-chat-action-btn" title="New session">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </button>
              {/* Open full page button */}
              <button onClick={openFullPage} className="agent-chat-action-btn" title="Open full page">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
              </button>
              {/* Close button */}
              <button onClick={(e) => { e.stopPropagation(); toggleChat() }} className="agent-chat-close">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* History Panel */}
          {showHistory && (
            <div className="agent-history-panel">
              <div className="agent-history-header">
                <h4>Session History</h4>
                <button onClick={() => setShowHistory(false)}>×</button>
              </div>
              <div className="agent-history-list">
                {isLoadingSessions ? (
                  <div className="agent-history-empty">Loading...</div>
                ) : sessions.length === 0 ? (
                  <div className="agent-history-empty">No previous sessions</div>
                ) : (
                  sessions.map(session => (
                    <button
                      key={session.id}
                      className={`agent-history-item ${session.id === sessionId ? 'active' : ''}`}
                      onClick={() => handleResumeSession(session)}
                    >
                      <span className="agent-history-title">
                        {session.title || 'Untitled'}
                      </span>
                      <div className="agent-history-meta">
                        <span className="agent-history-date">
                          {new Date(session.createdAt).toLocaleDateString()}
                        </span>
                        <button
                          className="agent-history-delete"
                          onClick={(e) => handleDeleteSession(e, session.id)}
                          title="Delete session"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                          </svg>
                        </button>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="agent-chat-messages">
            {messages.length === 0 && (
              <div className="agent-chat-empty">
                <div className="agent-chat-empty-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-sage)" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-[var(--color-text-secondary)]">Peaceful interaction.</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">Ask me anything about your goals or codebase.</p>
              </div>
            )}
            {messages.map((msg, idx) => {
              // Skip rendering empty assistant messages while streaming (typing indicator handles this)
              const isEmptyStreamingMessage = msg.role === 'assistant' && !msg.content && isStreaming && idx === messages.length - 1
              if (isEmptyStreamingMessage) return null
              
              return (
              <div key={idx} className={`agent-message ${msg.role}`}>
                {editingIndex === idx ? (
                  <div className="message-edit-container">
                    <textarea
                      ref={editTextareaRef}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="message-edit-textarea"
                      rows={3}
                    />
                    <div className="message-edit-actions">
                      <button onClick={handleCancelEdit} className="message-edit-btn cancel">Cancel</button>
                      <button onClick={handleSaveEdit} className="message-edit-btn save" disabled={!editContent.trim()}>Save & Send</button>
                    </div>
                  </div>
                ) : (
                  <div className={`message-bubble ${msg.role}`}>
                    {msg.role === 'assistant' ? (
                      <div className="markdown-content">
                        <MarkdownRenderer content={msg.content} />
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {msg.role === 'user' && !isStreaming && (
                      <div className="message-actions">
                        <button onClick={() => handleStartEdit(idx, msg.content)} className="message-action-btn" title="Edit">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button onClick={() => handleRetry(idx)} className="message-action-btn" title="Retry">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {msg.role === 'assistant' && msg.thinkingSteps && msg.thinkingSteps.length > 0 && (
                  <ThinkingPanel steps={msg.thinkingSteps} />
                )}
              </div>
            )})}
            {isStreaming && <TypingIndicator thinkingSteps={liveThinkingSteps} />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="agent-chat-input-area">
            <form onSubmit={handleSubmit} className="agent-chat-input-form-widget">
              <div className="input-mode-wrapper-widget">
                <button
                  type="button"
                  className={`markdown-toggle-btn ${markdownMode ? 'active' : ''}`}
                  onClick={() => {
                    setMarkdownMode(!markdownMode)
                    setTimeout(() => inputTextareaRef.current?.focus(), 0)
                  }}
                  title={markdownMode ? 'Switch to single-line mode' : 'Switch to markdown mode'}
                >
                  <svg viewBox="0 0 208 128" fill="currentColor" width="12" height="12">
                    <rect width="198" height="118" x="5" y="5" rx="10" fill="none" stroke="currentColor" strokeWidth="10"/>
                    <path d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0-30-33h20V30h20v35h20z"/>
                  </svg>
                  MD
                </button>
                <div className={`input-container-widget ${markdownMode ? 'markdown-active' : ''}`}>
                  <div className="input-field-wrapper">
                    {markdownMode ? (
                      <textarea
                        ref={inputTextareaRef}
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleInputKeyDown}
                        placeholder="Write your prompt..."
                        className="agent-chat-textarea-widget"
                        disabled={isStreaming}
                        rows={3}
                      />
                    ) : (
                      <input
                        type="text"
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleInputKeyDown}
                        placeholder="Compose a request..."
                        className="agent-chat-input"
                        disabled={isStreaming}
                      />
                    )}
                  </div>
                  <button type="submit" disabled={!input.trim() || isStreaming} className="agent-chat-send">
                    {isStreaming ? (
                      <div className="agent-chat-spinner" />
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
