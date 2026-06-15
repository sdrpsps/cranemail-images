'use client'

import { useState, useEffect, useCallback } from 'react'

interface User {
  username: string
  emailAddress: string
  serverUrl: string
  isTelegramBound: boolean
}

interface BindData {
  token: string
  bindUrl: string
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Form states
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [serverUrl, setServerUrl] = useState(process.env.NEXT_PUBLIC_SMARTERMAIL_URL || 'https://us1.workspace.org')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Telegram Binding Modal States
  const [showBindModal, setShowBindModal] = useState(false)
  const [bindPassword, setBindPassword] = useState('')
  const [bindLoading, setBindLoading] = useState(false)
  const [bindError, setBindError] = useState('')
  const [bindData, setBindData] = useState<BindData | null>(null)

  // Web Upload States
  const [uploadFiles, setUploadFiles] = useState<{ name: string; url: string; size: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [isDragActive, setIsDragActive] = useState(false)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true)
    } else if (e.type === 'dragleave') {
      setIsDragActive(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await uploadFile(e.dataTransfer.files[0])
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await uploadFile(e.target.files[0])
    }
  }

  const uploadFile = async (file: File) => {
    setUploading(true)
    setUploadError('')
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.success && data.data) {
        const sizeStr = (file.size / (1024 * 1024)).toFixed(2) + ' MB'
        setUploadFiles((prev) => [
          {
            name: data.data.fileName,
            url: data.data.publicLink,
            size: sizeStr,
          },
          ...prev,
        ])
      } else {
        setUploadError(data.message || 'Upload failed. Please try again.')
      }
    } catch (err) {
      setUploadError('Failed to upload file due to a connection error.')
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  // Fetch current user session on mount
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      const data = await res.json()
      if (data.success && data.data) {
        setUser(data.data)
      } else {
        setUser(null)
      }
    } catch (err) {
      console.error('Auth verification error:', err)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkSession()
  }, [checkSession])

  // Handle Login submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Please fill in both email and password.')
      return
    }
    setError('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: email,
          password,
          serverUrl: serverUrl.trim(),
        }),
      })

      const data = await res.json()

      if (data.success && data.data) {
        setUser(data.data)
      } else {
        setError(data.message || 'Authentication failed. Please check your credentials.')
      }
    } catch (err) {
      setError('Connection error. Could not reach the authentication server.')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Logout
  const handleLogout = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setUser(null)
        setPassword('') // Clear password
        closeBindModal()
      }
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Generate Telegram binding link
  const handleGenerateBindLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bindPassword) {
      setBindError('Please enter your password to confirm linking.')
      return
    }
    setBindError('')
    setBindLoading(true)

    try {
      const res = await fetch('/api/auth/telegram/bind-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: bindPassword }),
      })
      const data = await res.json()

      if (data.success && data.data) {
        setBindData(data.data)
      } else {
        setBindError(data.message || 'Verification failed. Password may be incorrect.')
      }
    } catch (err) {
      setBindError('Failed to connect to server. Please try again.')
      console.error(err)
    } finally {
      setBindLoading(false)
    }
  }

  const closeBindModal = () => {
    setShowBindModal(false)
    setBindPassword('')
    setBindError('')
    setBindData(null)
  }

  const refreshBindStatus = async () => {
    setLoading(true)
    await checkSession()
    closeBindModal()
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#0a0c10] text-zinc-100 font-sans overflow-hidden px-4">
      {/* Decorative Blur Background Circles */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-900/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/20 blur-[120px] pointer-events-none" />

      {/* Main Glassmorphic Container */}
      <main className="relative z-10 w-full max-w-lg transition-all duration-300">
        {loading ? (
          /* Loading State */
          <div className="flex flex-col items-center justify-center space-y-4 py-12">
            <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-zinc-400 text-sm tracking-wide">Syncing session...</p>
          </div>
        ) : user ? (
          /* Logged In Dashboard State */
          <div className="bg-zinc-900/40 backdrop-blur-2xl border border-zinc-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-3xl p-8 md:p-10 transition-all duration-500">
            {/* Header */}
            <div className="flex flex-col items-center text-center pb-6 border-b border-zinc-800/60 mb-6">
              <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Cranemail Cloud Drive</h1>
              <p className="text-sm text-zinc-400 mt-1">Personal Cloud Image Host</p>
            </div>

            {/* Profile Info */}
            <div className="space-y-4">
              <div className="bg-zinc-950/40 rounded-xl p-4 border border-zinc-800/40 flex flex-col space-y-1.5">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Account</span>
                <span className="text-zinc-200 font-medium break-all">{user.emailAddress}</span>
              </div>

              <div className="bg-zinc-950/40 rounded-xl p-4 border border-zinc-800/40 flex flex-col space-y-1.5">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">SmarterMail Server</span>
                <span className="text-blue-400 font-mono text-sm break-all select-all">{user.serverUrl}</span>
              </div>

              {/* Telegram Integration Panel */}
              <div className="bg-zinc-950/40 rounded-xl p-4 border border-zinc-800/40 flex flex-col space-y-3">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Telegram Upload Integration</span>

                {user.isTelegramBound ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-emerald-400 font-medium">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm">Linked Successfully</span>
                    </div>
                    <button
                      onClick={() => setShowBindModal(true)}
                      className="text-xs text-zinc-400 hover:text-zinc-200 underline focus:outline-none"
                    >
                      Re-link Account
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col space-y-3">
                    <div className="flex items-center space-x-2 text-amber-500 font-medium">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="text-sm">Not Linked</span>
                    </div>
                    <button
                      onClick={() => setShowBindModal(true)}
                      className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl text-white font-medium text-sm transition-all shadow-md shadow-blue-500/10 cursor-pointer active:scale-[0.98]"
                    >
                      Link Telegram Bot
                    </button>
                  </div>
                )}
              </div>

              {/* Web Direct Upload Panel */}
              <div className="bg-zinc-950/40 rounded-xl p-4 border border-zinc-800/40 flex flex-col space-y-3">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Web Direct Upload</span>
                
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`relative border-2 border-dashed rounded-xl p-6 transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
                    isDragActive
                      ? 'border-blue-500 bg-blue-500/5'
                      : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/10'
                  }`}
                >
                  <input
                    type="file"
                    id="web-file-input"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={handleFileChange}
                    disabled={uploading}
                  />
                  
                  {uploading ? (
                    <div className="flex flex-col items-center space-y-2">
                      <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                      <span className="text-xs text-zinc-400">Uploading to cloud drive...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center space-y-2">
                      <svg className="w-8 h-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-xs text-zinc-300 font-medium">Drag & drop image here or click to browse</span>
                      <span className="text-[10px] text-zinc-500">Supports JPG, PNG, GIF, WebP up to 10MB</span>
                    </div>
                  )}
                </div>

                {uploadError && (
                  <p className="text-xs text-red-400 mt-1">{uploadError}</p>
                )}

                {/* Uploaded Files History */}
                {uploadFiles.length > 0 && (
                  <div className="mt-2 space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Uploaded Images</p>
                    {uploadFiles.map((file, idx) => (
                      <div key={idx} className="bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between text-xs animate-[fadeIn_0.2s_ease-out]">
                        <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-2">
                          {/\.(jpg|jpeg|png|gif|webp)$/i.test(file.name) ? (
                            <img src={file.url} alt={file.name} className="w-8 h-8 object-cover rounded-md border border-zinc-800 bg-zinc-950 flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 bg-zinc-950 border border-zinc-800 rounded-md flex items-center justify-center flex-shrink-0">
                              <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-zinc-200 font-medium truncate" title={file.name}>{file.name}</p>
                            <p className="text-[10px] text-zinc-500 font-mono">{file.size}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-1 flex-shrink-0 mt-2 sm:mt-0">
                          <a href={file.url} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-zinc-850 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors" title="Open Link">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(file.url)
                              alert('Link copied to clipboard!')
                            }}
                            className="p-1.5 hover:bg-zinc-850 rounded-md text-zinc-400 hover:text-blue-400 transition-colors"
                            title="Copy Direct Link"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="mt-8 w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl border border-zinc-700/80 bg-zinc-800/30 text-zinc-300 font-medium transition-all duration-300 hover:bg-zinc-800/80 hover:text-white active:scale-[0.98] cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        ) : (
          /* Login Card Form State */
          <div className="bg-zinc-900/40 backdrop-blur-2xl border border-zinc-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-3xl p-8 md:p-10 transition-all duration-500">
            {/* Header */}
            <div className="text-center pb-6 border-b border-zinc-800/60 mb-6">
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                Cranemail Image Host
              </h1>
              <p className="text-sm text-zinc-400 mt-2">Sign in with SmarterMail to link cloud drive space</p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-950/30 border border-red-900/50 text-red-400 rounded-xl p-3.5 mb-6 text-sm flex items-start space-x-2.5">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2" htmlFor="email">
                  Email Address / Username
                </label>
                <input
                  id="email"
                  type="text"
                  required
                  placeholder="e.g. user@yourdomain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl py-3 px-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/20 transition-all duration-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl py-3 px-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/20 transition-all duration-300"
                />
              </div>

              {/* Collapsible Advanced Settings */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center space-x-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition-colors focus:outline-none"
                >
                  <svg className={`w-3.5 h-3.5 transform transition-transform duration-300 ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span>Advanced Settings</span>
                </button>

                {showAdvanced && (
                  <div className="mt-3 bg-zinc-950/30 rounded-xl p-4 border border-zinc-800/40 space-y-3 animate-[fadeIn_0.3s_ease-out]">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5" htmlFor="server-url">
                        SmarterMail Server URL
                      </label>
                      <input
                        id="server-url"
                        type="url"
                        placeholder="https://mail.crane.email"
                        value={serverUrl}
                        onChange={(e) => setServerUrl(e.target.value)}
                        className="w-full bg-zinc-950/70 border border-zinc-800/80 rounded-lg py-2 px-3 text-sm font-mono text-blue-300 focus:outline-none focus:border-blue-500/80 transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-6 py-3.5 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-blue-700/50 disabled:to-indigo-700/50 text-white font-medium rounded-xl shadow-lg shadow-blue-500/10 hover:shadow-blue-500/25 disabled:shadow-none transition-all duration-300 flex items-center justify-center space-x-2 active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Verify Credentials</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Glassmorphic Binding Modal Overlay */}
      {showBindModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800/85 rounded-3xl max-w-md w-full p-6 shadow-2xl relative animate-[scaleIn_0.2s_ease-out]">
            {/* Close Button */}
            <button
              onClick={closeBindModal}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors focus:outline-none"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Modal Body */}
            {!bindData ? (
              /* Step 1: Verify Password to generate token */
              <form onSubmit={handleGenerateBindLink} className="space-y-4">
                <div className="text-center pb-2 border-b border-zinc-800/50 mb-4">
                  <h3 className="text-xl font-bold text-white">Link Telegram Bot</h3>
                  <p className="text-xs text-zinc-400 mt-1">Verify your credentials to generate a secure binding token</p>
                </div>

                {bindError && (
                  <div className="bg-red-950/20 border border-red-900/40 text-red-400 rounded-xl p-3 text-xs flex items-start space-x-2">
                    <svg className="w-4.5 h-4.5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{bindError}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider" htmlFor="bind-password">
                    Enter Cranemail Password
                  </label>
                  <input
                    id="bind-password"
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={bindPassword}
                    onChange={(e) => setBindPassword(e.target.value)}
                    className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl py-3 px-4 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500/80 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={bindLoading}
                  className="w-full mt-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl text-sm transition-all flex items-center justify-center space-x-2 active:scale-[0.98] cursor-pointer"
                >
                  {bindLoading ? (
                    <>
                      <span className="w-4.5 h-4.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <span>Generate Binding Token</span>
                  )}
                </button>
              </form>
            ) : (
              /* Step 2: Show link and instruct user */
              <div className="space-y-5 text-center">
                <div className="pb-2 border-b border-zinc-800/50">
                  <h3 className="text-xl font-bold text-white">Temporary Token Generated</h3>
                  <p className="text-xs text-zinc-400 mt-1">Follow the instructions to complete binding</p>
                </div>

                <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-4 text-left text-xs leading-relaxed space-y-2">
                  <p className="text-zinc-300 font-semibold mb-1">How to Link:</p>
                  <div className="flex space-x-2 items-start">
                    <span className="bg-blue-600/30 text-blue-400 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">1</span>
                    <span className="text-zinc-400">Click the button below to launch Telegram and open the Bot.</span>
                  </div>
                  <div className="flex space-x-2 items-start">
                    <span className="bg-blue-600/30 text-blue-400 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">2</span>
                    <span className="text-zinc-400">Click <b>&quot;Start&quot;</b> (or send the generated command starting with `/start`).</span>
                  </div>
                  <div className="flex space-x-2 items-start">
                    <span className="bg-blue-600/30 text-blue-400 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">3</span>
                    <span className="text-zinc-400">Once the Bot confirms success, click the button below to refresh.</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <a
                    href={bindData.bindUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 bg-[#2ea6da] hover:bg-[#2794c4] text-white font-medium rounded-xl text-sm transition-all flex items-center justify-center space-x-2 active:scale-[0.98] shadow-lg shadow-sky-500/10 cursor-pointer"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.11.02-1.93 1.23-5.46 3.62-.51.35-.98.53-1.39.52-.46-.01-1.33-.26-1.98-.48-.8-.27-1.43-.42-1.37-.89.03-.25.38-.51 1.03-.78 4.04-1.76 6.74-2.92 8.1-3.48 3.85-1.6 4.64-1.88 5.17-1.89.11 0 .37.03.54.17.14.12.18.28.2.45-.02.07-.02.16-.03.22z" />
                    </svg>
                    <span>Launch Telegram Bot</span>
                  </a>

                  <button
                    onClick={refreshBindStatus}
                    className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-xl text-sm transition-all flex items-center justify-center space-x-2 border border-zinc-700/60 active:scale-[0.98] cursor-pointer"
                  >
                    <span>I Have Completed Binding</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
