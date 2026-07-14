// Cat sprite sheets (ToffeeCraft "AllCatsPaid" pack). Each animation is a
// horizontal strip of 32×32 frames served from /cats/<catId>/<anim>.png. Every
// cat shares the same layout — idle & walk are 7 frames, sit & sleep are 3 — so
// the room animates them uniformly. This is the art integration the emoji
// placeholder used to stand in for; `spriteId` on a roster item names the folder.
export const CAT_FRAME = 32; // px, one frame (square)
export const CAT_FRAMES = { idle: 7, walk: 7, sit: 3, sleep: 3 } as const;
export type CatAnim = keyof typeof CAT_FRAMES;
