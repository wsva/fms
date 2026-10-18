// Shared toolbar kit — the single source of truth for the breadcrumb + toolbar
// look across every dataset page. Wraps the class tokens in `@/lib/ui/toolbar`
// so icon sizes, gap, Save/danger semantics, mobile label collapsing, and a11y
// names stay consistent. See that module's header for the conventions.
//
// Website port of learning/fms-app/src/components/ui/toolbar — identical API
// and classes; the only difference is `useIsMobile`, which on the website is a
// viewport-width check (matchMedia) instead of the app's Tauri webview flag.
export { Toolbar } from "./Toolbar";
export { Breadcrumb } from "./Breadcrumb";
export { ToolbarButton } from "./ToolbarButton";
export type { ToolbarButtonVariant } from "./ToolbarButton";
export { ToolbarIconButton } from "./ToolbarIconButton";
export type { ToolbarIconButtonVariant } from "./ToolbarIconButton";
export { ToolbarOverflow } from "./ToolbarOverflow";
export { ToolbarMenuItem } from "./ToolbarMenuItem";
export { RecordButton } from "./RecordButton";
export { MicGlyph } from "./MicGlyph";
