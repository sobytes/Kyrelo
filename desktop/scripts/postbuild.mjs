// no-op — kept so package.json's build script doesn't break.
// Earlier this copied standalone assets; we now ship the full .next/ tree
// and run `next start`, so nothing extra to do here.
console.log("postbuild: nothing to do");
