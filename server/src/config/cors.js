/**
 * CORS Configuration for ProxiSpeak
 * Allows Vite development server by default and can be configured via CLIENT_URL env var.
 */
export const getAllowedOrigins = () => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  return [clientUrl];
};

export const corsOptions = {
  origin: (origin, callback) => {
    const allowed = getAllowedOrigins();
    // Allow requests with no origin (like mobile apps, curl, or server-to-server)
    if (!origin || allowed.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked request from origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

export default corsOptions;
