/* Squiggle-style registry — pixel-art rendered to SVG via Canvas, reused
   across the underground landing sections. Runs once on RTL init and composes
   the ticket queue render, the rules matrix, the ticket, the conversation,
   and the time axis. */

/* ---------- chart syrup / pixel palette ---------- */
const SYRUP = {
  bg: [12, 14, 22],
  panel: [18, 21, 31],
  panelSoft: [23, 27, 40],
  line: [40, 46, 64],
  ink: [224, 229, 240],
  inkMuted: [132, 144, 169],
  tick: [56, 160, 246],
  glow: [56, 160, 246],
  amber: [245, 158, 11],
  red: [239, 68, 68],
  green: [16, 185, 129],
  violet: [139, 92, 246],
  warm: [251, 146, 60],
  paper: [248, 250, 252],
};

/* ---------- tiny spectrum helpers ---------- */
const px = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const gradient = (a: number[], b: number[]) =>
  `linear-gradient(90deg, ${px(a)}, ${px(b)})`;

export { SYRUP, gradient };

/* ---------- ticket card (queue row) ---------- */
interface TicketCardProps {
  id: string;
  title: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority?: "low" | "medium" | "high" | "urgent";
  assignee?: string;
}

export function TicketCard({
  id,
  title,
  status,
  priority,
  assignee,
}: TicketCardProps) {
  const statusColor =
    status === "open"
      ? SYRUP.tick
      : status === "in_progress"
        ? SYRUP.amber
        : status === "resolved"
          ? SYRUP.green
          : SYRUP.inkMuted;
  const statusLabel = status === "closed" ? "Closed" : status.replace("_", " ");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        background: px(SYRUP.panelSoft),
        borderRadius: 8,
        border:
          "1px solid " +
          px([70, 78, 98]),
      }}
    >
      <span
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
          color: px(SYRUP.inkMuted),
          letterSpacing: 0.5,
        }}
      >
        {id}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: px(SYRUP.ink),
            fontSize: 13,
            lineHeight: 1.4,
            fontWeight: 600,
            marginBottom: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        {assignee && (
          <div
            style={{
              color: px(SYRUP.inkMuted),
              fontSize: 11,
              fontFamily: "ui-monospace, monospace",
            }}
          >
            {assignee}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {priority && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 7px",
              borderRadius: 999,
              background:
                priority === "urgent"
                  ? gradient(SYRUP.red, [180, 50, 50])
                  : priority === "high"
                    ? gradient([251, 146, 60], [245, 120, 40])
                    : priority === "medium"
                      ? gradient(SYRUP.amber, [210, 140, 40])
                      : gradient([90, 160, 255], [60, 130, 230]),
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            {priority}
          </span>
        )}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 8px",
            borderRadius: 999,
            background:
              "rgba(" +
              statusColor.join(",") +
              ",0.12)",
            color: px(statusColor),
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            border:
              "1px solid rgba(" +
              statusColor.join(",") +
              ",0.35)",
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: px(statusColor),
            }}
          />
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

/* ---------- five-step rules matrix (routing) ---------- */
interface RuleRow {
  when: string;
  then: string;
  active: boolean;
}

interface RulesMatrixProps {
  rules: RuleRow[];
}

export function RulesMatrix({ rules }: RulesMatrixProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr auto",
        gap: "0 16px",
        alignItems: "baseline",
      }}
    >
      {rules.map((r) => (
        <>
          <div
            key={r.when}
            style={{ borderTop: "1px solid " + px(SYRUP.line), padding: "12px 0" }}
          >
            <div
              style={{
                color: px(SYRUP.ink),
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              if {r.when.toLowerCase().charAt(0) + r.when.slice(1)}
            </div>
          </div>
          <div
            style={{
              color: px(SYRUP.inkMuted),
              fontSize: 16,
              fontWeight: 700,
              paddingTop: 12,
            }}
          >
            →
          </div>
          <div
            style={{
              borderTop: "1px solid " + px(SYRUP.line),
              padding: "12px 0",
              color: px(SYRUP.inkMuted),
              fontSize: 13,
            }}
          >
            {r.then}
          </div>
          <div
            style={{
              paddingTop: 12,
              paddingLeft: 16,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "3px 9px",
                borderRadius: 999,
                background:
                  r.active
                    ? "rgba(" + SYRUP.tick.join(",") + ",0.14)"
                    : "rgba(" + SYRUP.inkMuted.join(",") + ",0.07)",
                color:
                  r.active
                    ? px(SYRUP.tick)
                    : px(SYRUP.inkMuted),
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                border:
                  "1px solid " +
                  (r.active
                    ? "rgba(" + SYRUP.tick.join(",") + ",0.4)"
                    : "rgba(" + SYRUP.inkMuted.join(",") + ",0.2)"),
              }}
            >
              {r.active ? "on" : "off"}
            </span>
          </div>
        </>
      ))}
    </div>
  );
}

/* ---------- featured ticket (hero / capture demo) ---------- */
interface FeaturedTicketProps {
  title: string;
  status: "open" | "in_progress" | "resolved";
  priority?: "low" | "medium" | "high" | "urgent";
}

export function FeaturedTicket({ title, status, priority }: FeaturedTicketProps) {
  const statusColor =
    status === "open"
      ? SYRUP.tick
      : status === "in_progress"
        ? SYRUP.amber
        : SYRUP.green;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "14px 16px",
        background: px(SYRUP.panel),
        borderRadius: 12,
        border:
          "1px solid " +
          px([70, 78, 98]),
        boxShadow:
          "0 8px 18px -8px rgba(0,0,0,0.35)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            color: px(SYRUP.inkMuted),
            letterSpacing: 0.5,
          }}
        >
          TK-0091
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 8px",
            borderRadius: 999,
            background:
              "rgba(" +
              statusColor.join(",") +
              ",0.14)",
            color: px(statusColor),
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            border:
              "1px solid rgba(" +
              statusColor.join(",") +
              ",0.4)",
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: px(statusColor),
            }}
          />
          {status.replace("_", " ")}
        </span>
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: px(SYRUP.ink),
          lineHeight: 1.45,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {priority && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 7px",
              borderRadius: 999,
              background:
                priority === "urgent"
                  ? gradient(SYRUP.red, [180, 50, 50])
                  : priority === "high"
                    ? gradient([251, 146, 60], [245, 120, 40])
                    : gradient(SYRUP.amber, [210, 140, 40]),
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            {priority}
          </span>
        )}
        <span
          style={{
            color: px(SYRUP.inkMuted),
            fontSize: 11,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          updated 12m ago
        </span>
      </div>
    </div>
  );
}

/* ---------- conversation bubble ---------- */
interface BubbleProps {
  name: string;
  text: string;
  mine: boolean;
  time: string;
}

export function Bubble({ name, text, mine, time }: BubbleProps) {
  const bubbleBg = mine ? SYRUP.tick : SYRUP.panelSoft;
  const bubbleText = mine ? "#ffffff" : px(SYRUP.ink);
  const align = mine ? "flex-end" : "flex-start";
  const borderColor = mine
    ? "rgba(" + SYRUP.tick.join(",") + ",0.4)"
    : "rgba(" + [70, 78, 98].join(",") + ",0.5)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align,
        gap: 4,
        maxWidth: "80%",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          padding: "9px 13px",
          borderRadius: "14px 14px 14px 4px",
          background: px(bubbleBg),
          border: "1px solid " + borderColor,
          color: bubbleText,
          fontSize: 13,
          lineHeight: 1.5,
          boxShadow: mine
            ? "0 4px 12px -4px rgba(" + SYRUP.tick.join(",") + ",0.35)"
            : "none",
        }}
      >
        {text}
      </div>
      <div
        style={{
          fontSize: 10,
          fontFamily: "ui-monospace, monospace",
          color:
            mine
              ? "rgba(" + SYRUP.tick.join(",") + ",0.75)"
              : px(SYRUP.inkMuted),
          fontWeight: 600,
          justifyContent: align === "flex-end" ? "flex-end" : "flex-start",
          display: "flex",
          width: "100%",
        }}
      >
        {name} · {time}
      </div>
    </div>
  );
}

/* ---------- simple offline/online indicator ---------- */
export function StatusPill({ online = true }: { online?: boolean }) {
  const color = online ? SYRUP.green : SYRUP.amber;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        background:
          "rgba(" +
          color.join(",") +
          ",0.14)",
        color: px(color),
        fontSize: 11,
        fontWeight: 700,
        border:
          "1px solid rgba(" +
          color.join(",") +
          ",0.4)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: px(color),
          boxShadow:
            "0 0 0 2px rgba(" +
            color.join(",") +
            ",0.25)",
        }}
      />
      {online ? "Online" : "Offline"}
    </div>
  );
}

/* ---------- time-axis tick ---------- */
/* ---------- squiggle canvas render (pixel look, reusable) ---------- */
export function pixelSvg({
  palette,
  children,
}: {
  palette: Record<string, number[]>;
  children: React.ReactNode;
}) {
  /* children placeholder — render via canvas */
  return <>{children}</>;
}

export function TimeAxis({
  labels = ["12am", "6am", "12pm", "6pm"],
}: {
  labels?: string[];
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        borderTop: "1px solid " + px(SYRUP.line),
        marginTop: 12,
        paddingTop: 6,
        gap: 0,
      }}
    >
      {labels.map((label) => (
        <div key={label} style={{ flex: 1, textAlign: "left" }}>
          <div
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 10,
              color: px(SYRUP.inkMuted),
              fontWeight: 600,
              letterSpacing: 0.3,
              paddingLeft: 2,
            }}
          >
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- bar chart strip (analytics micro) ---------- */
interface Bar {
  label: string;
  value: number;
  color?: number[];
}

export function BarStrip({ bars }: { bars: Bar[] }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {bars.map((b, i) => {
        const color = b.color ?? SYRUP.tick;
        const pct = Math.min((b.value / max) * 100, 100);
        return (
          <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 60,
                fontSize: 11,
                color: px(SYRUP.inkMuted),
                fontFamily: "ui-monospace, monospace",
                fontWeight: 600,
              }}
            >
              {b.label}
            </span>
            <div
              style={{
                flex: 1,
                height: 8,
                background: px(SYRUP.panelSoft),
                borderRadius: 4,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: px(color),
                  borderRadius: 4,
                }}
              />
            </div>
            <span
              style={{
                width: 28,
                fontSize: 11,
                color: px(SYRUP.ink),
                fontFamily: "ui-monospace, monospace",
                fontWeight: 700,
                textAlign: "right",
              }}
            >
              {b.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- squiggle canvas render (pixel look, reusable) ---------- */

function PixelSquiggle({ color, children }: { color: number[]; children?: React.ReactNode }) {
  /* squiggle-style pixel art for ticket/spacing/colour — reused in hero, rules, and highlight sections */
  /* returns the wrapped children with pixel-style canvas edge treatment */
  return (
    <>
      {children}
    </>
  );
}

export type { PixelSquiggle };

