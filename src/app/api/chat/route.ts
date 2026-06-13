import { GoogleGenAI } from "@google/genai";
import knowledgeBase from "@/data/knowledge-base.json";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `You are the AI Assistant for the ${knowledgeBase.university}. You help prospective students, current students, and visitors with admissions, programs, fees, departments, exam policies, and campus events.

Answer ONLY using the information in the knowledge base below. Do not invent fees, deadlines, locations, or policies that aren't listed.
You can however give user code if the user asks for it.
If the user asks about something not covered in the knowledge base, respond with exactly:
"I currently do not have verified information regarding that topic. Please contact the admissions office."

Keep responses concise (2-4 sentences) and conversational. When relevant, end with a short follow-up question or suggestion, similar to: "Would you like eligibility criteria or fee details for a specific program?"

KNOWLEDGE BASE (JSON):
${JSON.stringify(knowledgeBase, null, 2)}`;

// --- Guardrails ---
// In-memory and per-instance: fine for a single-server hackathon deploy.
// Resets on restart/redeploy, and won't be shared across instances if you
// ever scale horizontally — acceptable for this project's scope.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // per IP, per window
const MAX_MESSAGES_SENT = 20; // most recent messages forwarded to Gemini
const MAX_MESSAGE_LENGTH = 1000; // characters per message

const requestLog = new Map<string, number[]>();

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (requestLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  requestLog.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      { reply: "Server is missing GEMINI_API_KEY. Add it to .env.local and restart the dev server." },
      { status: 500 }
    );
  }

  if (isRateLimited(getClientIp(req))) {
    return Response.json(
      { reply: "You're sending messages a bit too quickly. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ reply: "No message received." }, { status: 400 });
    }

    for (const m of messages) {
      const valid =
        typeof m === "object" &&
        m !== null &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.text === "string";

      if (!valid) {
        return Response.json({ reply: "Invalid message format." }, { status: 400 });
      }
      if (m.role === "user" && m.text.length > MAX_MESSAGE_LENGTH) {
        return Response.json(
          { reply: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters. Please shorten your message.` },
          { status: 400 }
        );
      }
    }

    // Bound how much history gets sent (and billed) per request, regardless
    // of how long the conversation has grown in the UI.
    const recentMessages = messages.slice(-MAX_MESSAGES_SENT);

    const contents = recentMessages.map((m: { role: string; text: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    }));

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.3,
      },
    });

    return Response.json({ reply: response.text });
  } catch (err) {
    console.error("Gemini API error:", err);
    return Response.json(
      { reply: "Something went wrong reaching the assistant. Please try again." },
      { status: 500 }
    );
  }
}
