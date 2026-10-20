import { Router } from 'express';

const router = Router();

/**
 * @route   GET /health
 * @desc    Health check endpoint for service status verification
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'ProxiSpeak Server'
  });
});

export default router;
