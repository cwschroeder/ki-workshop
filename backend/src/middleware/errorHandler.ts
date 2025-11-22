import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'ErrorHandler' });

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error(
    {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method
    },
    'Unhandled error'
  );

  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
}
