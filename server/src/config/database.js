import mongoose from 'mongoose';

/**
 * Connect to MongoDB Atlas using Mongoose.
 */
export const connectDatabase = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('[MongoDB] Connection error: MONGODB_URI is not defined in environment variables.');
    return;
  }

  try {
    await mongoose.connect(uri);
    console.log('[MongoDB] Connected successfully');
  } catch (error) {
    let message = error?.message || String(error);
    if (uri && message.includes(uri)) {
      message = message.replaceAll(uri, '[REDACTED_URI]');
    }
    message = message.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)[^@]+@/gi, '$1*****@');
    console.error(`[MongoDB] Connection failed: ${message}`);
  }
};

export default connectDatabase;
