import nodemailer from 'nodemailer';
import User from '../models/User.js';
import Email from '../models/Email.js';
import { sendGmailReply } from './gmailService.js';

// Create email transporter
export const createTransporter = async (userId) => {
  const user = await User.findById(userId);
  
  if (!user || !user.emailConfig || !user.emailConfig.email) {
    throw new Error('Email configuration not found');
  }

  const config = user.emailConfig;

  // Gmail configuration
  if (config.provider === 'gmail' || config.email.includes('@gmail.com')) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.email,
        pass: config.password,
      },
    });
  }

  // Custom SMTP configuration
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: {
      user: config.email,
      pass: config.password,
    },
  });
};

// Fetch emails (placeholder - implement IMAP connection)
export const fetchEmails = async (userId) => {
  try {
    const user = await User.findById(userId);
    
    if (!user || !user.emailConfig || !user.emailConfig.email) {
      throw new Error('Email configuration not found');
    }

    // TODO: Implement IMAP connection to fetch emails
    // This is a placeholder implementation
    // You would use libraries like 'imap' or 'node-imap' for actual implementation
    
    console.log('Fetching emails for user:', user.email);
    
    // For now, return empty array
    // In production, this would fetch from IMAP server and store in database
    return [];
  } catch (error) {
    console.error('Error fetching emails:', error);
    throw error;
  }
};

// Send email
export const sendEmail = async (userId, { to, subject, body, inReplyTo, references }) => {
  try {
    const user = await User.findById(userId);
    
    if (!user || !user.emailConfig || !user.emailConfig.email) {
      throw new Error('Email configuration not found');
    }

    // Use Gmail service for Gmail accounts
    if (user.emailConfig.provider === 'gmail' || user.emailConfig.email.includes('@gmail.com')) {
      const result = await sendGmailReply(userId, {
        to,
        subject,
        body,
        inReplyTo,
        references,
      });
      
      return {
        messageId: result.messageId,
        response: result.response,
      };
    }

    // Fallback to standard SMTP for other providers
    const transporter = await createTransporter(userId);

    const mailOptions = {
      from: user.emailConfig.email,
      to,
      subject,
      text: body,
      html: `<div style="font-family: Arial, sans-serif;">${body.replace(/\n/g, '<br>')}</div>`,
    };

    if (inReplyTo) {
      mailOptions.inReplyTo = inReplyTo;
      mailOptions.references = references || inReplyTo;
    }

    const info = await transporter.sendMail(mailOptions);
    
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

// Store received email in database
export const storeEmail = async (userId, emailData) => {
  try {
    const email = new Email({
      userId,
      from: emailData.from,
      to: emailData.to,
      subject: emailData.subject,
      body: emailData.body,
      htmlBody: emailData.htmlBody,
      messageId: emailData.messageId,
      inReplyTo: emailData.inReplyTo,
    });

    await email.save();
    return email;
  } catch (error) {
    console.error('Error storing email:', error);
    throw error;
  }
};
