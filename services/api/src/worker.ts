import { connect, disconnect } from "./lib/db.js";
import { logger } from "./lib/logger.js";
import { expireOrders } from "./modules/commerce/order-service.js";
import { processOrderNotifications } from "./modules/engagement/outbox-service.js";

await connect();
let stopping = false;
let wake: (() => void) | undefined;
function stop() {
  stopping = true;
  wake?.();
}
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
logger.info("Order worker started");
try {
  while (!stopping) {
    try {
      await expireOrders();
      await processOrderNotifications();
    } catch (error) {
      logger.error({ err: error }, "Order worker cycle failed");
    }
    if (!stopping)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          wake = undefined;
          resolve();
        }, 5000);
        wake = () => {
          clearTimeout(timer);
          wake = undefined;
          resolve();
        };
      });
  }
} finally {
  await disconnect();
}
