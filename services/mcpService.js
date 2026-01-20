import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3003';
console.log("🚀 ~ MCP_SERVER_URL:", MCP_SERVER_URL);

// Call MCP server to generate email reply
export const mcpGenerateReply = async ({ from, subject, body, tone }) => {
  try {
    const response = await axios.post(`${MCP_SERVER_URL}/api/generate-reply`, {
      email: {
        from,
        subject,
        body,
      },
      tone,
    }, {
      timeout: 30000, // 30 second timeout
    });

    return response.data.reply;
  } catch (error) {
    console.error('MCP generate reply error:', error.message);
    throw new Error('MCP server unavailable');
  }
};

// Call MCP server to analyze email
export const mcpAnalyzeEmail = async ({ from, subject, body }) => {
  try {
    const response = await axios.post(`${MCP_SERVER_URL}/api/analyze-email`, {
      email: {
        from,
        subject,
        body,
      },
    }, {
      timeout: 30000,
    });

    return response.data;
  } catch (error) {
    console.error('MCP analyze email error:', error.message);
    throw new Error('MCP server unavailable');
  }
};

// Health check for MCP server
export const checkMCPHealth = async () => {
  try {
    const response = await axios.get(`${MCP_SERVER_URL}/health`, {
      timeout: 5000,
    });
    return response.data;
  } catch (error) {
    console.error('MCP health check failed:', error.message);
    return { status: 'unavailable' };
  }
};
