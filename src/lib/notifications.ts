import "server-only";
import { Notification, User, type NotificationType } from "@/lib/db/models";
import { sendTicketNotificationEmail } from "@/lib/mailer";

type Recipient = { id: string };

export async function notify(
  recipients: Recipient[],
  payload: {
    type: NotificationType;
    ticketId: string;
    ticketNumber: string;
    title: string;
    body: string;
  }
) {
  const ids = [...new Set(recipients.map((r) => r.id).filter(Boolean))];
  if (ids.length === 0) return;
  try {
    // `userId`/`ticketId` are strings; mongoose casts them to ObjectId on insert.
    await Notification.insertMany(
      ids.map((userId) => ({
        userId,
        type: payload.type,
        ticketId: payload.ticketId,
        ticketNumber: payload.ticketNumber,
        title: payload.title,
        body: payload.body,
        read: false,
        createdAt: new Date(),
      }))
    );

    // Best-effort email fan-out (skipped entirely when SMTP is unconfigured).
    // Not awaited: in-app notifications are the source of truth and email
    // delivery must never block or fail ticket operations.
    try {
      const users = await User.find({ _id: { $in: ids } })
        .select("_id email")
        .lean();
      for (const u of users) {
        if (u.email) {
          void sendTicketNotificationEmail(u.email, {
            ticketNumber: payload.ticketNumber,
            title: payload.title,
            body: payload.body,
            type: payload.type,
          });
        }
      }
    } catch (emailErr) {
      console.error("notify() email fan-out failed:", emailErr);
    }
  } catch (err) {
    console.error("notify() failed:", err);
  }
}
