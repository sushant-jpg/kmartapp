import mongoose from "mongoose";
import { z } from "zod";
import { objectId, orderStatuses } from "@kmart/shared";
import { Outbox } from "../auth/models.js";
import { Notification } from "./models.js";
import { logger } from "../../lib/logger.js";

const payloadSchema = z.object({
  userId: z.preprocess(String, objectId),
  orderId: z.preprocess(String, objectId),
  status: z.enum(orderStatuses),
});

// Both the notification and completion marker commit together. A retry, including
// one from another worker, cannot create a second notification for the same key.
export async function processOrderNotifications() {
  const pending = await Outbox.find({
    kind: "order_notification",
    processedAt: null,
  })
    .select("_id")
    .sort({ _id: 1 })
    .limit(100)
    .lean();
  for (const candidate of pending) {
    try {
      await mongoose.connection.transaction(async (session) => {
        const event = await Outbox.findOne({
          _id: candidate._id,
          processedAt: null,
        })
          .select("+payload")
          .session(session);
        if (!event) return;
        const payload = payloadSchema.parse(event.payload);
        await Notification.updateOne(
          { key: event.key },
          {
            $setOnInsert: {
              key: event.key,
              userId: payload.userId,
              orderId: payload.orderId,
              title: "Order update",
              body: `Your order is now ${payload.status.replaceAll("_", " ")}.`,
            },
          },
          { upsert: true, session, runValidators: true },
        );
        event.processedAt = new Date();
        event.attempts += 1;
        event.lastError = undefined;
        await event.save({ session });
      });
    } catch {
      await Outbox.updateOne(
        { _id: candidate._id, processedAt: null },
        {
          $inc: { attempts: 1 },
          $set: { lastError: "Order notification processing failed" },
        },
      );
      logger.error(
        { outboxId: String(candidate._id) },
        "Order notification processing failed",
      );
    }
  }
}
