import { dismiss, useStore } from "../store";

export function Notifications() {
  const notifications = useStore((s) => s.notifications);
  if (!notifications.length) return null;
  return (
    <div className="notifications_view">
      {notifications.map((n) => (
        <div key={n.id} className={`notification_indicator ${n.error ? "notification_error" : ""}`}>
          <span>{n.text}</span>
          <span className="notification_dismiss" onClick={() => dismiss(n.id)}>
            ✕
          </span>
        </div>
      ))}
    </div>
  );
}
