import { openDatabase } from './db/open.js';
import { loadConfig } from './env.js';
import { createLogger } from './logger.js';
import { createApplication } from './server.js';

const logger = createLogger();

try {
  const config = loadConfig();
  const database = openDatabase(config.databasePath);
  const application = createApplication({ config, database, logger });
  application.server.listen(config.port, () => {
    const address = application.server.address();
    logger.log('info', 'server.listening', {
      port: typeof address === 'object' && address ? address.port : config.port,
    });
  });

  const shutdown = () => {
    application
      .close()
      .then(() => database.close())
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  logger.log('error', 'server.start_failed', {
    errorName: error instanceof Error ? error.name : 'unknown',
  });
  process.exitCode = 1;
}
