import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  emailConfig: {
    provider: {
      type: String,
      enum: ['gmail', 'outlook', 'custom'],
      default: 'gmail',
    },
    email: String,
    password: String,
    imapHost: String,
    imapPort: Number,
    smtpHost: String,
    smtpPort: Number,
  },
  agentSettings: {
    enabled: {
      type: Boolean,
      default: false,
    },
    autoReply: {
      type: Boolean,
      default: false,
    },
    tone: {
      type: String,
      enum: ['professional', 'casual', 'friendly', 'formal'],
      default: 'professional',
    },
    replyDelay: {
      type: Number,
      default: 5, // minutes
    },
    categories: {
      type: [String],
      default: ['inquiry', 'support', 'sales'],
    },
  },
}, {
  timestamps: true,
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
