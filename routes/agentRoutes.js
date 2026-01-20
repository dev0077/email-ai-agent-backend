import express from 'express';
import mongoose from 'mongoose';
import { authenticateToken } from '../middleware/auth.js';
import { processEmailWithAI } from '../services/aiService.js';
import { mcpGenerateReply } from '../services/mcpService.js';
import Email from '../models/Email.js';
import User from '../models/User.js';

const router = express.Router();

// Update agent settings
router.put('/settings', authenticateToken, async (req, res) => {
  try {
    const { enabled, autoReply, tone, replyDelay, categories } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update agent settings
    if (enabled !== undefined) user.agentSettings.enabled = enabled;
    if (autoReply !== undefined) user.agentSettings.autoReply = autoReply;
    if (tone) user.agentSettings.tone = tone;
    if (replyDelay !== undefined) user.agentSettings.replyDelay = replyDelay;
    if (categories) user.agentSettings.categories = categories;

    await user.save();

    res.json({
      message: 'Agent settings updated',
      settings: user.agentSettings,
    });
  } catch (error) {
    console.error('Error updating agent settings:', error);
    res.status(500).json({ message: 'Error updating settings' });
  }
});

// Get agent settings
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.agentSettings);
  } catch (error) {
    console.error('Error fetching agent settings:', error);
    res.status(500).json({ message: 'Error fetching settings' });
  }
});

// Generate AI reply for specific email
router.post('/generate-reply/:emailId', authenticateToken, async (req, res) => {
  try {
    const email = await Email.findOne({
      _id: req.params.emailId,
      userId: req.user.userId,
    });

    if (!email) {
      return res.status(404).json({ message: 'Email not found' });
    }

    const user = await User.findById(req.user.userId);

    // Use MCP server to generate reply
    const reply = await mcpGenerateReply({
      from: email.from,
      subject: email.subject,
      body: email.body,
      tone: user.agentSettings.tone,
    });

    res.json({
      message: 'Reply generated successfully',
      reply,
    });
  } catch (error) {
    console.error('Error generating reply:', error);
    res.status(500).json({ message: 'Error generating reply' });
  }
});

// Process pending emails with AI
router.post('/process-pending', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user.agentSettings.enabled) {
      return res.status(400).json({ message: 'AI Agent is not enabled' });
    }

    const pendingEmails = await Email.find({
      userId: req.user.userId,
      status: 'pending',
    }).limit(10);

    const processed = [];

    for (const email of pendingEmails) {
      try {
        email.status = 'processing';
        await email.save();

        const analysis = await processEmailWithAI(email, user);
        
        email.sentiment = analysis.sentiment;
        email.category = analysis.category;
        email.aiResponse = analysis.reply;
        email.status = 'replied';
        
        if (user.agentSettings.autoReply) {
          email.autoReply = true;
          email.repliedAt = new Date();
        }

        await email.save();
        processed.push(email);
      } catch (err) {
        console.error(`Error processing email ${email._id}:`, err);
        email.status = 'failed';
        await email.save();
      }
    }

    res.json({
      message: 'Emails processed',
      processed: processed.length,
      emails: processed,
    });
  } catch (error) {
    console.error('Error processing emails:', error);
    res.status(500).json({ message: 'Error processing emails' });
  }
});

// Get agent statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching stats for user:', req.user.userId);
    
    // Convert userId to ObjectId if it's a string
    const userId = req.user.userId;
    
    // First, let's check if any emails exist for this user
    const totalEmails = await Email.countDocuments({ userId });
    console.log('Total emails for user:', totalEmails);
    
    // If no emails, return empty stats
    if (totalEmails === 0) {
      console.log('No emails found for user');
      return res.json({
        statusStats: [],
        categoryStats: [],
        totalEmails: 0,
      });
    }
    
    const stats = await Email.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);
    
    console.log('Status stats:', stats);

    const categoryStats = await Email.aggregate([
      { 
        $match: { 
          userId: new mongoose.Types.ObjectId(userId),
          category: { $exists: true, $ne: null }
        } 
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
    ]);
    
    console.log('Category stats:', categoryStats);

    res.json({
      statusStats: stats,
      categoryStats,
      totalEmails,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Error fetching statistics', error: error.message });
  }
});

export default router;
