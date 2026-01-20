import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { mcpGenerateReply, mcpAnalyzeEmail } from './mcpService.js';

// Load environment variables
dotenv.config();

console.log("🚀 ~ Gemini API Key configured:", process.env.GEMINI_API_KEY ? 'Yes' : 'No');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// Analyze email sentiment and category
export const analyzeEmail = async (emailBody) => {
  try {
    const prompt = `You are an email analysis assistant. Analyze the following email and provide sentiment (positive/negative/neutral/urgent) and category (inquiry/complaint/support/sales/general). Respond ONLY with valid JSON format with keys: sentiment, category.

Email to analyze:
${emailBody}

Response (JSON only):`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Clean up response to extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : text;
    
    const analysis = JSON.parse(jsonText);
    return {
      sentiment: analysis.sentiment || 'neutral',
      category: analysis.category || 'general',
    };
  } catch (error) {
    console.error('Error analyzing email:', error);
    return {
      sentiment: 'neutral',
      category: 'general',
    };
  }
};

// Generate email reply using Gemini
export const generateReply = async (email, tone = 'professional') => {
  try {
    const toneInstructions = {
      professional: 'Write in a professional and courteous tone.',
      casual: 'Write in a casual and friendly tone.',
      friendly: 'Write in a warm and friendly tone.',
      formal: 'Write in a formal and respectful tone.',
    };

    const prompt = `You are an AI email assistant. Generate an appropriate email reply. ${toneInstructions[tone] || toneInstructions.professional} Keep replies concise and helpful.

Original Email:
From: ${email.from}
Subject: ${email.subject}

${email.body}

Generate a professional reply (body text only, no subject or signature):`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    return text.trim();
  } catch (error) {
    console.error('Error generating reply:', error);
    throw error;
  }
};

// Process email with AI (uses MCP server when available)
export const processEmailWithAI = async (email, user) => {
  try {
    // Try to use MCP server first
    const mcpAnalysis = await mcpAnalyzeEmail({
      from: email.from,
      subject: email.subject,
      body: email.body,
    });

    const mcpReply = await mcpGenerateReply({
      from: email.from,
      subject: email.subject,
      body: email.body,
      tone: user.agentSettings.tone,
    });

    return {
      sentiment: mcpAnalysis.sentiment,
      category: mcpAnalysis.category,
      reply: mcpReply,
    };
  } catch (error) {
    console.error('MCP service error, falling back to direct Gemini:', error);
    
    // Fallback to direct Gemini if MCP fails
    const analysis = await analyzeEmail(email.body);
    const reply = await generateReply(email, user.agentSettings.tone);

    return {
      sentiment: analysis.sentiment,
      category: analysis.category,
      reply,
    };
  }
};
