import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { verifyGmailConnection, sendTestEmail, fetchGmailEmails, deleteGmailEmails } from '../services/gmailService.js';
import { processEmailWithAI } from '../services/aiService.js';
import { sendGmailReply } from '../services/gmailService.js';
import User from '../models/User.js';
import Email from '../models/Email.js';

const router = express.Router();

/**
 * Gmail Configuration Routes
 * 
 * These routes help users set up and test their Gmail integration
 */

// Configure Gmail settings
router.post('/config', authenticateToken, async (req, res) => {
  try {
    const { email, appPassword } = req.body;

    if (!email || !appPassword) {
      return res.status(400).json({
        message: 'Email and app password are required',
      });
    }

    // Validate it's a Gmail address
    // if (!email.includes('@gmail.com')) {
    //   return res.status(400).json({
    //     message: 'Please provide a valid Gmail address',
    //   });
    // }

    // Verify connection before saving
    const verification = await verifyGmailConnection(email, appPassword);
    
    if (!verification.success) {
      return res.status(400).json({
        message: verification.message,
      });
    }

    // Save Gmail configuration
    const user = await User.findById(req.user.userId);
    user.emailConfig = {
      provider: 'gmail',
      email,
      password: appPassword, // App password, not actual Gmail password
    };
    await user.save();

    res.json({
      message: 'Gmail configuration saved successfully',
      email,
      verified: true,
    });
  } catch (error) {
    console.error('Error configuring Gmail:', error);
    res.status(500).json({
      message: 'Failed to configure Gmail',
      error: error.message,
    });
  }
});

// Get current Gmail configuration (without exposing password)
router.get('/config', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user.emailConfig || !user.emailConfig.email) {
      return res.json({
        configured: false,
        message: 'Gmail not configured yet',
      });
    }

    res.json({
      configured: true,
      email: user.emailConfig.email,
      provider: user.emailConfig.provider || 'gmail',
    });
  } catch (error) {
    console.error('Error fetching Gmail config:', error);
    res.status(500).json({
      message: 'Failed to fetch Gmail configuration',
    });
  }
});

// Verify Gmail connection
router.post('/verify', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user.emailConfig || !user.emailConfig.email) {
      return res.status(400).json({
        message: 'Gmail not configured. Please configure your Gmail first.',
      });
    }

    const result = await verifyGmailConnection(
      user.emailConfig.email,
      user.emailConfig.password
    );

    res.json(result);
  } catch (error) {
    console.error('Error verifying Gmail:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify Gmail connection',
    });
  }
});

// Send test email
router.post('/test', authenticateToken, async (req, res) => {
  try {
    const result = await sendTestEmail(req.user.userId);
    res.json(result);
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send test email',
    });
  }
});

// Delete Gmail configuration
router.delete('/config', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    user.emailConfig = undefined;
    await user.save();

    res.json({
      message: 'Gmail configuration removed successfully',
    });
  } catch (error) {
    console.error('Error removing Gmail config:', error);
    res.status(500).json({
      message: 'Failed to remove Gmail configuration',
    });
  }
});

// Fetch emails from Gmail
router.post('/fetch', authenticateToken, async (req, res) => {
  try {
    const { limit = 10, searchCriteria } = req.body;
    
    // Default to all emails if no criteria specified
    const criteria = searchCriteria || ['ALL'];
    
    // Fetch emails from Gmail
    const emails = await fetchGmailEmails(req.user.userId, {
      limit,
      searchCriteria: criteria,
    });

    // Get user settings to check if auto-reply is enabled
    const user = await User.findById(req.user.userId);
    const autoReplyEnabled = user.agentSettings?.enabled && user.agentSettings?.autoReply;

    let processedCount = 0;
    let repliedCount = 0;

    // If auto-reply is enabled, process and reply to pending emails
    if (autoReplyEnabled && emails.length > 0) {
      console.log(`🤖 Auto-reply enabled. Processing ${emails.length} email(s)...`);

      for (const email of emails) {
        try {
          // Only process pending emails
          if (email.status === 'pending') {
            console.log(`📧 Processing email: ${email.subject}`);
            
            // Update status to processing
            email.status = 'processing';
            await email.save();

            // Generate AI response
            const aiResult = await processEmailWithAI(email, user);
            
            // Update email with AI analysis
            email.sentiment = aiResult.sentiment;
            email.category = aiResult.category;
            email.aiResponse = aiResult.reply;
            await email.save();

            processedCount++;

            // Send reply via Gmail
            const replyResult = await sendGmailReply(req.user.userId, {
              to: email.from,
              subject: `Re: ${email.subject}`,
              body: aiResult.reply,
              inReplyTo: email.messageId,
              references: email.messageId,
            });

            // Update email status to replied
            email.status = 'replied';
            email.repliedAt = new Date();
            await email.save();

            repliedCount++;
            console.log(`✅ Auto-replied to: ${email.from} - ${email.subject}`);

          }
        } catch (error) {
          console.error(`❌ Error processing email ${email._id}:`, error);
          email.status = 'failed';
          await email.save();
        }
      }
    }

    res.json({
      success: true,
      message: autoReplyEnabled 
        ? `Fetched ${emails.length} email(s). Processed ${processedCount}, replied to ${repliedCount}.`
        : `Successfully fetched ${emails.length} new email(s)`,
      count: emails.length,
      autoReply: autoReplyEnabled,
      processed: processedCount,
      replied: repliedCount,
      emails: emails.map(email => ({
        id: email._id,
        from: email.from,
        to: email.to,
        subject: email.subject,
        body: email.body.substring(0, 200) + (email.body.length > 200 ? '...' : ''),
        status: email.status,
        category: email.category,
        sentiment: email.sentiment,
        receivedAt: email.receivedAt,
        createdAt: email.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching Gmail emails:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch emails from Gmail',
    });
  }
});

// Delete promotional, social, updates, purchases, spam, trash, and noreply emails from Gmail
router.delete('/cleanup', authenticateToken, async (req, res) => {
  try {
    const { categories } = req.body;
    
    // Default categories if none specified
    const categoriesToDelete = categories || ['promotional', 'social', 'updates', 'purchases', 'spam', 'trash', 'noreply'];
    
    console.log(`🗑️ Starting cleanup for categories: ${categoriesToDelete.join(', ')}`);
    
    // Delete emails from Gmail
    const deletedCounts = await deleteGmailEmails(req.user.userId, {
      categories: categoriesToDelete,
    });

    // Calculate total deleted
    const totalDeleted = Object.values(deletedCounts).reduce((sum, count) => sum + count, 0);

    res.json({
      success: true,
      message: `Successfully cleaned up ${totalDeleted} email(s)`,
      deletedCounts,
      totalDeleted,
      categories: categoriesToDelete,
    });
  } catch (error) {
    console.error('Error cleaning up Gmail emails:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cleanup emails from Gmail',
    });
  }
});

export default router;

