"use strict";

const openai = require("./openai");
const replicate = require("./replicate");
const stability = require("./stability");

const providerMap = Object.freeze({
  openai,
  replicate,
  stability,
});

function getProvider(id) {
  return Object.prototype.hasOwnProperty.call(providerMap, id) ? providerMap[id] : null;
}

module.exports = {
  getProvider,
  providerIds: Object.freeze(Object.keys(providerMap)),
};
