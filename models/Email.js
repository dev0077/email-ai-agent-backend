import mongoose from 'mongoose';

const emailSchema = new mongoose.Schema({
  from: {
    type: String,
    required: true,
  },
  to: {
    type: String,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  body: {
    type: String,
    required: true,
  },
  htmlBody: {
    type: String,
  },
  messageId: {
    type: String,
    unique: true,
    sparse: true,
  },
  inReplyTo: {
    type: String,
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'replied', 'failed', 'ignored'],
    default: 'pending',
  },
  aiResponse: {
    type: String,
  },
  sentiment: {
    type: String,
    enum: ['positive', 'negative', 'neutral', 'urgent'],
  },
  category: {
    type: String,
    enum: ['inquiry', 'complaint', 'support', 'sales', 'general'],
  },
  autoReply: {
    type: Boolean,
    default: false,
  },
  repliedAt: {
    type: Date,
  },
  receivedAt: {
    type: Date,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
});

// Indexes for better query performance
emailSchema.index({ userId: 1, createdAt: -1 });
emailSchema.index({ status: 1 });
emailSchema.index({ messageId: 1 });

const Email = mongoose.model('Email', emailSchema);

export default Email;
