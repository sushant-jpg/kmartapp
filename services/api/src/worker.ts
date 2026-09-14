import { connect } from './lib/db.js';
import { logger } from './lib/logger.js';
await connect();
logger.info('Worker dependencies connected');
