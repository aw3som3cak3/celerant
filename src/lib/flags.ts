// Build-time feature flags. Plain constants so both server and client can import
// them and dead code is tree-shaken when a flag is off.
//
// CATS_ENABLED — the cat collection reward layer (celerant-cat-collection-spec.md).
// OFF for now: the kids keep the OLD reward structure (the family goal counts every
// completed session, no cats, no room) until the feature is finished. Flip to
// `true` and deploy to turn it on; nothing else needs to change. While off, the
// mechanism (reducer, allocation table) is inert: no session is auto-directed to a
// cat, the goal is not the residual, and the room/allocation UI is hidden.
export const CATS_ENABLED = false;
