import { dismiss, useStore } from "../store";

export const Notifications = () => {
    const notifications = useStore((s) => s.notifications);
    if (notifications.length === 0) return null;
    return (
        <div className="notifications_view">
            {notifications.map((n) => (
                <div
                    key={n.id}
                    className={`notification_indicator ${n.error ? "notification_error" : ""}`}
                >
                    <span>{n.text}</span>
                    {n.action && (
                        <span className="notification_action" onClick={n.action.run}>
                            {n.action.label}
                        </span>
                    )}
                    <span className="notification_dismiss" onClick={() => dismiss(n.id)}>
                        ✕
                    </span>
                </div>
            ))}
        </div>
    );
};
