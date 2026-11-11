// === Lore Chat / AI Integration ===

class LoreChat {
  constructor() {
    this.messages = [];
    this.loreContext = []; // Accumulated lore for simulation
    this.systemPrompt = `You are a world-building assistant for a civilization simulator called World Story Gen. Help the user flesh out their world's lore, creatures, gods, magic systems, geography, and cultures. Be creative and build on their ideas. Keep responses concise (2-3 paragraphs max) but rich with detail. Reference previously discussed lore when relevant.`;
  }

  getApiKey() {
    return localStorage.getItem('openrouter_api_key');
  }

  setApiKey(key) {
    localStorage.setItem('openrouter_api_key', key);
  }

  hasApiKey() {
    return !!this.getApiKey();
  }

  async sendMessage(userText) {
    this.messages.push({ role: 'user', content: userText });
    this.loreContext.push({ role: 'user', content: userText });

    const apiKey = this.getApiKey();
    if (!apiKey) {
      const fallback = "Your lore has been saved and will influence simulation events. Add an OpenRouter API key in settings to enable AI world-building replies.";
      this.messages.push({ role: 'assistant', content: fallback });
      return fallback;
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.href,
          'X-Title': 'World Story Gen'
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.6-plus:free',
          messages: [
            { role: 'system', content: this.systemPrompt },
            ...this.messages.slice(-20) // Keep last 20 messages for context
          ],
          max_tokens: 500,
          temperature: 0.8
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`API error ${response.status}: ${err}`);
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || 'No response received.';
      
      // Strip thinking tags if present (Qwen sometimes includes these)
      const cleaned = reply.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      
      this.messages.push({ role: 'assistant', content: cleaned });
      this.loreContext.push({ role: 'assistant', content: cleaned });
      return cleaned;
    } catch (err) {
      const errorMsg = `⚠️ Error: ${err.message}`;
      this.messages.push({ role: 'assistant', content: errorMsg });
      return errorMsg;
    }
  }

  getLoreSummary() {
    // Combine all lore for simulation context
    return this.loreContext
      .map(m => m.content)
      .join('\n\n');
  }

  getLoreKeywords() {
    // Extract key themes from lore for event flavoring
    const text = this.getLoreSummary().toLowerCase();
    const keywords = [];
    const themes = ['god', 'dragon', 'magic', 'undead', 'demon', 'spirit', 'forest', 'ocean', 'mountain', 'crystal', 'fire', 'ice', 'storm', 'ancient', 'prophecy', 'curse', 'blessed', 'dark', 'light', 'war', 'peace', 'trade', 'empire'];
    for (const theme of themes) {
      if (text.includes(theme)) keywords.push(theme);
    }
    return keywords;
  }
}

// Global instance
const loreChat = new LoreChat();
