"use strict";

const { createPlaceholderProvider } = require("./base");

// Key presence is checked server-side only. No request is made in Phase 1.
module.exports = createPlaceholderProvider("stability", ["STABILITY_API_KEY"]);
