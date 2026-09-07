import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Key, 
  ShieldCheck, 
  ExternalLink, 
  Check, 
  AlertCircle, 
  Loader2, 
  Cpu, 
  Sparkles,
  Send,
  MessageSquare,
  Bot,
  User,
  Zap,
  Clock,
  Globe,
  Server
} from 'lucide-react';
import { api } from '../api';

const PRESETS = [
  { label: 'Ollama (Local)', url: 'http://localhost:11434/v1', model: 'llama3.2', hint: 'Runs locally on your machine, 100% private' },
  { label: 'LM Studio (Local)', url: 'http://localhost:1234/v1', model: 'local-model', hint: 'Local inference via LM Studio server' },
  { label: 'OpenAI', url: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hint: 'Official OpenAI GPT-4o-mini' },
  { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat', hint: 'Universal aggregator for all models' },
  { label: 'Groq', url: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', hint: 'Ultra-fast LPU inference' },
  { label: 'NVIDIA NIM', url: 'https://integrate.api.nvidia.com/v1', model: 'nvidia/llama-3.1-nemotron-70b-instruct', hint: 'NVIDIA accelerated microservice' },
];

export default function ApiKeyModal({ isOpen, onClose, onProviderSaved }) {
  const [provider, setProvider] = useState('custom');
  const [nvidiaKey, setNvidiaKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  
  // Custom Endpoint state
  const [customUrl, setCustomUrl] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [customKey, setCustomKey] = useState('');
  
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState(null); // { valid: bool, message: str, error: str }

  // Test chatbox state
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setProvider(localStorage.getItem('cs_provider') || 'custom');
      setNvidiaKey(localStorage.getItem('cs_nvidia_key') || '');
      setGroqKey(localStorage.getItem('cs_groq_key') || '');
      setCustomUrl(localStorage.getItem('cs_custom_url') || 'http://localhost:11434/v1');
      setCustomModel(localStorage.getItem('cs_custom_model') || 'llama3.2');
      setCustomKey(localStorage.getItem('cs_custom_key') || '');
      setTestStatus(null);
      setChatMessages([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (chatMessages.length > 0) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  if (!isOpen) return null;

  const getActiveKey = () => {
    if (provider === 'custom') return customKey.trim();
    if (provider === 'nemotron') return nvidiaKey.trim();
    return groqKey.trim();
  };

  const applyPreset = (preset) => {
    setCustomUrl(preset.url);
    setCustomModel(preset.model);
    setTestStatus(null);
  };

  const handleSave = () => {
    localStorage.setItem('cs_provider', provider);
    localStorage.setItem('cs_nvidia_key', nvidiaKey.trim());
    localStorage.setItem('cs_groq_key', groqKey.trim());
    localStorage.setItem('cs_custom_url', customUrl.trim());
    localStorage.setItem('cs_custom_model', customModel.trim());
    localStorage.setItem('cs_custom_key', customKey.trim());
    onProviderSaved(provider);
    onClose();
  };

  const handleTestKey = async () => {
    setTesting(true);
    setTestStatus(null);
    try {
      let res;
      if (provider === 'custom') {
        res = await api.testApiKey('custom', customKey.trim(), customUrl.trim(), customModel.trim());
      } else {
        const activeKey = getActiveKey();
        res = await api.testApiKey(provider, activeKey);
      }
      setTestStatus(res);
    } catch (err) {
      setTestStatus({ valid: false, error: err.message || 'Verification failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSendTestChat = async (messageToSend = null) => {
    const text = (messageToSend !== null ? messageToSend : chatInput).trim();
    if (!text || chatSending) return;

    if (provider === 'custom') {
      if (!customUrl.trim() || !customModel.trim()) {
        setChatMessages(prev => [
          ...prev,
          { role: 'user', content: text },
          { role: 'error', content: 'Please provide both the Endpoint URL and Model Name above before testing.' }
        ]);
        setChatInput('');
        return;
      }
    } else if (provider !== 'mock') {
      const activeKey = getActiveKey();
      if (!activeKey) {
        setChatMessages(prev => [
          ...prev,
          { role: 'user', content: text },
          { role: 'error', content: `Please enter your ${provider.toUpperCase()} API key above first to test live chat.` }
        ]);
        setChatInput('');
        return;
      }
    }

    const newMessages = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(newMessages);
    setChatInput('');
    setChatSending(true);

    try {
      let res;
      if (provider === 'custom') {
        res = await api.testChat('custom', customKey.trim(), text, customUrl.trim(), customModel.trim());
      } else {
        res = await api.testChat(provider, getActiveKey(), text);
      }

      if (res.success) {
        setChatMessages(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: res.reply, 
            latency: res.latency_ms,
            provider: provider === 'custom' ? (customModel || 'custom') : res.provider 
          }
        ]);
      } else {
        setChatMessages(prev => [
          ...prev,
          { 
            role: 'error', 
            content: res.error || 'Request failed without specific error message.',
            latency: res.latency_ms,
            provider: provider === 'custom' ? (customModel || 'custom') : res.provider
          }
        ]);
      }
    } catch (err) {
      setChatMessages(prev => [
        ...prev,
        { role: 'error', content: `Network error: ${err.message || 'Could not reach server'}` }
      ]);
    } finally {
      setChatSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm animate-[fadeIn_0.15s_ease]">
      <div className="w-full max-w-xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col transition-colors">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-outfit font-bold text-lg text-slate-900 dark:text-slate-100">
                Connect Intelligence Model
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
                Run any local or cloud LLM using OpenAI-compatible endpoints
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          
          {/* Provider Selection Tabs */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Select Provider Mode
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => { setProvider('custom'); setTestStatus(null); }}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  provider === 'custom'
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                }`}
              >
                <div className="font-outfit font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Custom LLM</span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Any URL & Model</div>
              </button>

              <button
                type="button"
                onClick={() => { setProvider('nemotron'); setTestStatus(null); }}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  provider === 'nemotron'
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                }`}
              >
                <div className="font-outfit font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Nemotron</span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">NVIDIA NIM</div>
              </button>

              <button
                type="button"
                onClick={() => { setProvider('groq'); setTestStatus(null); }}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  provider === 'groq'
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                }`}
              >
                <div className="font-outfit font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Groq</span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Ultra-Fast LPU</div>
              </button>

              <button
                type="button"
                onClick={() => { setProvider('mock'); setTestStatus(null); }}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  provider === 'mock'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                }`}
              >
                <div className="font-outfit font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Offline Demo</span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">No Key Needed</div>
              </button>
            </div>
          </div>

          {/* CUSTOM ANY LLM CONFIGURATION */}
          {provider === 'custom' && (
            <div className="space-y-3.5 p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
              
              {/* Quick Presets */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-500" />
                    <span>Quick Fill Presets:</span>
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Click to autofill URL & Model</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 text-slate-700 dark:text-slate-200 transition-all cursor-pointer shadow-xs"
                      title={p.hint}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Endpoint Base URL */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    API Endpoint / Base URL
                  </label>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                    Must support /v1/chat/completions
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. http://localhost:11434/v1 or https://api.openai.com/v1"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-xs font-mono text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Model Identifier */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Model Identifier / Name
                  </label>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    Exact model tag recognized by endpoint
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. llama3.2, gpt-4o-mini, deepseek/deepseek-chat"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-xs font-mono text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* API Key */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    API Key
                  </label>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">
                    Optional for local Ollama / LM Studio
                  </span>
                </div>
                <input
                  type="password"
                  placeholder="sk-... or blank for local servers"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-xs font-mono text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

            </div>
          )}

          {/* NEMOTRON CONFIGURATION */}
          {provider === 'nemotron' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-slate-700 dark:text-slate-300">NVIDIA API Key (nvapi-...)</label>
                <a 
                  href="https://build.nvidia.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-1"
                >
                  <span>Get free key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                type="password"
                placeholder="nvapi-xxxxxxxxxxxxxxxxxxxxxxxx"
                value={nvidiaKey}
                onChange={(e) => setNvidiaKey(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Connects to NVIDIA NIM using Llama 3.1 Nemotron 70B Instruct.
              </p>
            </div>
          )}

          {/* GROQ CONFIGURATION */}
          {provider === 'groq' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-slate-700 dark:text-slate-300">Groq API Key (gsk_...)</label>
                <a 
                  href="https://console.groq.com/keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium flex items-center gap-1"
                >
                  <span>Get free key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                type="password"
                placeholder="gsk_xxxxxxxxxxxxxxxxxxxxxxxx"
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Sub-second inference responses on Groq LPUs with OpenAI GPT-OSS 20B / 120B.
              </p>
            </div>
          )}

          {/* MOCK CONFIGURATION */}
          {provider === 'mock' && (
            <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
              <div className="font-semibold">Offline Demo Sandbox Active</div>
              <p className="text-emerald-800 dark:text-emerald-300">
                Offline mock responses are enabled. You can explain anomalies, generate cleaning code, run sandbox previews, and test the ledger without any API key or internet access.
              </p>
            </div>
          )}

          {/* Test Status Indicator */}
          {testStatus && (
            <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              testStatus.valid 
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' 
                : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
            }`}>
              {testStatus.valid ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />}
              <span className="leading-snug">{testStatus.valid ? (testStatus.message || 'Key verified successfully!') : (testStatus.error || 'Connection failed.')}</span>
            </div>
          )}

          {/* INTERACTIVE TEST CHATBOX */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Live Model Test Chatbox
                </span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                Test connectivity & model latency
              </span>
            </div>

            {/* Chat Message Box */}
            <div className="min-h-[100px] max-h-[150px] overflow-y-auto space-y-2.5 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs">
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 dark:text-slate-500 py-3">
                  <Bot className="w-5 h-5 mb-1.5 opacity-60 text-blue-500" />
                  <p className="text-[11px]">Send a quick message to test your model's reply and response latency.</p>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    {msg.role === 'user' ? (
                      <div className="max-w-[85%] px-3 py-1.5 rounded-xl bg-blue-600 text-white rounded-br-xs font-medium">
                        {msg.content}
                      </div>
                    ) : msg.role === 'assistant' ? (
                      <div className="max-w-[90%] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-xs border border-slate-200/80 dark:border-slate-700 space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                          <span className="font-bold text-blue-600 dark:text-blue-400 uppercase">{msg.provider || provider}</span>
                          {msg.latency !== undefined && (
                            <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                              <Zap className="w-2.5 h-2.5" />
                              <span>{msg.latency}ms</span>
                            </span>
                          )}
                        </div>
                        <p className="font-sans leading-relaxed">{msg.content}</p>
                      </div>
                    ) : (
                      <div className="max-w-[90%] px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900 rounded-bl-xs space-y-1">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                          <AlertCircle className="w-3 h-3" />
                          <span>Error ({msg.provider || provider})</span>
                          {msg.latency !== undefined && <span className="font-normal font-mono">• {msg.latency}ms</span>}
                        </div>
                        <p className="text-[11px] leading-relaxed">{msg.content}</p>
                      </div>
                    )}
                  </div>
                ))
              )}

              {chatSending && (
                <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                  <span className="text-[11px]">Connecting to {provider === 'custom' ? (customModel || 'model') : provider}...</span>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Quick Action Chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Quick test:</span>
              {['hi', 'Are you online?', 'Test latency'].map((promptText) => (
                <button
                  key={promptText}
                  type="button"
                  onClick={() => handleSendTestChat(promptText)}
                  disabled={chatSending}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer disabled:opacity-50"
                >
                  "{promptText}"
                </button>
              ))}
            </div>

            {/* Chat Input Field */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Type 'hi' to test API..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendTestChat();
                  }
                }}
                disabled={chatSending}
                className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => handleSendTestChat()}
                disabled={chatSending || !chatInput.trim()}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1 transition-all disabled:opacity-40 cursor-pointer shadow-sm"
              >
                {chatSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Send</span>
              </button>
            </div>
          </div>

          {/* Security reassurance micro-copy */}
          <div className="flex items-start gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500">
            <ShieldCheck className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5" />
            <span>
              Your credentials are saved directly in your browser's local storage. They are never sent to third-party databases and are only used for your session.
            </span>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
          {provider !== 'mock' ? (
            <button
              type="button"
              onClick={handleTestKey}
              disabled={testing || (provider === 'custom' ? (!customUrl.trim() || !customModel.trim()) : (provider === 'nemotron' ? !nvidiaKey : !groqKey))}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-all disabled:opacity-50 cursor-pointer"
            >
              {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Test Connection</span>
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-sm transition-all cursor-pointer"
            >
              Save Configuration
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
