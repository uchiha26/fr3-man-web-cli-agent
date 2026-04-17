import React, { useState, useRef, useEffect } from 'react';
import { Send, Terminal as TerminalIcon, Folder, Paperclip, X, Brain, Code, MousePointer2, FileCode2 } from 'lucide-react';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';
import DOMPurify from 'dompurify';
import { ChatMessage } from '../lib/ollama';
import { stripToolCall, parseToolCall } from '../lib/agent';
import { SnippetsModal } from './SnippetsModal';

// Configure marked with highlight.js
marked.use(markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  }
}));

export interface Attachment {
  name: string;
  type: string;
  data: string; // base64 or text
  isImage: boolean;
}

interface TerminalProps {
  messages: ChatMessage[];
  onSendMessage: (content: string, attachments: Attachment[]) => void;
  isLoading: boolean;
  projectName: string | null;
  onSelectProject: () => void;
  prefilledInput?: string;
  onClearPrefilled?: () => void;
}

export function Terminal({ messages, onSendMessage, isLoading, projectName, onSelectProject, prefilledInput, onClearPrefilled }: TerminalProps) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [greeting, setGreeting] = useState('');
  const [showSnippets, setShowSnippets] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const greetings = [
      "Hello! I'm Fr3 Man. What are we building today?",
      "Fr3 Man on duty! How can I help you with this project?",
      "Welcome! I am Fr3 Man, your personal coding assistant. What are the plans?",
      "Greetings! Fr3 Man is ready. Show me the code!",
      "System online. Fr3 Man is ready for action. What are we optimizing today?"
    ];
    setGreeting(greetings[Math.floor(Math.random() * greetings.length)]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, attachments]);

  useEffect(() => {
    if (prefilledInput) {
      setInput(prefilledInput);
      if (onClearPrefilled) onClearPrefilled();
    }
  }, [prefilledInput, onClearPrefilled]);

  useEffect(() => {
    // Add copy buttons to code blocks
    const preElements = document.querySelectorAll('.prose pre');
    preElements.forEach((pre) => {
      if (!pre.querySelector('.copy-btn')) {
        (pre as HTMLElement).style.position = 'relative';
        const button = document.createElement('button');
        button.className = 'copy-btn absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-xs text-white px-2 py-1 rounded opacity-0 transition-opacity duration-200 flex items-center gap-1';
        button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copy';
        
        pre.addEventListener('mouseenter', () => button.style.opacity = '1');
        pre.addEventListener('mouseleave', () => button.style.opacity = '0');

        button.onclick = () => {
          const code = pre.querySelector('code')?.innerText || '';
          navigator.clipboard.writeText(code);
          button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
          button.classList.add('bg-green-600', 'hover:bg-green-700');
          button.classList.remove('bg-gray-700', 'hover:bg-gray-600');
          setTimeout(() => {
            button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copy';
            button.classList.remove('bg-green-600', 'hover:bg-green-700');
            button.classList.add('bg-gray-700', 'hover:bg-gray-600');
          }, 2000);
        };
        pre.appendChild(button);
      }
    });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading) return;
    onSendMessage(input, attachments);
    setInput('');
    setAttachments([]);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isImage = file.type.startsWith('image/');
      const reader = new FileReader();

      reader.onload = (event) => {
        const result = event.target?.result as string;
        setAttachments(prev => [...prev, {
          name: file.name,
          type: file.type,
          data: isImage ? result.split(',')[1] : result, // Base64 without prefix for images
          isImage
        }]);
      };

      if (isImage) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const renderMessage = (msg: ChatMessage, index: number) => {
    if (msg.role === 'system') return null;
    
    const isTool = msg.role === 'tool';
    const isUser = msg.role === 'user';
    
    let content = msg.content;
    
    if (isTool) {
      // Determine if this was a precision tool
      const isPrecisionTool = content.includes('Successfully edited lines') || content.includes('Successfully inserted content');
      
      return (
        <div key={index} className="w-full flex justify-center my-4">
          <details className="w-full max-w-3xl bg-[#1e1e1e] rounded-lg border border-gray-800 overflow-hidden group">
            <summary className="px-4 py-2 cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-[#2a2a2a] flex items-center gap-2 select-none transition-colors">
              {isPrecisionTool ? <MousePointer2 className="w-4 h-4 text-blue-400" /> : <Code className="w-4 h-4" />}
              <span>{isPrecisionTool ? 'Precision Edit Executed' : 'Tool Execution Result'}</span>
            </summary>
            <div className="p-4 bg-[#111] text-xs text-gray-300 overflow-x-auto max-h-96 overflow-y-auto border-t border-gray-800 font-mono whitespace-pre-wrap">
              {content}
            </div>
          </details>
        </div>
      );
    }

    // Parse thinking process
    let thinkContent = '';
    let mainContent = content;

    const thinkMatch = content.match(/<(?:think|thought)>([\s\S]*?)<\/(?:think|thought)>/);
    if (thinkMatch) {
      thinkContent = thinkMatch[1];
      mainContent = content.replace(/<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/, '').trim();
    } else if (content.includes('<think>')) {
      const parts = content.split('<think>');
      mainContent = parts[0].trim();
      thinkContent = parts[1];
    } else if (content.includes('<thought>')) {
      const parts = content.split('<thought>');
      mainContent = parts[0].trim();
      thinkContent = parts[1];
    }

    // Parse attached files
    const attachedFiles: {name: string, content: string}[] = [];
    
    // Parse new format
    mainContent = mainContent.replace(/<attached_file name="(.*?)">([\s\S]*?)<\/attached_file>/g, (match, name, fileContent) => {
      attachedFiles.push({name, content: fileContent.trim()});
      return '';
    });

    // Parse old format (for backwards compatibility with existing chat history)
    mainContent = mainContent.replace(/\[Attached File: (.*?)\]\n```\n([\s\S]*?)\n```/g, (match, name, fileContent) => {
      attachedFiles.push({name, content: fileContent.trim()});
      return '';
    });

    // Check for web_preview tool call before stripping
    let previewHtml = '';
    const toolCall = parseToolCall(content);
    if (toolCall && toolCall.name === 'web_preview' && toolCall.arguments.html) {
      previewHtml = toolCall.arguments.html;
    }

    // Strip tool calls from the UI
    if (!isUser) {
      mainContent = stripToolCall(mainContent);
    }

    if (!mainContent && !thinkContent && !previewHtml && attachedFiles.length === 0 && (!msg.images || msg.images.length === 0) && !isUser) {
      return null;
    }

    const html = DOMPurify.sanitize(marked.parse(mainContent) as string);

    return (
      <div key={index} className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'} mb-6`}>
        <div className={`max-w-3xl w-full flex ${isUser ? 'justify-end' : 'justify-start'}`}>
          <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%]`}>
            
            {/* User Message Bubble */}
            {isUser && (
              <div className="bg-[#2f2f2f] text-gray-100 rounded-2xl px-5 py-3 text-[15px] leading-relaxed">
                {msg.images && msg.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {msg.images.map((img, i) => (
                      <img key={i} src={`data:image/jpeg;base64,${img}`} alt="Attached" className="max-w-[200px] max-h-[200px] rounded-lg border border-gray-700" />
                    ))}
                  </div>
                )}
                
                {attachedFiles.length > 0 && (
                  <div className="flex flex-col gap-2 mb-3">
                    {attachedFiles.map((file, i) => (
                      <details key={i} className="bg-[#1e1e1e] rounded-lg border border-gray-700 overflow-hidden group">
                        <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-gray-300 hover:bg-[#2a2a2a] flex items-center gap-2 select-none">
                          <Paperclip className="w-4 h-4 text-gray-400" />
                          <span className="truncate">{file.name}</span>
                        </summary>
                        <div className="p-3 bg-[#111] text-xs text-gray-400 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap border-t border-gray-700 font-mono">
                          {file.content}
                        </div>
                      </details>
                    ))}
                  </div>
                )}

                {mainContent.trim() && <div className="whitespace-pre-wrap">{mainContent.trim()}</div>}
              </div>
            )}

            {/* Agent Message (No Bubble) */}
            {!isUser && (
              <div className="text-gray-200 text-[15px] leading-relaxed w-full">
                {thinkContent && (
                  <details className="mb-4 group">
                    <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300 flex items-center gap-2 select-none transition-colors">
                      <Brain className="w-4 h-4" /> 
                      <span className="font-medium">Thought Process</span>
                    </summary>
                    <div className="mt-2 pl-4 border-l-2 border-gray-700 text-gray-400 text-sm italic whitespace-pre-wrap">
                      {thinkContent}
                    </div>
                  </details>
                )}

                {attachedFiles.length > 0 && (
                  <div className="flex flex-col gap-2 mb-4">
                    {attachedFiles.map((file, i) => (
                      <details key={i} className="bg-[#1e1e1e] rounded-lg border border-gray-700 overflow-hidden group">
                        <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-gray-300 hover:bg-[#2a2a2a] flex items-center gap-2 select-none">
                          <Paperclip className="w-4 h-4 text-gray-400" />
                          <span className="truncate">{file.name}</span>
                        </summary>
                        <div className="p-3 bg-[#111] text-xs text-gray-400 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap border-t border-gray-700 font-mono">
                          {file.content}
                        </div>
                      </details>
                    ))}
                  </div>
                )}

                {mainContent && (
                  <div 
                    className="prose prose-invert prose-sm max-w-none prose-pre:bg-[#1e1e1e] prose-pre:border prose-pre:border-gray-800"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                )}

                {previewHtml && (
                  <div className="mt-4 border border-gray-700 rounded-lg overflow-hidden bg-white">
                    <div className="bg-gray-800 px-3 py-1.5 text-xs text-gray-400 flex items-center gap-2 border-b border-gray-700">
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                      </div>
                      Live Preview
                    </div>
                    <iframe 
                      srcDoc={previewHtml} 
                      className="w-full h-[400px] border-none bg-white"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#212121] text-gray-200 font-sans relative">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 pointer-events-none">
        <div className="flex items-center gap-2 text-gray-400 pointer-events-auto">
          <TerminalIcon className="w-5 h-5" />
          <span className="font-semibold text-sm">Fr3 Man</span>
        </div>
        <button 
          onClick={onSelectProject}
          className="flex items-center gap-2 px-3 py-1.5 text-xs bg-[#2f2f2f] hover:bg-[#3f3f3f] text-gray-300 rounded-full border border-gray-700 transition-colors pointer-events-auto shadow-sm"
        >
          <Folder className="w-3.5 h-3.5" />
          {projectName || 'Select Project'}
        </button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto pt-20 pb-32 px-4">
        <div className="max-w-3xl mx-auto w-full">
          {messages.length === 1 && messages[0].role === 'system' && (
            <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500 space-y-6">
              <div className="flex justify-center items-center text-gray-400 animate-bounce">
                <pre className="font-mono text-sm leading-tight text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]">{`  ,___,
  [O.O]
  /)__)
 -"--"-`}</pre>
              </div>
              <h1 className="text-2xl font-semibold text-gray-300 text-center px-4">{greeting}</h1>
            </div>
          )}
          {messages.map((msg, i) => renderMessage(msg, i))}
          {isLoading && (
            <div className="w-full flex justify-start mb-6">
              <div className="max-w-3xl w-full flex justify-start">
                <div className="flex items-center gap-2 text-gray-500">
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#212121] via-[#212121] to-transparent pt-10 pb-6 px-4">
        <div className="max-w-3xl mx-auto w-full relative">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 px-2">
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-2 bg-[#2f2f2f] px-3 py-1.5 rounded-xl text-xs border border-gray-700 shadow-sm">
                  <span className="truncate max-w-[150px] text-gray-300">{att.name}</span>
                  <button onClick={() => removeAttachment(i)} className="text-gray-500 hover:text-gray-300">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="relative flex items-end gap-2 bg-[#2f2f2f] rounded-2xl border border-gray-700 shadow-lg p-2 focus-within:border-gray-500 transition-colors">
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="p-2 text-gray-400 hover:text-gray-200 rounded-xl hover:bg-[#3f3f3f] transition-colors disabled:opacity-50"
              title="Attach file"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setShowSnippets(true)}
              disabled={isLoading}
              className="p-2 text-gray-400 hover:text-gray-200 rounded-xl hover:bg-[#3f3f3f] transition-colors disabled:opacity-50"
              title="Snippets"
            >
              <FileCode2 className="w-5 h-5" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Message Fr3 Man..."
              disabled={isLoading}
              rows={1}
              className="flex-1 max-h-48 bg-transparent border-none text-gray-100 px-2 py-2.5 focus:outline-none resize-none disabled:opacity-50 text-[15px]"
              style={{ minHeight: '44px' }}
            />
            <button
              type="submit"
              disabled={(!input.trim() && attachments.length === 0) || isLoading}
              className="p-2 bg-white text-black rounded-xl disabled:opacity-50 disabled:bg-[#3f3f3f] disabled:text-gray-500 transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <div className="text-center mt-2 text-xs text-gray-500">
            Fr3 Man can make mistakes. Check important changes.
          </div>
        </div>
      </div>

      {showSnippets && (
        <SnippetsModal 
          onClose={() => setShowSnippets(false)} 
          onInsert={(code) => {
            setInput(prev => prev ? `${prev}\n${code}` : code);
            setShowSnippets(false);
          }} 
        />
      )}
    </div>
  );
}
