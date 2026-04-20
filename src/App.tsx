import React, { useState, useEffect, useRef } from 'react';
import { Terminal } from './components/Terminal';
import { FileExplorer } from './components/FileExplorer';
import { Checklist, Task } from './components/Checklist';
import { getModels, OllamaModel, ChatMessage, chat } from './lib/ollama';
import { getSystemPrompt, parseToolCall, executeTool, ALL_TOOLS } from './lib/agent';
import { verifyPermission, readFile, writeFile } from './lib/fs';
import { get, set } from 'idb-keyval';
import { Settings, X, AlertTriangle, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Heart, CreditCard, Download, Upload } from 'lucide-react';

const MEMORY_FILE = '.agent-memory.json';

export default function App() {
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  
  // API Keys state
  const [apiKeys, setApiKeys] = useState<{ openai?: string, anthropic?: string, gemini?: string, deepseek?: string, lmstudioUrl?: string }>(() => {
    const saved = localStorage.getItem('agentApiKeys');
    return saved ? JSON.parse(saved) : { lmstudioUrl: 'http://localhost:1234/v1' };
  });
  
  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [personality, setPersonality] = useState('expert');
  const [enableThinking, setEnableThinking] = useState(true);
  const [enableInternet, setEnableInternet] = useState(false);
  const [enableReviewer, setEnableReviewer] = useState(false);
  const [enablePromptArchitect, setEnablePromptArchitect] = useState(false);
  const [promptArchitectMaxWords, setPromptArchitectMaxWords] = useState(200);
  const [ollamaContextLength, setOllamaContextLength] = useState(0);
  const [enableSecurityAuditor, setEnableSecurityAuditor] = useState(false);
  const [enableToolVerifier, setEnableToolVerifier] = useState(false);
  const [enableBoardOfAgents, setEnableBoardOfAgents] = useState(false);
  const [enableAutoTests, setEnableAutoTests] = useState(false);
  const [enableAutoHealer, setEnableAutoHealer] = useState(true);
  const [enableSmartPackager, setEnableSmartPackager] = useState(true);
  const [enableAutoCommiter, setEnableAutoCommiter] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>({});

  // New Features State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showExplorer, setShowExplorer] = useState(true);
  const [showChecklist, setShowChecklist] = useState(true);
  const [prefilledInput, setPrefilledInput] = useState('');
  const [fileRefreshTrigger, setFileRefreshTrigger] = useState(0);

  // Stop generation ref
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setMessages(prev => [...prev, { role: 'system', content: '🛑 Generation manually stopped.' }]);
    }
  };

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

  const exportSettings = () => {
    const settings = {
      apiKeys,
      baseUrl,
      ollamaContextLength,
      personality,
      enableThinking,
      enableInternet,
      enableReviewer,
      enablePromptArchitect,
      promptArchitectMaxWords,
      enableSecurityAuditor,
      enableToolVerifier,
      enableBoardOfAgents,
      enableAutoTests,
      enableAutoHealer,
      enableSmartPackager,
      enableAutoCommiter,
      customInstructions
    };
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fr3man_settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const settings = JSON.parse(event.target?.result as string);
          if (settings.apiKeys !== undefined) setApiKeys(settings.apiKeys);
          if (settings.baseUrl !== undefined) setBaseUrl(settings.baseUrl);
          if (settings.ollamaContextLength !== undefined) setOllamaContextLength(settings.ollamaContextLength);
          if (settings.personality !== undefined) setPersonality(settings.personality);
          if (settings.enableThinking !== undefined) setEnableThinking(settings.enableThinking);
          if (settings.enableInternet !== undefined) setEnableInternet(settings.enableInternet);
          if (settings.enableReviewer !== undefined) setEnableReviewer(settings.enableReviewer);
          if (settings.enablePromptArchitect !== undefined) setEnablePromptArchitect(settings.enablePromptArchitect);
          if (settings.promptArchitectMaxWords !== undefined) setPromptArchitectMaxWords(settings.promptArchitectMaxWords);
          if (settings.enableSecurityAuditor !== undefined) setEnableSecurityAuditor(settings.enableSecurityAuditor);
          if (settings.enableToolVerifier !== undefined) setEnableToolVerifier(settings.enableToolVerifier);
          if (settings.enableBoardOfAgents !== undefined) setEnableBoardOfAgents(settings.enableBoardOfAgents);
          if (settings.enableAutoTests !== undefined) setEnableAutoTests(settings.enableAutoTests);
          if (settings.enableAutoHealer !== undefined) setEnableAutoHealer(settings.enableAutoHealer);
          if (settings.enableSmartPackager !== undefined) setEnableSmartPackager(settings.enableSmartPackager);
          if (settings.enableAutoCommiter !== undefined) setEnableAutoCommiter(settings.enableAutoCommiter);
          if (settings.customInstructions !== undefined) setCustomInstructions(settings.customInstructions);
          alert("Settings imported successfully!");
        } catch (err) {
          alert("Invalid settings file!");
        }
      };
      reader.readAsText(file);
    };
    input.click();
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

    if (prefilledInput) {
      finalContent = `${prefilledInput}\n\n${finalContent}`;
      setPrefilledInput('');
    }

    // Auto-Healer Hook
    if (enableAutoHealer && (finalContent.includes('Uncaught') || finalContent.includes('Error:') || /at .*:\d+:\d+/.test(finalContent) || finalContent.includes('Stack trace:'))) {
        finalContent = `CRASH AUTO-HEALER INITIATED:\nI received the following crash/error log from the console/browser:\n\n${finalContent}\n\nPlease immediately diagnose this error. Read the relevant files mentioned in the logs, pinpoint the issue, and apply a fix immediately.`;
    }

    const userMsg: ChatMessage = { role: 'user', content: finalContent };
    if (images.length > 0) {
      userMsg.images = images;
    }

    let currentMessages: ChatMessage[] = [...messages, userMsg];
    setMessages(currentMessages);
    setIsLoading(true);

    try {
      const currentModelObj = models.find(m => m.name === selectedModel);
      const provider = currentModelObj?.provider || 'ollama';

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      // Capture active sub-agents for this run
      let runArchitect = enablePromptArchitect && !enableBoardOfAgents;
      let runReviewer = enableReviewer && !enableBoardOfAgents;
      let runSecurity = enableSecurityAuditor && !enableBoardOfAgents;
      let runVerifier = enableToolVerifier && !enableBoardOfAgents;
      let runQA = enableAutoTests && !enableBoardOfAgents;
      let runCommiter = enableAutoCommiter && !enableBoardOfAgents;
      // Smart Packager and Healer run globally if toggled, they don't get fully overridden, but BOA can optimize.

      if (enableBoardOfAgents) {
        setMessages(prev => [...prev, { role: 'system', content: '🏛️ Board of Agents is analyzing the request to delegate tasks...' }]);
        const boaPrompt = `You are the Director of the Board of Agents. Your job is to analyze the user's request and strategically activate specialized sub-agents to assist.
User Request: "${finalContent}"

Available Sub-Agents & Activation Criteria:
1. "architect": Activate ONLY if the request is vague, high-level, or asks to build a complete feature from scratch without providing details. DO NOT activate for targeted bug fixes or simple questions.
2. "reviewer": Activate ONLY if the request involves generating complex code, core algorithms, or significant refactoring.
3. "security": Activate ONLY if the request involves authentication, database rules, file access, forms, input validation, or sensitive user data. 
4. "toolVerifier": Activate ONLY for massive multi-file refactors where optimal tool usage is critical.
5. "qa": Activate ONLY if the request involves writing new core business logic, backend routes, or complex utility functions that require unit testing. Do NOT activate for simple UI tweaks.
6. "commiter": Activate ANYTIME the request will likely result in the agent modifying, creating, or deleting files in the codebase. Do NOT activate for informational queries.

You must reply ONLY with a valid JSON object matching this exact schema:
{
  "reasoning": "Brief explanation of why you selected the specific agents based on the criteria.",
  "selected_agents": ["array", "of", "agent_names"]
}
If no agents are needed, return an empty array for selected_agents.`;
        
        try {
          const boaResponse = await chat(baseUrl, selectedModel, [{role: 'system', content: boaPrompt}], undefined, provider, apiKeys, signal);
          
          // Extract JSON robustly
          let jsonStr = boaResponse;
          const jsonMatch = boaResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonStr = jsonMatch[0];
          }
          const cleanedJson = jsonStr.replace(/```json/gi, '').replace(/```/gi, '').trim();
          const parsed = JSON.parse(cleanedJson);
          const selectedAgents = Array.isArray(parsed.selectedAgents) ? parsed.selectedAgents : (Array.isArray(parsed.selected_agents) ? parsed.selected_agents : []);
          
          runArchitect = selectedAgents.includes('architect');
          runReviewer = selectedAgents.includes('reviewer');
          runSecurity = selectedAgents.includes('security');
          runVerifier = selectedAgents.includes('toolVerifier');
          runQA = selectedAgents.includes('qa');
          runCommiter = selectedAgents.includes('commiter');
          
          setMessages(prev => prev.filter(m => !m.content.includes('Board of Agents is analyzing')));
          
          if (selectedAgents.length > 0) {
            setMessages(prev => [...prev, { role: 'system', content: `🏛️ Board delegated to: **${selectedAgents.join(', ')}**\n*Reasoning:* ${parsed.reasoning || 'Optimizing workflow.'}` }]);
          } else {
            setMessages(prev => [...prev, { role: 'system', content: `🏛️ Board decided no sub-agents are needed for this task.` }]);
          }
        } catch(e: any) {
          if (e.name === 'AbortError') throw e;
          console.warn("BOA JSON parse failed, bypassing Board delegation.", e);
          setMessages(prev => prev.filter(m => !m.content.includes('Board of Agents is analyzing')));
        }
      }

      // Phase 1: Prompt Architect
      if (runArchitect && finalContent.trim().length > 0) {
        setMessages(prev => [...prev, { role: 'system', content: 'Prompt Architect is enhancing your request...' }]);
        const fullArchitectPrompt = `You are an expert AI Prompt Engineer. The user wants to ask a coding agent to do the following: "${finalContent}". 
Rewrite this request into a highly detailed, professional prompt. Include best practices, potential edge cases to watch out for, and clear step-by-step instructions. 
CRITICAL: Do NOT exceed ${promptArchitectMaxWords} words in your final output so the agent doesn't get overwhelmed. Output ONLY the enhanced prompt, nothing else.`;
        
        const enhancedInput = await chat(baseUrl, selectedModel, [{ role: 'user', content: fullArchitectPrompt }], undefined, provider, apiKeys, signal, ollamaContextLength);
        
        setMessages(prev => prev.filter(m => m.content !== 'Prompt Architect is enhancing your request...'));
        const enhancedMsg: ChatMessage = { role: 'system', content: `**Prompt Architect Enhanced Request:**\n\n${enhancedInput}` };
        currentMessages = [...currentMessages, enhancedMsg];
        setMessages(currentMessages);
      }

      // Phase 2: Main Agent Loop
      const runFlags = { runReviewer, runSecurity, runVerifier, runQA, runCommiter };
      await runAgentLoop(currentMessages, runFlags, provider as any, signal, ollamaContextLength);
    } catch (e: any) {
      if (e.name === 'AbortError') {
         console.log('Main loop aborted by user');
         // We handle UI feedback in handleStopGeneration
      } else {
         setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const runAgentLoop = async (currentMessages: ChatMessage[], runFlags: { runReviewer: boolean, runSecurity: boolean, runVerifier: boolean, runQA: boolean, runCommiter: boolean }, provider: 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'lmstudio', signal: AbortSignal, ollamaContextLength: number) => {
    let loopMessages = [...currentMessages];
    let toolCallCount = 0;
    const MAX_TOOL_CALLS = 10; // Prevent infinite loops
    let filesModified = false;
    
    while (toolCallCount < MAX_TOOL_CALLS) {
      if (signal.aborted) throw new Error('AbortError');
      
      // Add a temporary assistant message for streaming
      setMessages([...loopMessages, { role: 'assistant', content: '' }]);
      
      let assistantContent = '';
      await chat(baseUrl, selectedModel, loopMessages, (chunk) => {
        assistantContent += chunk;
        setMessages([...loopMessages, { role: 'assistant', content: assistantContent }]);
      }, provider, apiKeys, signal, ollamaContextLength);

      loopMessages.push({ role: 'assistant', content: assistantContent });
      setMessages([...loopMessages]);
      
      if (dirHandle) {
        saveMemory(dirHandle, loopMessages);
      }

      if (signal.aborted) throw new Error('AbortError');

      const toolCall = parseToolCall(assistantContent);
      if (toolCall) {
        toolCallCount++;
        
        let toolResult = '';
        if (toolCall.name === 'error') {
          toolResult = toolCall.error || 'Unknown JSON parse error.';
        } else {
          // Check if file modification occurred
          if (['write_file', 'write_batch_files', 'edit_file_by_lines', 'find_and_replace_in_file', 'insert_at_line', 'delete', 'create_dir'].includes(toolCall.name)) {
            filesModified = true;
          }

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

        if (runFlags.runReviewer) {
          setMessages(prev => [...prev, { role: 'system', content: 'Senior Reviewer is analyzing the changes...' }]);
          
          const reviewerPrompt = `You are a Senior Code Reviewer. Review the previous actions and code written by the agent. 
If everything looks secure, performant, and correct, reply ONLY with the exact word "APPROVED". 
If there are issues, explain them clearly so the agent can fix them. Do not write the code yourself, just point out the flaws.`;
          
          const reviewerMessages = [...loopMessages, { role: 'user', content: reviewerPrompt } as ChatMessage];
          const reviewerResponse = await chat(baseUrl, selectedModel, reviewerMessages, undefined, provider, apiKeys, signal, ollamaContextLength);
          
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

        if (!needsFix && runFlags.runSecurity) {
          setMessages(prev => [...prev, { role: 'system', content: 'Security Auditor is scanning for vulnerabilities...' }]);
          
          const securityPrompt = `You are a strict Security Auditor. Review the previous actions and code written by the agent. 
Look for SQL injections, XSS, CSRF, exposed API keys, or insecure logic. 
If the code is completely secure, reply ONLY with the exact word "SECURE". 
If vulnerabilities exist, explain them clearly so the agent can fix them.`;
          
          const securityMessages = [...loopMessages, { role: 'user', content: securityPrompt } as ChatMessage];
          const securityResponse = await chat(baseUrl, selectedModel, securityMessages, undefined, provider, apiKeys, signal, ollamaContextLength);
          
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

        if (!needsFix && runFlags.runVerifier) {
          setMessages(prev => [...prev, { role: 'system', content: 'Tool Inspector is verifying correct API usage...' }]);
          
          const verifierPrompt = `You are a strict Tool Usage Inspector. Review the previous actions and tools used by the primary agent.
Did the agent use tools optimally and safely? For example: using 'edit_file_by_lines' or 'insert_code' instead of 'write_file' for small changes in large files, avoiding redundant reads, and properly formatting tool JSON.
If tool usage is optimal and correct, reply ONLY with the exact word "OPTIMAL".
If the tools were used inefficiently, used dangerously, or hallucinated, explain the flaws strictly so the agent can learn and fix them using better tool selections.`;
          
          const verifierMessages = [...loopMessages, { role: 'user', content: verifierPrompt } as ChatMessage];
          const verifierResponse = await chat(baseUrl, selectedModel, verifierMessages, undefined, provider, apiKeys, signal, ollamaContextLength);
          
          setMessages(prev => prev.filter(m => m.content !== 'Tool Inspector is verifying correct API usage...'));
          
          if (verifierResponse.trim() === 'OPTIMAL') {
            setMessages(prev => [...prev, { role: 'system', content: '🔧 Tool Inspector found no efficiency issues.' }]);
          } else {
            const feedbackMsg: ChatMessage = { 
              role: 'user', 
              content: `[Tool Inspector Feedback]:\n${verifierResponse}\n\nPlease redo your action using the correct and optimal tools.` 
            };
            loopMessages.push(feedbackMsg);
            setMessages([...loopMessages]);
            needsFix = true;
          }
        }

        if (needsFix) {
          continue; // Loop continues so the agent can fix the issues
        } else {
          // End of loop processing (QA, Packager, Commiter)
          if (filesModified && runFlags.runQA) {
            setMessages(prev => [...prev, { role: 'system', content: '🧪 QA Automator is generating unit tests...' }]);
            const qaPrompt = `You are a QA Automator. Review the files just modified in this session. 
Write automated unit tests (.test.js or .test.tsx) for the new or modified logic. Generate the tool calls to save these test files now.`;
            loopMessages.push({ role: 'user', content: qaPrompt });
            setMessages([...loopMessages]);
            continue; // Spin the agent loop one more time to write tests
          }

          if (enableSmartPackager && filesModified) {
            try {
              const packagerPrompt = `Review the code changes made. Are there any new third-party npm packages imported that might need installation? Reply ONLY with space-separated package names, or "NONE" if dependencies are standard or already exist.`;
              const pkgResponse = await chat(baseUrl, selectedModel, [...loopMessages, { role: 'user', content: packagerPrompt }], undefined, provider, apiKeys, signal, ollamaContextLength);
              const pkgs = pkgResponse.trim();
              if (pkgs !== 'NONE' && pkgs.length > 0 && !pkgs.includes(' ')) { // Basic sanity check
                 setMessages(prev => [...prev, { role: 'system', content: `📦 Smart Packager detected missing imports. You may need to run:\n\n\`npm install ${pkgs}\`` }]);
              }
            } catch (e) {
              // Ignore packager failure non-intrusively
            }
          }

          if (runFlags.runCommiter && filesModified) {
            try {
              const commiterPrompt = `Write a clean, concise 'git commit -m' message summarizing the changes just made in this session. Reply ONLY with the git command.`;
              const commitResponse = await chat(baseUrl, selectedModel, [...loopMessages, { role: 'user', content: commiterPrompt }], undefined, provider, apiKeys, signal, ollamaContextLength);
              setMessages(prev => [...prev, { role: 'system', content: `📝 Auto-Commiter suggests:\n\n\`${commitResponse.trim()}\`` }]);
            } catch (e) {
              // Ignore commiter failure
            }
          }

          break; // Done with all fixes and automations
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
          {/* Donation Buttons */}
          <div className="flex items-center gap-2 mr-4 border-r border-gray-800 pr-4 hidden sm:flex">
            <a 
              href="https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=white_angel_andrey@yahoo.com&currency_code=USD" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1 bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700/50 rounded-full text-blue-400 hover:text-blue-300 transition-colors text-xs font-medium"
            >
              <Heart className="w-3 h-3" />
              <span>PayPal</span>
            </a>
            <a 
              href="https://revolut.me/andreicc" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1 bg-pink-900/40 hover:bg-pink-800/60 border border-pink-700/50 rounded-full text-pink-400 hover:text-pink-300 transition-colors text-xs font-medium"
            >
              <CreditCard className="w-3 h-3" />
              <span>Revolut</span>
            </a>
          </div>

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
              <div className="space-y-4">
                {/* Local API URLs */}
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

                <div className="space-y-2 pt-2">
                  <label className="block text-sm font-medium text-gray-300">Ollama Auth Token (Optional)</label>
                  <input 
                    type="password" 
                    value={apiKeys.ollama || ''}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, ollama: e.target.value }))}
                    placeholder="Bearer token if hosted remote"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <label className="block text-sm font-medium text-gray-300">Ollama Context Length (num_ctx)</label>
                  <input 
                    type="number" 
                    value={ollamaContextLength}
                    onChange={(e) => setOllamaContextLength(Number(e.target.value))}
                    placeholder="0 = Server Default (e.g. 8k or 32k)"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                  />
                  <p className="text-xs text-gray-500">Leave at 0 to use server default. Cloud models might reject custom overrides.</p>
                </div>

                <div className="space-y-2 pt-2 border-t border-gray-800">
                  <label className="block text-sm font-medium text-gray-300 mt-2">LM Studio API URL</label>
                  <input 
                    type="text" 
                    value={apiKeys.lmstudioUrl || ''}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, lmstudioUrl: e.target.value }))}
                    placeholder="http://localhost:1234/v1"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                  />
                  <p className="text-xs text-gray-500">Make sure local server is turned ON in LM Studio.</p>
                </div>
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
                
                <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={enableBoardOfAgents}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setEnableBoardOfAgents(val);
                        if (val) {
                          setEnablePromptArchitect(false);
                          setEnableReviewer(false);
                          setEnableSecurityAuditor(false);
                          setEnableToolVerifier(false);
                          setEnableAutoTests(false);
                          setEnableAutoCommiter(false);
                        }
                      }}
                      className="w-4 h-4 rounded border-gray-700 text-red-500 focus:ring-red-500 focus:ring-offset-gray-900 bg-gray-900"
                    />
                    <div>
                      <div className="text-sm font-bold text-red-400">Board of Agents (Master Orchestrator)</div>
                      <div className="text-xs text-gray-400">Dynamically analyzes your request and enables specific sub-agents ONLY when needed. (Overrides manual toggles below).</div>
                    </div>
                  </label>
                </div>

                <div className={`space-y-4 pl-2 ${enableBoardOfAgents ? 'opacity-50 pointer-events-none' : ''}`}>
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

                  <div>
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
                    {enablePromptArchitect && !enableBoardOfAgents && (
                      <div className="ml-7 mt-2 flex items-center gap-2">
                        <span className="text-xs text-gray-400">Max word length:</span>
                        <input 
                          type="number" 
                          value={promptArchitectMaxWords}
                          onChange={(e) => setPromptArchitectMaxWords(Number(e.target.value))}
                          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white w-20 focus:outline-none focus:border-green-500"
                        />
                      </div>
                    )}
                  </div>

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

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={enableToolVerifier}
                      onChange={(e) => setEnableToolVerifier(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-700 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900 bg-gray-900"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-300">Enable Tool Usage Inspector</div>
                      <div className="text-xs text-gray-500">A sub-agent that verifies if the primary agent used files and tools optimally.</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={enableAutoTests}
                      onChange={(e) => setEnableAutoTests(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-700 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900 bg-gray-900"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-300">Enable QA Automator (Tests)</div>
                      <div className="text-xs text-gray-500">Automatically writes unit tests (.test.tsx) for any new code logic the agent creates.</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={enableAutoCommiter}
                      onChange={(e) => setEnableAutoCommiter(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-700 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900 bg-gray-900"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-300">Enable Auto-Commiter (Git)</div>
                      <div className="text-xs text-gray-500">Synthesizes a clean git commit message immediately after modifications.</div>
                    </div>
                  </label>
                </div>

                {/* Independent Global Automations */}
                <div className="space-y-4 pt-4 border-t border-gray-800">
                  <label className="block text-sm font-medium text-gray-300">Global Event Automations</label>
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={enableAutoHealer}
                      onChange={(e) => setEnableAutoHealer(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-700 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900 bg-gray-900"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-300">Crash Auto-Healer</div>
                      <div className="text-xs text-gray-500">When you paste errors or stack traces, format them into an urgent debugging mission automatically.</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={enableSmartPackager}
                      onChange={(e) => setEnableSmartPackager(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-700 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900 bg-gray-900"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-300">Smart Package Manager</div>
                      <div className="text-xs text-gray-500">Monitors code output and prompts you to install detected missing npm packages.</div>
                    </div>
                  </label>
                </div>
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
                    onClick={() => setCustomInstructions("1. Tool Efficiency: ALWAYS prioritize 'edit_file_by_lines' or 'insert_code' for small updates. Save 'write_file' ONLY for creating entirely new files.\n2. Context First: Use 'read_file_with_lines' before any modification to ensure you target the precise lines.\n3. Brevity & Execution: Do not babble or use filler words. Go straight to the point and execute the tools immediately.\n4. Syntax Verification: Check syntax using 'check_syntax_integrity' if making complex logic modifications.\n5. Batching: Use 'write_batch_files' if scaffolding multiple files simultaneously to save operations.")}
                    className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded border border-gray-700 transition-colors"
                  >
                    Load General Rules
                  </button>
                </div>
                <textarea 
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g., Always use Tailwind CSS. Never rewrite the whole file for small edits. Provide direct, concise answers without fluff..."
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500 h-32 resize-none"
                />
              </div>
            </div>
            
            <div className="px-4 py-3 border-t border-gray-800 bg-[#1a1a1a] flex justify-between items-center">
              <div className="flex gap-2">
                <button 
                  onClick={importSettings}
                  className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded text-sm transition-colors border border-gray-700"
                  title="Import Settings"
                >
                  <Upload className="w-4 h-4" /> Import
                </button>
                <button 
                  onClick={exportSettings}
                  className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded text-sm transition-colors border border-gray-700"
                  title="Export Settings"
                >
                  <Download className="w-4 h-4" /> Export
                </button>
              </div>

              <button 
                onClick={() => setShowSettings(false)}
                className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded font-medium text-sm transition-colors"
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
            onStopGeneration={handleStopGeneration}
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
