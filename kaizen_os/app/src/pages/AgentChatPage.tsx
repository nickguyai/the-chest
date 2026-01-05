import { useState, useRef, useEffect, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { animate, stagger } from 'animejs'
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
    }}
  >
    {content}
  </ReactMarkdown>
)


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
    <div className="agent-message-full assistant">
      <div className="message-bubble-full assistant thinking-live">
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

export default function AgentChatPage() {
  const navigate = useNavigate()
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>()
  
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [liveThinkingSteps, setLiveThinkingSteps] = useState<ThinkingStep[]>([])
  const [sessionId, setSessionId] = useState<string | null>(urlSessionId || null)
  const [showHistory, setShowHistory] = useState(false)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [markdownMode, setMarkdownMode] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  const inputTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Load session if URL has sessionId
  useEffect(() => {
    if (urlSessionId) {
      loadSession(urlSessionId)
    }
  }, [urlSessionId])

  const loadSession = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/agent/sessions/${id}/messages`)
      const data = await response.json()
      setSessionId(id)
      setMessages(data.messages.map((m: AgentMessage) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })))
    } catch (error) {
      console.error('Failed to load session:', error)
    }
  }

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  useEffect(() => { scrollToBottom() }, [messages])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isStreaming) return
    await sendMessage(input)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    // In normal mode, Enter submits. In markdown mode, Enter creates newline.
    if (e.key === 'Enter' && !markdownMode && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !isStreaming) {
        sendMessage(input)
      }
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Auto-resize textarea
    if (markdownMode && inputTextareaRef.current) {
      inputTextareaRef.current.style.height = 'auto'
      inputTextareaRef.current.style.height = Math.min(inputTextareaRef.current.scrollHeight, 200) + 'px'
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
              if (parsed.type === 'session') {
                setSessionId(parsed.sessionId)
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
                      stepType = 'reading'; label = 'Reading'
                    } else if (toolName.includes('search') || toolName.includes('find')) {
                      stepType = 'analyzing'; label = 'Analyzing'
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

  const handleNewSession = () => {
    setSessionId(null)
    setMessages([])
    navigate('/chat')
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
    navigate(`/chat/${session.id}`)
    setShowHistory(false)
  }

  const handleDeleteSession = async (e: React.MouseEvent, sessionIdToDelete: string) => {
    e.stopPropagation()
    try {
      await fetch(`http://localhost:3001/api/agent/sessions/${sessionIdToDelete}`, { method: 'DELETE' })
      setSessions(prev => prev.filter(s => s.id !== sessionIdToDelete))
      if (sessionId === sessionIdToDelete) handleNewSession()
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

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
    setMessages(prev => prev.slice(0, editingIndex))
    setEditingIndex(null)
    await sendMessage(editContent)
    setEditContent('')
  }

  const handleRetry = async (index: number) => {
    const messageToRetry = messages[index]
    if (!messageToRetry || messageToRetry.role !== 'user') return
    setMessages(prev => prev.slice(0, index))
    await sendMessage(messageToRetry.content)
  }

  return (
    <div className="agent-chat-page">
      {/* Sidebar */}
      <aside className="agent-chat-sidebar">
        <div className="agent-chat-sidebar-header">
          <div className="flex items-center gap-3">
            <div className="agent-chat-avatar">
              <img src={agentIcon} alt="Agent" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Sensei</h2>
              <p className="text-xs text-[var(--color-text-muted)]">AI Assistant</p>
            </div>
          </div>
        </div>
        
        <div className="agent-chat-sidebar-actions">
          <button onClick={handleNewSession} className="agent-sidebar-btn primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            New Chat
          </button>
          <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadSessions(); }} className="agent-sidebar-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            History
          </button>
          <button onClick={() => navigate('/')} className="agent-sidebar-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back
          </button>
        </div>

        {showHistory && (
          <div className="agent-chat-sidebar-history">
            {isLoadingSessions ? (
              <p className="text-center text-sm text-[var(--color-text-muted)] py-4">Loading...</p>
            ) : sessions.length === 0 ? (
              <p className="text-center text-sm text-[var(--color-text-muted)] py-4">No sessions</p>
            ) : (
              sessions.map(session => (
                <button
                  key={session.id}
                  className={`agent-history-item ${session.id === sessionId ? 'active' : ''}`}
                  onClick={() => handleResumeSession(session)}
                >
                  <span className="agent-history-title">{session.title || 'Untitled'}</span>
                  <div className="agent-history-meta">
                    <span className="agent-history-date">{new Date(session.createdAt).toLocaleDateString()}</span>
                    <button className="agent-history-delete" onClick={(e) => handleDeleteSession(e, session.id)} title="Delete">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                      </svg>
                    </button>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </aside>

      {/* Main Chat Area */}
      <main className="agent-chat-main">
        <div className="agent-chat-messages-full">
          {messages.length === 0 && (
            <div className="agent-chat-empty-full">
              <div className="agent-chat-empty-icon">
                <img src={agentIcon} alt="Agent" className="w-16 h-16 object-contain" />
              </div>
              <h3 className="text-xl font-semibold text-[var(--color-text-primary)] mt-4">How can I help?</h3>
              <p className="text-sm text-[var(--color-text-muted)] mt-2">Ask me anything about your goals or codebase.</p>
            </div>
          )}
          {messages.map((msg, idx) => {
            const isEmptyStreamingMessage = msg.role === 'assistant' && !msg.content && isStreaming && idx === messages.length - 1
            if (isEmptyStreamingMessage) return null
            
            return (
              <div key={idx} className={`agent-message-full ${msg.role}`}>
                {editingIndex === idx ? (
                  <div className="message-edit-container-full">
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
                  <div className={`message-bubble-full ${msg.role}`}>
                    {msg.role === 'assistant' ? (
                      <div className="markdown-content"><MarkdownRenderer content={msg.content} /></div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {msg.role === 'user' && !isStreaming && (
                      <div className="message-actions-full">
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
              </div>
            )
          })}
          {isStreaming && <TypingIndicator thinkingSteps={liveThinkingSteps} />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="agent-chat-input-full">
          <form onSubmit={handleSubmit} className="agent-chat-input-form">
            <div className="input-mode-wrapper">
              <button
                type="button"
                className={`markdown-toggle-btn ${markdownMode ? 'active' : ''}`}
                onClick={() => {
                  setMarkdownMode(!markdownMode)
                  setTimeout(() => inputTextareaRef.current?.focus(), 0)
                }}
                title={markdownMode ? 'Switch to single-line mode' : 'Switch to markdown mode'}
              >
                <svg viewBox="0 0 208 128" fill="currentColor" width="14" height="14">
                  <rect width="198" height="118" x="5" y="5" rx="10" fill="none" stroke="currentColor" strokeWidth="10"/>
                  <path d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0-30-33h20V30h20v35h20z"/>
                </svg>
                Markdown
              </button>
              <div className={`input-container ${markdownMode ? 'markdown-active' : ''}`}>
                <div className="input-field-wrapper">
                  {markdownMode ? (
                    <textarea
                      ref={inputTextareaRef}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleInputKeyDown}
                      placeholder="Write your prompt...&#10;&#10;Use markdown formatting&#10;Enter creates new lines"
                      className="agent-chat-textarea-field"
                      disabled={isStreaming}
                      rows={4}
                    />
                  ) : (
                    <input
                      type="text"
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleInputKeyDown}
                      placeholder="Type your message..."
                      className="agent-chat-input-field"
                      disabled={isStreaming}
                    />
                  )}
                </div>
                <button type="submit" disabled={!input.trim() || isStreaming} className="agent-chat-send-btn">
                  {isStreaming ? (
                    <div className="agent-chat-spinner" />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  )}
                </button>
              </div>
              <div className="input-helper">
                {markdownMode ? (
                  <><kbd>Enter</kbd> = new line &nbsp;|&nbsp; Click <strong>Send</strong> to submit</>
                ) : (
                  <>Press <kbd>Enter</kbd> to send</>
                )}
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
