import { expect, it } from "vitest";
import mongoose from "mongoose";
import { useDatabase } from "./database.js";
import { Outbox } from "../src/modules/auth/models.js";
import { Notification } from "../src/modules/engagement/models.js";
import { processOrderNotifications } from "../src/modules/engagement/outbox-service.js";
useDatabase();
it("delivers durable order events once across concurrent workers and retries", async () => {
  await Promise.all([Outbox.init(), Notification.init()]);
  const userId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const event = await Outbox.create({
    kind: "order_notification",
    key: "order-confirmed",
    payload: { userId, orderId, status: "confirmed" },
  });
  await Promise.all([processOrderNotifications(), processOrderNotifications()]);
  await processOrderNotifications();
  expect(await Notification.countDocuments({ key: event.key })).toBe(1);
  const notification = await Notification.findOne({ key: event.key });
  expect(String(notification?.userId)).toBe(String(userId));
  expect(String(notification?.orderId)).toBe(String(orderId));
  expect(notification?.body).toContain("confirmed");
  expect((await Outbox.findById(event._id))?.processedAt).toBeInstanceOf(Date);
});
it("retains unsupported and malformed events without reporting successful delivery", async () => {
  const unsupported = await Outbox.create({
    kind: "password_reset",
    key: "email-not-supported",
    payload: { token: "do-not-log" },
  });
  const malformed = await Outbox.create({
    kind: "order_notification",
    key: "bad-order-event",
    payload: { status: "invalid" },
  });
  await processOrderNotifications();
  expect((await Outbox.findById(unsupported._id))?.processedAt).toBeUndefined();
  const failed = await Outbox.findById(malformed._id);
  expect(failed?.processedAt).toBeUndefined();
  expect(failed?.attempts).toBe(1);
  expect(await Notification.countDocuments({ key: malformed.key })).toBe(0);
});
