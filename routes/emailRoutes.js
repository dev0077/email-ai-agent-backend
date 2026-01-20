import express from 'express';
import Email from '../models/Email.js';
import { authenticateToken } from '../middleware/auth.js';
import { fetchEmails, sendEmail } from '../services/emailService.js';

const router = express.Router();

// Get all emails for authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, limit = 50, skip = 0 } = req.query;
    
    const query = { userId: req.user.userId };
    if (status) {
      query.status = status;
    }

    const emails = await Email.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Email.countDocuments(query);

    res.json({
      emails,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
      },
    });
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ message: 'Error fetching emails' });
  }
});

// Get single email
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const email = await Email.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!email) {
      return res.status(404).json({ message: 'Email not found' });
    }

    res.json(email);
  } catch (error) {
    console.error('Error fetching email:', error);
    res.status(500).json({ message: 'Error fetching email' });
  }
});

// Fetch new emails from email provider
router.post('/fetch', authenticateToken, async (req, res) => {
  try {
    const newEmails = await fetchEmails(req.user.userId);
    res.json({
      message: 'Emails fetched successfully',
      count: newEmails.length,
      emails: newEmails,
    });
  } catch (error) {
    console.error('Error fetching new emails:', error);
    res.status(500).json({ message: 'Error fetching new emails' });
  }
});

// Send email reply
router.post('/:id/reply', authenticateToken, async (req, res) => {
  try {
    const { body } = req.body;
    
    const email = await Email.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!email) {
      return res.status(404).json({ message: 'Email not found' });
    }

    await sendEmail(req.user.userId, {
      to: email.from,
      subject: `Re: ${email.subject}`,
      body,
      inReplyTo: email.messageId,
    });

    email.status = 'replied';
    email.aiResponse = body;
    email.repliedAt = new Date();
    await email.save();

    res.json({
      message: 'Reply sent successfully',
      email,
    });
  } catch (error) {
    console.error('Error sending reply:', error);
    res.status(500).json({ message: 'Error sending reply' });
  }
});

// Update email status
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    
    const email = await Email.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { status },
      { new: true }
    );

    if (!email) {
      return res.status(404).json({ message: 'Email not found' });
    }

    res.json(email);
  } catch (error) {
    console.error('Error updating email:', error);
    res.status(500).json({ message: 'Error updating email' });
  }
});

// Delete email
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const email = await Email.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!email) {
      return res.status(404).json({ message: 'Email not found' });
    }

    res.json({ message: 'Email deleted successfully' });
  } catch (error) {
    console.error('Error deleting email:', error);
    res.status(500).json({ message: 'Error deleting email' });
  }
});

export default router;
