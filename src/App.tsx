import React, { useState, useEffect } from 'react';
import { Terminal } from './components/Terminal';
import { FileExplorer } from './components/FileExplorer';
import { Checklist, Task } from './components/Checklist';
import { getModels, OllamaModel, ChatMessage, chat } from './lib/ollama';
import { getSystemPrompt, parseToolCall, executeTool, ALL_TOOLS } from './lib/agent';
import { verifyPermission, readFile, writeFile } from './lib/fs';
import { get, set } from 'idb-keyval';
import { Settings, X, AlertTriangle, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';

const MEMORY_FILE = '.agent-memory.json';

export default function App() {
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  
  // API Keys state
  const [apiKeys, setApiKeys] = useState<{ openai?: string, anthropic?: string, gemini?: string, deepseek?: string }>(() => {
    const saved = localStorage.getItem('agentApiKeys');
    return saved ? JSON.parse(saved) : {};
  });
  
  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [personality, setPersonality] = useState('expert');
  const [enableThinking, setEnableThinking] = useState(true);
  const [enableInternet, setEnableInternet] = useState(false);
  const [enableReviewer, setEnableReviewer] = useState(false);
  const [enablePromptArchitect, setEnablePromptArchitect] = useState(false);
  const [enableSecurityAuditor, setEnableSecurityAuditor] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>({});

  // New Features State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showExplorer, setShowExplorer] = useState(true);
  const [showChecklist, setShowChecklist] = useState(true);
  const [prefilledInput, setPrefilledInput] = useState('');
  const [fileRefreshTrigger, setFileRefreshTrigger] = useState(0);

  // Confirmation modal state
  const [confirmDialog, setConfirmDialog] = useState<{ message: string, resolve: (value: boolean) => void } | null>(null);

  const askConfirmation = (message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmDialog({ message, resolve });
    });
  };

  useEffect(() => {
    // Initialize system prompt based on settings
    const sysPrompt = getSystemPrompt(personality, enableThinking, enableInternet, customInstructions, enabledTools);
    if (messages.length === 0) {
      setMessages([{ role: 'system', content: sysPrompt }]);
    } else if (messages[0].role === 'system') {
      setMessages(prev => [{ role: 'system', content: sysPrompt }, ...prev.slice(1)]);
    }
  }, [personality, enableThinking, enableInternet, customInstructions, enabledTools]);

  useEffect(() => {
    // Load saved directory handle
    get('projectDirHandle').then(async (handle) => {
      if (handle) {
        try {
          const hasPerm = await verifyPermission(handle, true);
          if (hasPerm) {
            setDirHandle(handle);
            loadMemory(handle);
          }
        } catch (e) {
          console.error("Failed to restore directory handle", e);
        }
      }
    });

    // Fetch models
    fetchModels();
  }, [baseUrl, apiKeys]);

  useEffect(() => {
    localStorage.setItem('agentApiKeys', JSON.stringify(apiKeys));
  }, [apiKeys]);

  const fetchModels = async () => {
    const m = await getModels(baseUrl, apiKeys);
    setModels(m);
    if (m.length > 0 && !selectedModel) {
      setSelectedModel(m[0].name);
    }
  };

  const loadMemory = async (handle: FileSystemDirectoryHandle) => {
    try {
      const content = await readFile(handle, MEMORY_FILE);
      const savedMessages = JSON.parse(content);
      if (Array.isArray(savedMessages) && savedMessages.length > 0) {
        // Ensure system prompt is up to date
        savedMessages[0] = { role: 'system', content: getSystemPrompt(personality, enableThinking, enableInternet, customInstructions, enabledTools) };
        setMessages(savedMessages);
      }
    } catch (e) {
      // Memory file doesn't exist or is invalid, start fresh
      setMessages([{ role: 'system', content: getSystemPrompt(personality, enableThinking, enableInternet, customInstructions, enabledTools) }]);
    }
  };

  const saveMemory = async (handle: FileSystemDirectoryHandle, msgs: ChatMessage[]) => {
    try {
      await writeFile(handle, MEMORY_FILE, JSON.stringify(msgs, null, 2));
    } catch (e) {
      console.error("Failed to save memory", e);
    }
  };

  const handleSelectProject = async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await set('projectDirHandle', handle);
      setDirHandle(handle);
      await loadMemory(handle);
    } catch (e) {
      console.error("User cancelled directory picker", e);
    }
  };

  const handleSendMessage = async (content: string, attachments: any[]) => {
    if (!selectedModel) return;

    let finalContent = content;
    const images: string[] = [];

    for (const att of attachments) {
      if (att.isImage) {
        images.push(att.data);
      } else {
        finalContent += `\n\n<attached_file name="${att.name}">\n${att.data}\n</attached_file>`;
      }
    }

    const userMsg: ChatMessage = { role: 'user', content: finalContent };
    if (images.length > 0) {
      userMsg.images = images;
    }

    let currentMessages: ChatMessage[] = [...messages, userMsg];
    setMessages(currentMessages);
    setIsLoading(true);

    try {
      // Phase 1: Prompt Architect
      if (enablePromptArchitect && finalContent.trim().length > 0 && finalContent.trim().length < 500) {
        setMessages(prev => [...prev, { role: 'system', content: 'Prompt Architect is enhancing your request...' }]);
        const architectPrompt = `You are an expert AI Prompt Engineer. The user wants to ask a coding agent to do the following: "${finalContent}". 
Rewrite this request into a highly detailed, professional prompt. Include best practices, potential edge cases to watch out for, and clear step-by-step instructions. Output ONLY the enhanced prompt, nothing else.`;
        
        const currentModelObj = models.find(m => m.name === selectedModel);
        const provider = currentModelObj?.provider || 'ollama';
        const enhancedInput = await chat(baseUrl, selectedModel, [{ role: 'user', content: architectPrompt }], undefined, provider, apiKeys);
        
        // Remove the "enhancing" message
        setMessages(prev => prev.filter(m => m.content !== 'Prompt Architect is enhancing your request...'));
        
        // Add the enhanced prompt as a system message so the user sees it and the agent reads it
        const enhancedMsg: ChatMessage = { role: 'system', content: `**Prompt Architect Enhanced Request:**\n\n${enhancedInput}` };
        currentMessages = [...currentMessages, enhancedMsg];
        setMessages(currentMessages);
      }

      // Phase 2: Main Agent Loop
      await runAgentLoop(currentMessages);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const runAgentLoop = async (currentMessages: ChatMessage[]) => {
    let loopMessages = [...currentMessages];
    let toolCallCount = 0;
    const MAX_TOOL_CALLS = 10; // Prevent infinite loops
    
    const currentModelObj = models.find(m => m.name === selectedModel);
    const provider = currentModelObj?.provider || 'ollama';
    
    while (toolCallCount < MAX_TOOL_CALLS) {
      // Add a temporary assistant message for streaming
      setMessages([...loopMessages, { role: 'assistant', content: '' }]);
      
      let assistantContent = '';
      await chat(baseUrl, selectedModel, loopMessages, (chunk) => {
        assistantContent += chunk;
        setMessages([...loopMessages, { role: 'assistant', content: assistantContent }]);
      }, provider, apiKeys);

      loopMessages.push({ role: 'assistant', content: assistantContent });
      setMessages([...loopMessages]);
      
      if (dirHandle) {
        saveMemory(dirHandle, loopMessages);
      }

      const toolCall = parseToolCall(assistantContent);
      if (toolCall) {
        toolCallCount++;
        
        let toolResult = '';
        if (toolCall.name === 'error') {
          toolResult = toolCall.error || 'Unknown JSON parse error.';
        } else {
          // Execute tool
          toolResult = await executeTool(
            toolCall.name, 
            toolCall.arguments, 
            dirHandle, 
            askConfirmation,
            (newTasks) => setTasks(newTasks), // Pass checklist update callback
            { baseUrl, model: selectedModel }
          );
          setFileRefreshTrigger(prev => prev + 1);
        }
        
        loopMessages.push({ role: 'tool', content: toolResult });
        setMessages([...loopMessages]);
        
        if (dirHandle) {
          saveMemory(dirHandle, loopMessages);
        }
        // Continue loop to send tool result back to agent
      } else {
        // No tool call, agent is done. Check if Reviewer or Auditor are enabled.
        let needsFix = false;

        if (enableReviewer) {
          setMessages(prev => [...prev, { role: 'system', content: 'Senior Reviewer is analyzing the changes...' }]);
          
          const reviewerPrompt = `You are a Senior Code Reviewer. Review the previous actions and code written by the agent. 
If everything looks secure, performant, and correct, reply ONLY with the exact word "APPROVED". 
If there are issues, explain them clearly so the agent can fix them. Do not write the code yourself, just point out the flaws.`;
          
          const reviewerMessages = [...loopMessages, { role: 'user', content: reviewerPrompt } as ChatMessage];
          const reviewerResponse = await chat(baseUrl, selectedModel, reviewerMessages, undefined, provider, apiKeys);
          
          setMessages(prev => prev.filter(m => m.content !== 'Senior Reviewer is analyzing the changes...'));
          
          if (reviewerResponse.trim() === 'APPROVED') {
            setMessages(prev => [...prev, { role: 'system', content: '✅ Senior Reviewer approved the changes.' }]);
          } else {
            const feedbackMsg: ChatMessage = { 
              role: 'user', 
              content: `[Senior Reviewer Feedback]:\n${reviewerResponse}\n\nPlease fix these issues.` 
            };
            loopMessages.push(feedbackMsg);
            setMessages([...loopMessages]);
            needsFix = true;
          }
        }

        if (!needsFix && enableSecurityAuditor) {
          setMessages(prev => [...prev, { role: 'system', content: 'Security Auditor is scanning for vulnerabilities...' }]);
          
          const securityPrompt = `You are a strict Security Auditor. Review the previous actions and code written by the agent. 
Look for SQL injections, XSS, CSRF, exposed API keys, or insecure logic. 
If the code is completely secure, reply ONLY with the exact word "SECURE". 
If vulnerabilities exist, explain them clearly so the agent can fix them.`;
          
          const securityMessages = [...loopMessages, { role: 'user', content: securityPrompt } as ChatMessage];
          const securityResponse = await chat(baseUrl, selectedModel, securityMessages, undefined, provider, apiKeys);
          
          setMessages(prev => prev.filter(m => m.content !== 'Security Auditor is scanning for vulnerabilities...'));
          
          if (securityResponse.trim() === 'SECURE') {
            setMessages(prev => [...prev, { role: 'system', content: '🛡️ Security Auditor found no vulnerabilities.' }]);
          } else {
            const feedbackMsg: ChatMessage = { 
              role: 'user', 
              content: `[Security Auditor Feedback]:\n${securityResponse}\n\nPlease fix these security vulnerabilities immediately.` 
            };
            loopMessages.push(feedbackMsg);
            setMessages([...loopMessages]);
            needsFix = true;
          }
        }

        if (needsFix) {
          continue; // Loop continues so the agent can fix the issues
        } else {
          break; // Done
        }
      }
    }
    
    if (toolCallCount >= MAX_TOOL_CALLS) {
      setMessages(prev => [...prev, { role: 'system', content: 'Agent reached maximum tool call limit to prevent infinite loops.' }]);
    }
  };

  const handleFileClick = (path: string) => {
    // Append the file path to the chat input or copy to clipboard
    navigator.clipboard.writeText(path);
    // We can also trigger a small toast here if we had one, but for now, 
    // we'll just set it to a state that Terminal can use to prefill.
    setPrefilledInput(prev => prev ? `${prev} ${path}` : path);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0a0a] text-gray-200 font-sans overflow-hidden relative">
      {/* Top Bar for Settings */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1a1a] border-b border-gray-800 text-sm z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowExplorer(!showExplorer)}
            className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-gray-200 transition-colors"
            title="Toggle Explorer"
          >
            {showExplorer ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>

          <span className="text-gray-400">Model:</span>
          <div className="flex items-center gap-2">
            <select 
              value={selectedModel} 
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 focus:outline-none focus:border-green-500"
            >
              {models.map(m => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
            {models.find(m => m.name === selectedModel)?.provider && (
              <span className={`text-xs px-2 py-0.5 rounded border ${
                models.find(m => m.name === selectedModel)?.provider === 'ollama' 
                  ? 'bg-gray-800 text-gray-300 border-gray-700'
                  : 'bg-purple-900/50 text-purple-400 border-purple-700/50'
              }`}>
                {models.find(m => m.name === selectedModel)?.provider?.toUpperCase()}
              </span>
            )}
            {models.find(m => m.name === selectedModel)?.vision && (
              <span className="bg-blue-900/50 text-blue-400 text-xs px-2 py-0.5 rounded border border-blue-700/50">
                Vision Supported
              </span>
            )}
          </div>
          <button onClick={fetchModels} className="text-xs text-green-500 hover:text-green-400">Refresh</button>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowChecklist(!showChecklist)}
            className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-gray-200 transition-colors"
            title="Toggle Mission Status"
          >
            {showChecklist ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-gray-200 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmDialog && (
        <div className="absolute inset-0 bg-black/60 z-[60] flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[#111] border border-gray-800 rounded-lg shadow-2xl w-[400px] max-w-[90vw] overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-[#1a1a1a]">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              <h2 className="font-semibold text-gray-200">Confirm Action</h2>
            </div>
            <div className="p-6">
              <p className="text-gray-300 text-sm">{confirmDialog.message}</p>
            </div>
            <div className="px-4 py-3 border-t border-gray-800 bg-[#1a1a1a] flex justify-end gap-3">
              <button 
                onClick={() => { confirmDialog.resolve(false); setConfirmDialog(null); }}
                className="px-4 py-2 rounded text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => { confirmDialog.resolve(true); setConfirmDialog(null); }}
                className="px-4 py-2 rounded text-sm bg-red-600 text-white hover:bg-red-500 transition-colors"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[#111] border border-gray-800 rounded-lg shadow-2xl w-[450px] max-w-[90vw] max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-[#1a1a1a] flex-shrink-0">
              <h2 className="font-semibold text-gray-200">Agent Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
              {/* Ollama URL */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">Ollama API URL</label>
                <input 
                  type="text" 
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                />
                <p className="text-xs text-gray-500">Ensure Ollama is running with OLLAMA_ORIGINS="*"</p>
              </div>

              {/* Cloud API Keys */}
              <div className="space-y-3 pt-4 border-t border-gray-800">
                <h3 className="text-sm font-semibold text-gray-200">Cloud API Keys (Optional)</h3>
                <p className="text-xs text-gray-500">Add keys to use cloud models alongside local Ollama models.</p>
                
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-400">OpenAI API Key</label>
                  <input 
                    type="password" 
                    value={apiKeys.openai || ''}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, openai: e.target.value }))}
                    placeholder="sk-..."
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-400">Anthropic API Key</label>
                  <input 
                    type="password" 
                    value={apiKeys.anthropic || ''}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, anthropic: e.target.value }))}
                    placeholder="sk-ant-..."
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-400">Google Gemini API Key</label>
                  <input 
                    type="password" 
                    value={apiKeys.gemini || ''}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, gemini: e.target.value }))}
                    placeholder="AIza..."
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-400">DeepSeek API Key</label>
                  <input 
                    type="password" 
                    value={apiKeys.deepseek || ''}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, deepseek: e.target.value }))}
                    placeholder="sk-..."
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                  />
                </div>
              </div>

              {/* Personality */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">Agent Personality</label>
                <select 
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                >
                  <option value="expert">Expert Developer (Direct, Professional)</option>
                  <option value="tutor">Helpful Tutor (Explains concepts step-by-step)</option>
                  <option value="hacker">10x Hacker (Fast, Experimental, Concise)</option>
                </select>
              </div>

              {/* Toggles */}
              <div className="space-y-4 pt-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={enableThinking}
                    onChange={(e) => setEnableThinking(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-700 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900 bg-gray-900"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-300">Enable Thinking Process</div>
                    <div className="text-xs text-gray-500">Allows the agent to reason step-by-step before answering.</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={enableInternet}
                    onChange={(e) => setEnableInternet(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-700 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900 bg-gray-900"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-300">Enable Internet Access</div>
                    <div className="text-xs text-gray-500">Allows the agent to search the web and read URLs to solve problems.</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={enableReviewer}
                    onChange={(e) => setEnableReviewer(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-700 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900 bg-gray-900"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-300">Enable Senior Reviewer</div>
                    <div className="text-xs text-gray-500">A second agent will review and critique code before it's finalized.</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={enablePromptArchitect}
                    onChange={(e) => setEnablePromptArchitect(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-700 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900 bg-gray-900"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-300">Enable Prompt Architect</div>
                    <div className="text-xs text-gray-500">A sub-agent that rewrites your short requests into highly detailed, professional prompts.</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={enableSecurityAuditor}
                    onChange={(e) => setEnableSecurityAuditor(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-700 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900 bg-gray-900"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-300">Enable Security Auditor</div>
                    <div className="text-xs text-gray-500">A specialized sub-agent that checks code for vulnerabilities (XSS, SQLi, etc.) after execution.</div>
                  </div>
                </label>
              </div>

              {/* Tool Toggles */}
              <div className="space-y-2 pt-4 border-t border-gray-800">
                <label className="block text-sm font-medium text-gray-300 mb-2">Agent Tools (Enable/Disable)</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                  {Object.keys(ALL_TOOLS).map(toolKey => (
                    <label key={toolKey} className="flex items-center gap-2 cursor-pointer bg-gray-900 p-2 rounded border border-gray-800 hover:border-gray-700">
                      <input 
                        type="checkbox" 
                        checked={enabledTools[toolKey] !== false} // Default true
                        onChange={(e) => setEnabledTools(prev => ({ ...prev, [toolKey]: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-700 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900 bg-gray-800"
                      />
                      <div className="text-xs font-medium text-gray-300 truncate" title={toolKey}>
                        {toolKey}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Custom Instructions */}
              <div className="space-y-2 pt-4 border-t border-gray-800">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-medium text-gray-300">Custom Instructions (Fr3 Man's Brain)</label>
                  <button 
                    onClick={() => setCustomInstructions("Reguli pentru PHP:\n- Folosește PHP 8+ cu strict_types=1.\n- Folosește PDO pentru interacțiunea cu baza de date, niciodată mysqli.\n- Securitate: previno SQL Injection (prepared statements) și XSS (htmlspecialchars).\n- Folosește un stil de cod curat (PSR-12).\n- Răspunde în limba română.")}
                    className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded border border-gray-700 transition-colors"
                  >
                    Load PHP Preset
                  </button>
                </div>
                <textarea 
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g., Always use Tailwind CSS. Never use var, only let/const. Be extremely polite."
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500 h-24 resize-none"
                />
              </div>
            </div>
            
            <div className="px-4 py-3 border-t border-gray-800 bg-[#1a1a1a] flex justify-end">
              <button 
                onClick={() => setShowSettings(false)}
                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Layout: Sidebar - Chat - Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: File Explorer */}
        {showExplorer && (
          <div className="w-64 border-r border-gray-800 bg-[#111] flex-shrink-0">
            <FileExplorer dirHandle={dirHandle} onFileClick={handleFileClick} refreshTrigger={fileRefreshTrigger} />
          </div>
        )}

        {/* Center: Chat Interface */}
        <div className="flex-1 overflow-hidden">
          <Terminal 
            messages={messages} 
            onSendMessage={handleSendMessage} 
            isLoading={isLoading}
            projectName={dirHandle?.name || null}
            onSelectProject={handleSelectProject}
            prefilledInput={prefilledInput}
            onClearPrefilled={() => setPrefilledInput('')}
          />
        </div>

        {/* Right Sidebar: Mission Checklist */}
        {showChecklist && (
          <div className="w-72 border-l border-gray-800 bg-[#111] flex-shrink-0">
            <Checklist tasks={tasks} />
          </div>
        )}
      </div>
    </div>
  );
}
