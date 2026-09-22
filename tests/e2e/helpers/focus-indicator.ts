export interface FocusIndicatorStyle {
  readonly boxShadow: string;
  readonly outlineStyle: string;
  readonly outlineWidth: number;
}

export function hasVisibleFocusDifference(
  focused: FocusIndicatorStyle,
  unfocused: FocusIndicatorStyle
) {
  const introducedOutline =
    focused.outlineStyle !== "none" &&
    focused.outlineWidth > 0 &&
    (focused.outlineStyle !== unfocused.outlineStyle ||
      focused.outlineWidth !== unfocused.outlineWidth);
  const introducedShadow =
    focused.boxShadow !== "none" && focused.boxShadow !== unfocused.boxShadow;
  return introducedOutline || introducedShadow;
}
