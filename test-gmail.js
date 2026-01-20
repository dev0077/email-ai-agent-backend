#!/usr/bin/env node

/**
 * Gmail Integration Test Script
 * 
 * This script tests the Gmail integration without needing the full app running.
 * Run with: node test-gmail.js
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const EMAIL_USER = process.env.EMAIL_USER || 'your-email@gmail.com';
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || 'your-app-password';

console.log('🧪 Testing Gmail Integration...\n');
console.log('Email:', EMAIL_USER);
console.log('Password:', EMAIL_PASSWORD ? '✓ Set' : '✗ Not set');
console.log('');

async function testGmailConnection() {
  try {
    console.log('1️⃣  Creating transporter...');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD,
      },
    });

    console.log('2️⃣  Verifying connection...');
    await transporter.verify();
    console.log('✅ Gmail connection verified!\n');

    console.log('3️⃣  Sending test email...');
    const info = await transporter.sendMail({
      from: EMAIL_USER,
      to: EMAIL_USER, // Send to yourself
      subject: 'Email AI Agent - Test Email',
      text: 'This is a test email from the Email AI Agent. Gmail integration is working!',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>✅ Gmail Integration Working!</h2>
          <p>This is a test email from the Email AI Agent.</p>
          <p>If you're seeing this, your Gmail configuration is correct.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">
            Sent via Email AI Agent Test Script
          </p>
        </div>
      `,
    });

    console.log('✅ Test email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('\n📧 Check your inbox:', EMAIL_USER);
    console.log('\n🎉 All tests passed! Gmail integration is working correctly.\n');

  } catch (error) {
    console.error('\n❌ Test failed!');
    console.error('Error:', error.message);
    
    if (error.code === 'EAUTH') {
      console.error('\n💡 Tips:');
      console.error('  - Make sure you\'re using an App Password, not your Gmail password');
      console.error('  - Generate one at: https://myaccount.google.com/apppasswords');
      console.error('  - Enable 2-Factor Authentication first');
    } else if (error.code === 'ESOCKET') {
      console.error('\n💡 Tips:');
      console.error('  - Check your internet connection');
      console.error('  - Make sure Gmail servers are accessible');
    }
    
    console.error('\n');
    process.exit(1);
  }
}

// Run the test
testGmailConnection();

