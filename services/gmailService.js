import nodemailer from 'nodemailer';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import User from '../models/User.js';
import Email from '../models/Email.js';

/**
 * Gmail Service for sending and receiving emails
 * 
 * SETUP INSTRUCTIONS:
 * 1. Enable 2-factor authentication on your Gmail account
 * 2. Generate an App Password: https://myaccount.google.com/apppasswords
 * 3. Use the 16-character app password instead of your regular password
 * 4. Enable IMAP in Gmail settings: https://mail.google.com/mail/u/0/#settings/fwdandpop
 */

// Create Gmail transporter with app-specific password
export const createGmailTransporter = (emailUser, appPassword) => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: appPassword,
    },
  });
};

// Get user's Gmail configuration
export const getGmailConfig = async (userId) => {
  const user = await User.findById(userId);
  
  if (!user || !user.emailConfig) {
    throw new Error('Email configuration not found. Please configure your email settings.');
  }

  const { email, password } = user.emailConfig;
  
  if (!email || !password) {
    throw new Error('Gmail credentials not configured. Please add your email and app password.');
  }

  return { email, password };
};

// Send email via Gmail
export const sendGmailReply = async (userId, replyData) => {
  try {
    const { email, password } = await getGmailConfig(userId);
    const transporter = createGmailTransporter(email, password);

    const { to, subject, body, inReplyTo, references } = replyData;

    // Prepare email options
    const mailOptions = {
      from: email,
      to,
      subject,
      text: body,
      html: formatEmailBody(body),
    };

    // Add threading headers for proper reply chains
    if (inReplyTo) {
      mailOptions.inReplyTo = inReplyTo;
      mailOptions.references = references || inReplyTo;
    }

    // Send the email
    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Gmail sent successfully:', {
      messageId: info.messageId,
      to,
      subject,
    });

    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
    };
  } catch (error) {
    console.error('❌ Error sending Gmail:', error);
    
    // Provide helpful error messages
    if (error.code === 'EAUTH') {
      throw new Error(
        'Gmail authentication failed. Please ensure you are using an App Password, not your regular Gmail password. ' +
        'Generate one at: https://myaccount.google.com/apppasswords'
      );
    }
    
    if (error.code === 'ESOCKET') {
      throw new Error('Network error. Please check your internet connection.');
    }

    throw new Error(`Failed to send email: ${error.message}`);
  }
};

// Format email body as HTML
const formatEmailBody = (text) => {
  // Convert plain text to HTML with proper formatting
  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 14px;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0;
            padding: 20px;
          }
          .email-content {
            background-color: #ffffff;
            border-radius: 5px;
            padding: 20px;
          }
          .signature {
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid #e5e5e5;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="email-content">
          ${escapedText}
        </div>
        <div class="signature">
          Sent via Email AI Agent
        </div>
      </body>
    </html>
  `;
};

// Verify Gmail connection
export const verifyGmailConnection = async (emailUser, appPassword) => {
  try {
    const transporter = createGmailTransporter(emailUser, appPassword);
    await transporter.verify();
    return { success: true, message: 'Gmail connection verified successfully' };
  } catch (error) {
    console.error('Gmail verification failed:', error);
    
    if (error.code === 'EAUTH') {
      return {
        success: false,
        message: 'Authentication failed. Please use an App Password from https://myaccount.google.com/apppasswords',
      };
    }
    
    return {
      success: false,
      message: `Connection failed: ${error.message}`,
    };
  }
};

// Send test email
export const sendTestEmail = async (userId) => {
  try {
    const { email, password } = await getGmailConfig(userId);
    const transporter = createGmailTransporter(email, password);

    const mailOptions = {
      from: email,
      to: email, // Send test email to yourself
      subject: 'Email AI Agent - Test Email',
      text: 'This is a test email from your Email AI Agent. Gmail integration is working correctly!',
      html: formatEmailBody(
        'This is a test email from your Email AI Agent.\n\n' +
        '✅ Gmail integration is working correctly!\n\n' +
        'You can now send and receive emails through the AI agent.'
      ),
    };

    const info = await transporter.sendMail(mailOptions);
    
    return {
      success: true,
      message: 'Test email sent successfully',
      messageId: info.messageId,
    };
  } catch (error) {
    console.error('Failed to send test email:', error);
    throw error;
  }
};

// Fetch emails from Gmail using IMAP
export const fetchGmailEmails = async (userId, options = {}) => {
  const { limit = 10, searchCriteria = ['UNSEEN'] } = options;

  try {
    const { email, password } = await getGmailConfig(userId);
    console.log("🚀 ~ fetchGmailEmails ~ Connecting to Gmail IMAP for:", email);

    // Create IMAP connection with improved configuration
    const imap = new Imap({
      user: email,
      password: password,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: {
        rejectUnauthorized: false,
        servername: 'imap.gmail.com',
      },
      authTimeout: 10000,
      connTimeout: 10000,
      keepalive: {
        interval: 10000,
        idleInterval: 300000,
        forceNoop: true,
      },
      debug: console.log, // Enable debug logging
    });

    return new Promise((resolve, reject) => {
      const emails = [];
      let fetchCompleted = false;
      let connectionTimeout;

      // Set a timeout for the entire operation
      const operationTimeout = setTimeout(() => {
        console.log('⏱️ IMAP operation timeout - closing connection');
        imap.end();
        reject(new Error('IMAP operation timeout after 30 seconds'));
      }, 30000);

      imap.once('ready', () => {
        console.log('✅ IMAP connection ready');
        clearTimeout(connectionTimeout);
        
        imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            console.error('❌ Error opening INBOX:', err);
            clearTimeout(operationTimeout);
            imap.end();
            return reject(err);
          }

          console.log('📬 INBOX opened, total messages:', box.messages.total);

          // Search for emails
          imap.search(searchCriteria, (err, results) => {
            if (err) {
              console.error('❌ Search error:', err);
              clearTimeout(operationTimeout);
              imap.end();
              return reject(err);
            }

            if (!results || results.length === 0) {
              console.log('📭 No emails found matching criteria');
              clearTimeout(operationTimeout);
              imap.end();
              return resolve([]);
            }

            console.log(`📧 Found ${results.length} emails, fetching last ${limit}...`);

            // Limit the number of emails to fetch
            const emailsToFetch = results.slice(-limit);
            let processedCount = 0;

            const fetch = imap.fetch(emailsToFetch, {
              bodies: '',
              markSeen: false,
            });

            fetch.on('message', (msg, seqno) => {
              console.log(`📨 Processing email #${seqno}`);
              
              msg.on('body', (stream, info) => {
                simpleParser(stream, async (err, parsed) => {
                  if (err) {
                    console.error('Error parsing email:', err);
                    processedCount++;
                    return;
                  }

                  try {
                    // Check if email already exists
                    const existingEmail = await Email.findOne({
                      userId,
                      messageId: parsed.messageId,
                    });

                    if (!existingEmail) {
                      // Create new email in database
                      const newEmail = new Email({
                        userId,
                        from: parsed.from?.text || '',
                        to: parsed.to?.text || '',
                        subject: parsed.subject || '(No Subject)',
                        body: parsed.text || parsed.html || '',
                        messageId: parsed.messageId,
                        inReplyTo: parsed.inReplyTo,
                        status: 'pending',
                        receivedAt: parsed.date || new Date(),
                      });

                      await newEmail.save();
                      emails.push(newEmail);
                      console.log(`✅ Saved new email: ${parsed.subject}`);
                    } else {
                      console.log(`⏭️  Skipped duplicate: ${parsed.subject}`);
                    }
                    processedCount++;
                  } catch (dbError) {
                    console.error('Error saving email to database:', dbError);
                    processedCount++;
                  }
                });
              });

              msg.once('end', () => {
                console.log(`✅ Finished processing email #${seqno}`);
              });
            });

            fetch.once('error', (err) => {
              console.error('❌ Fetch error:', err);
              clearTimeout(operationTimeout);
              imap.end();
              reject(err);
            });

            fetch.once('end', () => {
              console.log('✅ Finished fetching all emails');
              fetchCompleted = true;
              
              // Give a short delay for parsing to complete
              setTimeout(() => {
                clearTimeout(operationTimeout);
                imap.end();
              }, 2000);
            });
          });
        });
      });

      imap.once('error', (err) => {
        console.error('❌ IMAP connection error:', err);
        clearTimeout(connectionTimeout);
        clearTimeout(operationTimeout);
        
        // Provide specific error messages
        if (err.code === 'ECONNRESET') {
          reject(new Error(
            'Connection reset by Gmail. This usually means:\n' +
            '1. IMAP is not enabled in Gmail settings\n' +
            '2. You\'re using your regular password instead of an App Password\n' +
            '3. Too many failed connection attempts\n\n' +
            'Please:\n' +
            '- Enable IMAP: https://mail.google.com/mail/u/0/#settings/fwdandpop\n' +
            '- Use App Password: https://myaccount.google.com/apppasswords\n' +
            '- Wait a few minutes if you\'ve tried multiple times'
          ));
        } else if (err.code === 'ENOTFOUND') {
          reject(new Error('Could not reach Gmail servers. Check your internet connection.'));
        } else if (err.code === 'ETIMEDOUT') {
          reject(new Error('Connection to Gmail timed out. Check your firewall settings.'));
        } else {
          reject(err);
        }
      });

      imap.once('end', () => {
        console.log('🔌 IMAP connection ended');
        clearTimeout(operationTimeout);
        if (fetchCompleted) {
          resolve(emails);
        }
      });

      // Set connection timeout
      connectionTimeout = setTimeout(() => {
        console.log('⏱️ Connection timeout - Gmail not responding');
        imap.end();
        reject(new Error('Connection timeout - Gmail server not responding'));
      }, 15000);

      console.log('🔌 Connecting to Gmail IMAP...');
      imap.connect();
    });
  } catch (error) {
    console.error('❌ Error fetching Gmail emails:', error);
    
    if (error.code === 'EAUTH' || error.textCode === 'AUTHENTICATIONFAILED') {
      throw new Error(
        'Gmail authentication failed. Please ensure:\n' +
        '1. You are using an App Password (not your regular Gmail password)\n' +
        '2. IMAP is enabled in Gmail settings\n\n' +
        'Generate App Password: https://myaccount.google.com/apppasswords\n' +
        'Enable IMAP: https://mail.google.com/mail/u/0/#settings/fwdandpop'
      );
    }
    
    if (error.code === 'ECONNRESET') {
      throw new Error(
        'Connection reset by Gmail. Common causes:\n' +
        '1. IMAP not enabled in Gmail settings - Enable at: https://mail.google.com/mail/u/0/#settings/fwdandpop\n' +
        '2. Using regular password instead of App Password - Generate at: https://myaccount.google.com/apppasswords\n' +
        '3. Too many failed attempts - Wait 5-10 minutes and try again\n' +
        '4. Gmail blocking the connection - Check security settings'
      );
    }
    
    throw new Error(`Failed to fetch emails: ${error.message}`);
  }
};

// Delete Gmail emails by category (promotional, spam, trash, social, updates, purchases, noreply)
export const deleteGmailEmails = async (userId, options = {}) => {
  const { categories = ['promotional', 'spam', 'trash', 'social', 'updates', 'purchases', 'noreply'] } = options;

  try {
    const { email, password } = await getGmailConfig(userId);
    console.log("🗑️ ~ deleteGmailEmails ~ Connecting to Gmail IMAP for:", email);

    // Map categories to Gmail labels/folders with their label names
    // Note: Gmail folder names vary by language/region
    const categoryMap = {
      'promotional': { 
        folders: ['[Gmail]/Promotions', 'Promotions'],
        label: 'Promotions'
      },
      'social': {
        folders: ['[Gmail]/Social', 'Social'],
        label: 'Social'
      },
      'updates': {
        folders: ['[Gmail]/Updates', 'Updates'],
        label: 'Updates'
      },
      'purchases': {
        folders: ['[Gmail]/Purchases', 'Purchases'],
        label: 'Purchases'
      },
      'spam': {
        folders: ['[Gmail]/Spam', 'Spam', 'Junk'],
        label: null
      },
      'trash': {
        folders: ['[Gmail]/Trash', 'Trash', '[Gmail]/Bin'],
        label: null
      },
      'noreply': {
        folders: ['INBOX'],  // Search in INBOX for noreply emails
        label: null,
        searchFrom: 'noreply'  // Special search criteria for FROM field
      },
    };

    // Create IMAP connection
    const imap = new Imap({
      user: email,
      password: password,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: {
        rejectUnauthorized: false,
        servername: 'imap.gmail.com',
      },
      authTimeout: 10000,
      connTimeout: 10000,
      keepalive: {
        interval: 10000,
        idleInterval: 300000,
        forceNoop: true,
      },
    });

    return new Promise((resolve, reject) => {
      let deletedCounts = {};
      let processedCategories = 0;

      const operationTimeout = setTimeout(() => {
        console.log('⏱️ IMAP operation timeout - closing connection');
        imap.end();
        reject(new Error('IMAP operation timeout after 600 seconds'));
      }, 600000);

      imap.once('ready', () => {
        console.log('✅ IMAP connection ready for deletion');

        // First, get list of all mailboxes to find correct folder names
        imap.getBoxes((err, boxes) => {
          if (err) {
            console.error('❌ Error getting mailboxes:', err);
            clearTimeout(operationTimeout);
            imap.end();
            reject(err);
            return;
          }

          // Log mailbox names without circular references
          const getMailboxNames = (boxes, prefix = '') => {
            const names = [];
            for (const [name, box] of Object.entries(boxes)) {
              const fullName = prefix ? `${prefix}/${name}` : name;
              names.push(fullName);
              if (box.children) {
                names.push(...getMailboxNames(box.children, fullName));
              }
            }
            return names;
          };
          console.log('📋 Available mailboxes:', getMailboxNames(boxes));

          const processCategory = (index) => {
            if (index >= categories.length) {
              clearTimeout(operationTimeout);
              imap.end();
              return;
            }

            const category = categories[index];
            const categoryConfig = categoryMap[category];

            if (!categoryConfig) {
              console.log(`⚠️ Unknown category: ${category}, skipping...`);
              deletedCounts[category] = 0;
              processedCategories++;
              processCategory(index + 1);
              return;
            }

            // Try to find the correct folder name from available mailboxes
            let foldersToProcess = [];
            
            // Helper function to check if mailbox exists
            const mailboxExists = (name) => {
              if (boxes[name]) return true;
              // Check in [Gmail] children
              if (name.startsWith('[Gmail]/')) {
                const childName = name.replace('[Gmail]/', '');
                return boxes['[Gmail]'] && boxes['[Gmail]'].children && boxes['[Gmail]'].children[childName];
              }
              return false;
            };
            
            // For categories with Gmail labels (promotional, social, updates, purchases)
            // Delete from both INBOX (with label) and category-specific folder
            if (categoryConfig.label) {
              // Add INBOX with label search for emails categorized by Gmail
              foldersToProcess.push({ 
                folder: 'INBOX', 
                useLabel: true, 
                labelName: categoryConfig.label 
              });
              
              // Also check if category-specific folder exists and add it
              for (const possibleFolder of categoryConfig.folders) {
                if (mailboxExists(possibleFolder)) {
                  foldersToProcess.push({ 
                    folder: possibleFolder, 
                    useLabel: false,
                    labelName: null
                  });
                  break;
                }
              }
            } else if (categoryConfig.searchFrom) {
              // Special case for noreply - search by FROM field
              for (const possibleFolder of categoryConfig.folders) {
                if (mailboxExists(possibleFolder)) {
                  foldersToProcess.push({ 
                    folder: possibleFolder, 
                    useLabel: false,
                    labelName: null,
                    searchFrom: categoryConfig.searchFrom
                  });
                  break;
                }
              }
            } else {
              // For spam/trash, just try to find the folder
              for (const possibleFolder of categoryConfig.folders) {
                if (mailboxExists(possibleFolder)) {
                  foldersToProcess.push({ 
                    folder: possibleFolder, 
                    useLabel: false,
                    labelName: null
                  });
                  break;
                }
              }
            }

            if (foldersToProcess.length === 0) {
              console.log(`⚠️ Could not find folder for category: ${category}, skipping...`);
              deletedCounts[category] = 0;
              processedCategories++;
              processCategory(index + 1);
              return;
            }

            let categoryTotalDeleted = 0;
            let foldersProcessed = 0;

            // Process each folder for this category
            const processFolders = (folderIndex) => {
              if (folderIndex >= foldersToProcess.length) {
                // Done with all folders for this category
                deletedCounts[category] = categoryTotalDeleted;
                processedCategories++;
                processCategory(index + 1);
                return;
              }

              const { folder: folderName, useLabel, labelName, searchFrom } = foldersToProcess[folderIndex];
              console.log(`📂 Opening folder: ${folderName} for category: ${category}${useLabel ? ` (with label search: ${labelName})` : ''}${searchFrom ? ` (searching FROM: ${searchFrom})` : ''}`);

              imap.openBox(folderName, false, (err, box) => {
                if (err) {
                  console.error(`❌ Error opening ${folderName}:`, err);
                  foldersProcessed++;
                  processFolders(folderIndex + 1);
                  return;
                }

                console.log(`📬 ${folderName} opened, total messages: ${box.messages.total}`);

                if (box.messages.total === 0) {
                  console.log(`📭 No emails in ${folderName}`);
                  foldersProcessed++;
                  processFolders(folderIndex + 1);
                  return;
                }

                // Build search criteria based on category
                let searchCriteria = ['ALL'];
                
                if (useLabel && labelName) {
                  // Search for emails with Gmail category label in INBOX
                  searchCriteria = [['X-GM-LABELS', labelName]];
                } else if (searchFrom) {
                  // Search for emails from addresses containing the searchFrom string
                  searchCriteria = [['FROM', searchFrom]];
                }

                console.log(`🔍 Searching with criteria: ${JSON.stringify(searchCriteria)}`);

                // Search for emails in this folder
                imap.search(searchCriteria, (err, results) => {
                  if (err) {
                    console.error(`❌ Search error in ${folderName}:`, err);
                    foldersProcessed++;
                    processFolders(folderIndex + 1);
                    return;
                  }

                  if (!results || results.length === 0) {
                    console.log(`📭 No emails found in ${folderName} for category ${category}`);
                    foldersProcessed++;
                    processFolders(folderIndex + 1);
                    return;
                  }

                  console.log(`🗑️ Deleting ${results.length} emails from ${category} in ${folderName}...`);

                  // Mark all emails for deletion
                  imap.addFlags(results, ['\\Deleted'], (err) => {
                    if (err) {
                      console.error(`❌ Error marking emails for deletion in ${folderName}:`, err);
                      foldersProcessed++;
                      processFolders(folderIndex + 1);
                      return;
                    }

                    // Permanently delete marked emails
                    imap.expunge((err) => {
                      if (err) {
                        console.error(`❌ Error expunging emails in ${folderName}:`, err);
                      } else {
                        console.log(`✅ Deleted ${results.length} emails from ${category} in ${folderName}`);
                        categoryTotalDeleted += results.length;
                      }

                      foldersProcessed++;
                      processFolders(folderIndex + 1);
                    });
                  });
                });
              });
            };

            // Start processing folders for this category
            processFolders(0);
          };

          // Start processing categories
          processCategory(0);
        });
      });

      imap.once('error', (err) => {
        console.error('❌ IMAP connection error:', err);
        clearTimeout(operationTimeout);
        reject(err);
      });

      imap.once('end', () => {
        console.log('🔌 IMAP connection ended');
        clearTimeout(operationTimeout);
        if (processedCategories === categories.length) {
          resolve(deletedCounts);
        }
      });

      console.log('🔌 Connecting to Gmail IMAP for deletion...');
      imap.connect();
    });
  } catch (error) {
    console.error('❌ Error deleting Gmail emails:', error);
    throw new Error(`Failed to delete emails: ${error.message}`);
  }
};

export default {
  sendGmailReply,
  verifyGmailConnection,
  sendTestEmail,
  getGmailConfig,
  fetchGmailEmails,
  deleteGmailEmails,
};

