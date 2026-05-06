import type { SessionSnapshot, TextOverlayElement } from "../types";
import { DEFAULT_TEXT_OVERLAY_ELEMENT, renderTextElement } from "../lib/stats";

type Props = {
  snapshot: SessionSnapshot;
  elements?: TextOverlayElement[];
  preview?: boolean;
};

export function TextCanvasOverlay({ snapshot, elements, preview = false }: Props) {
  const items =
    elements && elements.length > 0
      ? elements
      : snapshot.textOverlayElements?.length
        ? snapshot.textOverlayElements
        : [DEFAULT_TEXT_OVERLAY_ELEMENT];

  return (
    <div className={preview ? "text-canvas-preview" : "text-canvas-overlay"}>
      {items.map((element) => (
        <div
          key={element.id}
          className="text-canvas-item"
          style={{
            left: `${element.x}%`,
            top: `${element.y}%`,
            transform: "translate(-50%, -50%)",
            fontFamily: element.fontFamily,
            fontSize: preview ? `${Math.max(10, element.fontSize * 0.18)}px` : `${element.fontSize}px`,
            fontWeight: element.fontWeight,
            color: element.color,
            textAlign: element.align,
            opacity: element.opacity / 100,
          }}
        >
          {renderTextElement(snapshot, element)}
        </div>
      ))}
    </div>
  );
}
