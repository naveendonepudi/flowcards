import { GoogleGenAI } from "@google/genai";

function sanitizeText(text: string): string {
  return text
    .replace(/<[^>]*>?/gm, '')
    .replace(/\x1f/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Fix: Initializing GoogleGenAI inside the function scope to correctly pick up 
 * updates to process.env.API_KEY triggered by the user's key selection dialog.
 */
export async function getSmartExplanation(front: string, back: string, modelName: string = 'gemini-3-flash-preview') {
  const cleanFront = sanitizeText(front);
  const cleanBack = sanitizeText(back);

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `Perform a High-Yield USMLE Board Review for the following card:
      
      TOPIC: ${cleanFront}
      DETAIL: ${cleanBack}
      
      Structure the response as a clear reading note with these exact categories:
      1. CLINICAL CONCEPT: (A high-yield summary of the medical entity)
      2. PATHOPHYSIOLOGY / MECHANISM: (The underlying medical logic or biological pathway)
      3. USMLE BOARD PEARLS: (High-yield facts, classic buzzwords, or "Next Best Step" logic)
      4. TYPICAL VIGNETTE: (Describe how this usually presents in a board question)
      5. MNEMONIC / ASSOCIATION: (A memory tool for Step 1/2 success)
      
      Rules: 
      - Use professional medical terminology.
      - Focus on clinical differentiation (how to tell it apart from similar conditions).
      - Do not use markdown headers (#), use CAPITALIZED LABELS instead.
      - Keep it high-density but concise for mobile reading.`,
      config: {
        systemInstruction: "You are an elite USMLE Board Educator specializing in high-yield medical content. Your goal is to synthesize complex clinical data into standardized board-style correlations that are easy to read and memorize.",
      }
    });
    return response.text;
  } catch (error: any) {
    console.error("AI Error:", error);
    if (error.message?.includes("Requested entity was not found.")) {
      return "Error: Gemini project not found. Please re-select your API key in Settings.";
    }
    return "Clinical Review service error. Please verify manually or check API configuration in settings.";
  }
}