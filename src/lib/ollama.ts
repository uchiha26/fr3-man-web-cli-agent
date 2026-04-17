export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  vision?: boolean;
  provider?: 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'deepseek';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
}

export async function getModels(
  baseUrl = 'http://localhost:11434',
  apiKeys?: { openai?: string, anthropic?: string, gemini?: string, deepseek?: string }
): Promise<OllamaModel[]> {
  let models: OllamaModel[] = [];
  
  // Fetch Ollama models
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (res.ok) {
      const data = await res.json();
      const ollamaModels = data.models.map((m: any) => ({
        ...m,
        provider: 'ollama',
        vision: m.name.toLowerCase().includes('llava') || 
                m.name.toLowerCase().includes('vision') || 
                m.name.toLowerCase().includes('minicpm-v') ||
                m.name.toLowerCase().includes('pixtral') ||
                m.name.toLowerCase().includes('bakllava') ||
                m.name.toLowerCase().includes('gemma')
      }));
      models = [...models, ...ollamaModels];
    }
  } catch (err) {
    console.error('Error fetching Ollama models:', err);
  }

  // Inject Cloud Models if keys are present
  const now = new Date().toISOString();
  
  if (apiKeys?.openai) {
    models.push({ name: 'gpt-4o', modified_at: now, size: 0, vision: true, provider: 'openai' });
    models.push({ name: 'gpt-4-turbo', modified_at: now, size: 0, vision: true, provider: 'openai' });
    models.push({ name: 'gpt-3.5-turbo', modified_at: now, size: 0, vision: false, provider: 'openai' });
  }
  
  if (apiKeys?.anthropic) {
    models.push({ name: 'claude-3-5-sonnet-20241022', modified_at: now, size: 0, vision: true, provider: 'anthropic' });
    models.push({ name: 'claude-3-opus-20240229', modified_at: now, size: 0, vision: true, provider: 'anthropic' });
    models.push({ name: 'claude-3-haiku-20240307', modified_at: now, size: 0, vision: true, provider: 'anthropic' });
  }

  if (apiKeys?.gemini) {
    models.push({ name: 'gemini-1.5-pro-latest', modified_at: now, size: 0, vision: true, provider: 'gemini' });
    models.push({ name: 'gemini-1.5-flash-latest', modified_at: now, size: 0, vision: true, provider: 'gemini' });
    models.push({ name: 'gemini-2.0-flash-exp', modified_at: now, size: 0, vision: true, provider: 'gemini' });
  }

  if (apiKeys?.deepseek) {
    models.push({ name: 'deepseek-chat', modified_at: now, size: 0, vision: false, provider: 'deepseek' });
    models.push({ name: 'deepseek-coder', modified_at: now, size: 0, vision: false, provider: 'deepseek' });
  }

  return models;
}

export async function getEmbedding(baseUrl: string, model: string, prompt: string): Promise<number[]> {
  try {
    const res = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt })
    });
    if (!res.ok) throw new Error('Failed to get embedding');
    const data = await res.json();
    return data.embedding;
  } catch (e) {
    console.error("Embedding error:", e);
    return [];
  }
}

export function cosineSimilarity(vecA: number[], vecB: number[]) {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
export async function chat(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  onChunk?: (chunk: string) => void,
  provider: 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'deepseek' = 'ollama',
  apiKeys?: { openai?: string, anthropic?: string, gemini?: string, deepseek?: string }
): Promise<string> {
  if (provider === 'openai' || provider === 'deepseek') {
    return chatOpenAICompatible(provider, model, messages, onChunk, apiKeys);
  } else if (provider === 'gemini') {
    return chatGemini(model, messages, onChunk, apiKeys?.gemini);
  } else if (provider === 'anthropic') {
    return chatAnthropic(model, messages, onChunk, apiKeys?.anthropic);
  }

  // Default Ollama implementation
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: !!onChunk,
    }),
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error('Ollama API endpoint not found (404). Is Ollama running?');
    if (res.status === 403) throw new Error('Ollama API forbidden (403). Check CORS settings (OLLAMA_ORIGINS).');
    if (res.status === 400) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`Ollama Bad Request (400): ${errData.error || res.statusText}`);
    }
    throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
  }

  if (!onChunk) {
    const data = await res.json();
    return data.message.content;
  }

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.trim());
      
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            fullContent += parsed.message.content;
            onChunk(parsed.message.content);
          }
        } catch (e) {
          // Ignore parse errors for incomplete chunks
        }
      }
    }
  }
  return fullContent;
}

// --- Cloud API Handlers ---

async function chatOpenAICompatible(
  provider: 'openai' | 'deepseek',
  model: string,
  messages: ChatMessage[],
  onChunk?: (chunk: string) => void,
  apiKeys?: { openai?: string, deepseek?: string }
): Promise<string> {
  const apiKey = provider === 'openai' ? apiKeys?.openai : apiKeys?.deepseek;
  if (!apiKey) throw new Error(`Missing API key for ${provider}`);

  const endpoint = provider === 'openai' 
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.deepseek.com/chat/completions';

  // Convert messages to OpenAI format (strip images for now to keep it simple, or format them if needed)
  const formattedMessages = messages.map(m => {
    // OpenAI/DeepSeek API expects 'user', 'assistant', 'system', or 'tool'
    // But if we send 'tool', it expects a tool_call_id which we aren't tracking properly yet in this simple implementation.
    // For now, let's map 'tool' role to 'user' or 'system' to avoid validation errors, 
    // or format it so the model understands it's a tool result.
    let role = m.role;
    let content = m.content;

    if (role === 'tool') {
      role = 'user';
      content = `[Tool Execution Result]:\n${content}`;
    }

    if (m.images && m.images.length > 0 && provider === 'openai') {
      return {
        role,
        content: [
          { type: 'text', text: content },
          ...m.images.map(img => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } }))
        ]
      };
    }
    return { role, content };
  });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      stream: !!onChunk
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`${provider} API error: ${err.error?.message || res.statusText}`);
  }

  if (!onChunk) {
    const data = await res.json();
    return data.choices[0].message.content;
  }

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.trim() && l.startsWith('data: '));
      
      for (const line of lines) {
        const dataStr = line.replace(/^data: /, '').trim();
        if (dataStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(dataStr);
          const text = parsed.choices[0]?.delta?.content || '';
          if (text) {
            fullContent += text;
            onChunk(text);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }
  return fullContent;
}

async function chatAnthropic(
  model: string,
  messages: ChatMessage[],
  onChunk?: (chunk: string) => void,
  apiKey?: string
): Promise<string> {
  if (!apiKey) throw new Error('Missing Anthropic API key');

  // Anthropic requires a specific format and system prompt separation
  const systemMsgs = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const userMsgs = messages.filter(m => m.role !== 'system').map(m => {
    let role = m.role === 'assistant' ? 'assistant' : 'user';
    let content = m.content;

    if (m.role === 'tool') {
      role = 'user';
      content = `[Tool Execution Result]:\n${content}`;
    }

    if (m.images && m.images.length > 0) {
      return {
        role,
        content: [
          ...m.images.map(img => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } })),
          { type: 'text', text: content }
        ]
      };
    }
    return { role, content };
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerously-allow-browser': 'true'
    },
    body: JSON.stringify({
      model,
      system: systemMsgs || undefined,
      messages: userMsgs,
      max_tokens: 4096,
      stream: !!onChunk
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${err.error?.message || res.statusText}`);
  }

  if (!onChunk) {
    const data = await res.json();
    return data.content[0].text;
  }

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.trim() && l.startsWith('data: '));
      
      for (const line of lines) {
        const dataStr = line.replace(/^data: /, '').trim();
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullContent += parsed.delta.text;
            onChunk(parsed.delta.text);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }
  return fullContent;
}

async function chatGemini(
  model: string,
  messages: ChatMessage[],
  onChunk?: (chunk: string) => void,
  apiKey?: string
): Promise<string> {
  if (!apiKey) throw new Error('Missing Gemini API key');

  // Convert to Gemini format
  const systemInstruction = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const contents = messages.filter(m => m.role !== 'system').map(m => {
    let content = m.content;
    let role = m.role === 'assistant' ? 'model' : 'user';

    if (m.role === 'tool') {
      role = 'user';
      content = `[Tool Execution Result]:\n${content}`;
    }

    const parts: any[] = [{ text: content }];
    if (m.images && m.images.length > 0) {
      m.images.forEach(img => {
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: img } });
      });
    }
    return {
      role,
      parts
    };
  });

  const body: any = { contents };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const endpoint = onChunk 
    ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini API error: ${err.error?.message || res.statusText}`);
  }

  if (!onChunk) {
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      // Gemini streams a JSON array of objects, which can be tricky to parse incrementally.
      // We'll use a simple regex to extract text fields since standard JSON parsing might fail on chunks.
      const textMatches = chunk.match(/"text":\s*"([^"]+)"/g);
      if (textMatches) {
        for (const match of textMatches) {
          try {
            // Extract the actual string value and handle escaped characters
            const text = JSON.parse(`{${match}}`).text;
            fullContent += text;
            onChunk(text);
          } catch (e) {}
        }
      }
    }
  }
  return fullContent;
}
