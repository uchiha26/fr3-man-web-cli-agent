import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Copy, Check } from 'lucide-react';

interface Snippet {
  id: string;
  title: string;
  code: string;
}

interface SnippetsModalProps {
  onClose: () => void;
  onInsert: (code: string) => void;
}

export function SnippetsModal({ onClose, onInsert }: SnippetsModalProps) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newCode, setNewCode] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('agentSnippets');
    if (saved) {
      try {
        setSnippets(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse snippets', e);
      }
    }
  }, []);

  const saveSnippets = (newSnippets: Snippet[]) => {
    setSnippets(newSnippets);
    localStorage.setItem('agentSnippets', JSON.stringify(newSnippets));
  };

  const handleAdd = () => {
    if (!newTitle.trim() || !newCode.trim()) return;
    const newSnippet: Snippet = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      code: newCode.trim()
    };
    saveSnippets([...snippets, newSnippet]);
    setNewTitle('');
    setNewCode('');
    setIsAdding(false);
  };

  const handleDelete = (id: string) => {
    saveSnippets(snippets.filter(s => s.id !== id));
  };

  const handleCopy = (snippet: Snippet) => {
    navigator.clipboard.writeText(snippet.code);
    setCopiedId(snippet.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-[#111] border border-gray-800 rounded-lg shadow-2xl w-[600px] max-w-[90vw] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-[#1a1a1a] flex-shrink-0">
          <h2 className="font-semibold text-gray-200">Code Snippets</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
          {isAdding ? (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
              <input
                type="text"
                placeholder="Snippet Title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full bg-[#111] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-green-500"
              />
              <textarea
                placeholder="Paste your code here..."
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                rows={6}
                className="w-full bg-[#111] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-green-500 font-mono resize-none custom-scrollbar"
              />
              <div className="flex justify-end gap-2">
                <button 
                  onClick={() => setIsAdding(false)}
                  className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAdd}
                  disabled={!newTitle.trim() || !newCode.trim()}
                  className="px-3 py-1.5 rounded text-sm bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
                >
                  Save Snippet
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => setIsAdding(true)}
              className="w-full py-3 border border-dashed border-gray-700 rounded-lg text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add New Snippet
            </button>
          )}

          <div className="space-y-3">
            {snippets.map(snippet => (
              <div key={snippet.id} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden group">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-[#1a1a1a]">
                  <h3 className="font-medium text-sm text-gray-300">{snippet.title}</h3>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleCopy(snippet)}
                      className="p-1.5 text-gray-400 hover:text-green-400 rounded transition-colors"
                      title="Copy to clipboard"
                    >
                      {copiedId === snippet.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button 
                      onClick={() => onInsert(snippet.code)}
                      className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded transition-colors"
                    >
                      Insert
                    </button>
                    <button 
                      onClick={() => handleDelete(snippet.id)}
                      className="p-1.5 text-gray-400 hover:text-red-400 rounded transition-colors"
                      title="Delete snippet"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="p-3 bg-[#0a0a0a] overflow-x-auto custom-scrollbar">
                  <pre className="text-xs text-gray-400 font-mono m-0">
                    <code>{snippet.code}</code>
                  </pre>
                </div>
              </div>
            ))}
            {snippets.length === 0 && !isAdding && (
              <div className="text-center py-8 text-gray-500 text-sm">
                No snippets saved yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
