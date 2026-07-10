// Under vitest we import server modules directly in Node. The real `server-only`
// package throws when resolved outside a React Server context; this stub stands
// in for it so the DB/repo/practice modules can be integration-tested.
export {};
