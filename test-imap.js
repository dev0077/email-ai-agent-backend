import Imap from 'imap';
import dotenv from 'dotenv';

dotenv.config();

const email = process.env.EMAIL_USER;
const password = process.env.EMAIL_PASSWORD;

console.log('🧪 Testing Gmail IMAP Connection');
console.log('================================');
console.log('Email:', email);
console.log('Password:', password ? '***' + password.slice(-4) : 'NOT SET');
console.log('');

if (!email || !password) {
  console.error('❌ EMAIL_USER or EMAIL_PASSWORD not set in .env file');
  process.exit(1);
}

console.log('📋 Checklist:');
console.log('1. ✓ Enable 2FA: https://myaccount.google.com/security');
console.log('2. ✓ Generate App Password: https://myaccount.google.com/apppasswords');
console.log('3. ✓ Enable IMAP: https://mail.google.com/mail/u/0/#settings/fwdandpop');
console.log('');

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
  debug: (msg) => console.log('📝 IMAP Debug:', msg),
});

let connectionTimeout = setTimeout(() => {
  console.log('');
  console.log('⏱️  Connection timeout after 15 seconds');
  console.log('');
  console.log('🔍 Troubleshooting:');
  console.log('  1. Check if IMAP is enabled in Gmail:');
  console.log('     https://mail.google.com/mail/u/0/#settings/fwdandpop');
  console.log('  2. Verify you\'re using an App Password (not regular password):');
  console.log('     https://myaccount.google.com/apppasswords');
  console.log('  3. Check your firewall allows port 993');
  console.log('  4. Try waiting 5-10 minutes if you\'ve had multiple failed attempts');
  imap.end();
  process.exit(1);
}, 15000);

imap.once('ready', () => {
  clearTimeout(connectionTimeout);
  console.log('');
  console.log('✅ IMAP Connection Successful!');
  console.log('');
  
  imap.openBox('INBOX', true, (err, box) => {
    if (err) {
      console.error('❌ Error opening INBOX:', err);
      imap.end();
      process.exit(1);
    }
    
    console.log('📬 INBOX Information:');
    console.log('  Total messages:', box.messages.total);
    console.log('  New messages:', box.messages.new);
    console.log('  Unseen messages:', box.messages.unseen);
    console.log('');
    console.log('✅ Gmail IMAP is working correctly!');
    console.log('✅ You can now fetch emails from Gmail');
    
    imap.end();
  });
});

imap.once('error', (err) => {
  clearTimeout(connectionTimeout);
  console.log('');
  console.log('❌ IMAP Connection Error:');
  console.log('   Code:', err.code);
  console.log('   Message:', err.message);
  console.log('');
  
  if (err.code === 'ECONNRESET') {
    console.log('🔍 ECONNRESET - Connection was reset by Gmail');
    console.log('');
    console.log('Common causes:');
    console.log('  1. ⚠️  IMAP not enabled in Gmail settings');
    console.log('     Fix: https://mail.google.com/mail/u/0/#settings/fwdandpop');
    console.log('     Look for "IMAP Access" section and enable IMAP');
    console.log('');
    console.log('  2. ⚠️  Using regular password instead of App Password');
    console.log('     Fix: Generate App Password at https://myaccount.google.com/apppasswords');
    console.log('     Use the 16-character password (no spaces)');
    console.log('');
    console.log('  3. ⚠️  Too many failed connection attempts');
    console.log('     Fix: Wait 5-10 minutes before trying again');
    console.log('');
    console.log('  4. ⚠️  Gmail security blocking the connection');
    console.log('     Fix: Check https://myaccount.google.com/security for alerts');
  } else if (err.code === 'EAUTH' || err.textCode === 'AUTHENTICATIONFAILED') {
    console.log('🔍 AUTHENTICATION FAILED');
    console.log('');
    console.log('Steps to fix:');
    console.log('  1. Go to: https://myaccount.google.com/apppasswords');
    console.log('  2. Generate new App Password for "Email AI Agent"');
    console.log('  3. Copy the 16-character password');
    console.log('  4. Update EMAIL_PASSWORD in your .env file');
    console.log('  5. Remove all spaces from the password');
  } else if (err.code === 'ENOTFOUND') {
    console.log('🔍 Cannot reach Gmail servers');
    console.log('  Fix: Check your internet connection');
  } else if (err.code === 'ETIMEDOUT') {
    console.log('🔍 Connection timeout');
    console.log('  Fix: Check if port 993 is blocked by firewall');
  } else {
    console.log('🔍 Unknown error - see message above');
  }
  
  console.log('');
  process.exit(1);
});

imap.once('end', () => {
  console.log('');
  console.log('🔌 Connection closed');
  process.exit(0);
});

console.log('🔌 Connecting to imap.gmail.com:993...');
imap.connect();
