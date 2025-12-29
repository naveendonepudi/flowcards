
import { GoogleGenAI } from "@google/genai";
import { AISettings } from "../types";

function sanitizeText(text: any): string {
  if (typeof text !== 'string') return "";
  return text
    .replace(/<[^>]*>?/gm, '')
    .replace(/\x1f/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

const SYSTEM_PROMPT = "You are an elite USMLE Board Educator. Synthesize medical data into standardized high-yield board-style correlations for medical students.";

const PROMPT_TEMPLATE = (front: string, back: string) => `Perform a High-Yield USMLE Board Review for the following clinical concept:

TOPIC (Question Side): 
${front}

DETAILS (Answer Side): 
${back}

Structure your response with these exact labels for mobile readability:
1. CLINICAL CONCEPT: (One-sentence summary)
2. PATHOPHYSIOLOGY: (Core underlying mechanism)
3. BOARD PEARLS: (High-yield facts and classic "next best step" logic)
4. TYPICAL VIGNETTE: (The classic board presentation)
5. MNEMONIC: (Memory tool for success)

Rules: Use professional medical terminology. Focus on differentiation from similar conditions. Do not use markdown headers (#). Use CAPITALIZED LABELS only.`;

export async function getSmartExplanation(front: string, back: string, settings: AISettings) {
  const cleanFront = sanitizeText(front);
  const cleanBack = sanitizeText(back);
  const prompt = PROMPT_TEMPLATE(cleanFront, cleanBack);

  try {
    if (settings.provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: settings.model || 'gemini-3-flash-preview',
        contents: prompt,
        config: { 
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.4,
          topP: 0.8
        }
      });
      return response.text;
    } 
    
    // Generic logic for OpenAI-compatible providers
    let endpoint = "";
    let apiKey = "";
    let model = "";

    if (settings.provider === 'openai') {
      endpoint = "https://api.openai.com/v1/chat/completions";
      apiKey = settings.apiKeys.openai || "";
      model = "gpt-4o";
    } else if (settings.provider === 'perplexity') {
      endpoint = "https://api.perplexity.ai/chat/completions";
      apiKey = settings.apiKeys.perplexity || "";
      model = "llama-3.1-sonar-small-128k-online";
    } else if (settings.provider === 'custom') {
      endpoint = settings.customEndpoint || "";
      apiKey = settings.apiKeys.custom || "";
      model = settings.customModel || "gpt-3.5-turbo";
      
      if (endpoint && !endpoint.endsWith('/chat/completions')) {
        endpoint = endpoint.replace(/\/$/, '') + '/chat/completions';
      }
    }

    if (!endpoint || !apiKey) {
      throw new Error(`${settings.provider.toUpperCase()} API key missing. Please configure in profile settings.`);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    
    return data.choices?.[0]?.message?.content || "No explanation generated.";

  } catch (error: any) {
    console.error("Clinical Insight Error:", error);
    return `Analysis Error: ${error.message || "The reasoning engine is currently unavailable"}.`;
  }
}
