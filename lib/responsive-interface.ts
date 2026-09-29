/** Keep CSS interface queries in sync with these two complementary queries.
 * Compact windows and touch tablets (including large iPads in landscape) use
 * the field app. Wider workstations keep the ERP. any-pointer preserves the
 * tablet layout when a mouse/trackpad is attached.
 */
export const FIELD_INTERFACE_QUERY = "(max-width: 1023px), (max-width: 1400px) and (any-pointer: coarse)";
export const DESKTOP_INTERFACE_QUERY = "(min-width: 1024px) and (not (any-pointer: coarse)), (min-width: 1401px)";
