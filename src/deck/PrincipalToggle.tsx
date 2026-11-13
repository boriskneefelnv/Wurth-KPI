import { useFocus } from "./focus";
import { FONT, T } from "./tokens";

/**
 * Buttons on a slide to switch the view (all principals, or one principal).
 * Clicks here never turn the slide, and the button gives up focus so Space
 * and Enter keep working for the presenter.
 */
export function PrincipalToggle<K extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { key: K; label: string }[];
  selected: K;
  onSelect: (k: K) => void;
}) {
  // A deck for one entity: no buttons, just its name.
  const focus = useFocus();
  if (focus) {
    return <span style={{ display: "inline-flex", padding: "6px 14px", borderRadius: 6, background: T.heroText, color: "#fff", fontFamily: FONT, fontSize: 11.5, fontWeight: 600 }}>{focus}</span>;
  }
  return (
    <div style={{ display: "inline-flex", background: "#EDF3F8", borderRadius: 6, padding: 3, gap: 2 }} onClick={(e) => e.stopPropagation()}>
      {options.map(({ key, label }) => {
        const on = key === selected;
        return (
          <button
            key={key}
            type="button"
            onClick={(e) => {
              onSelect(key);
              e.currentTarget.blur();
            }}
            style={{
              border: 0,
              borderRadius: 4,
              padding: "5px 12px",
              fontFamily: FONT,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
              outline: "none",
              background: on ? T.heroText : "transparent",
              color: on ? "#fff" : T.inbound,
              transition: "background 200ms, color 200ms",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
