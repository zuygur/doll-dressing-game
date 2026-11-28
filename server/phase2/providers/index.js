"use strict";

const mock = require("./mock");
const openai = require("./openai");
const replicate = require("./replicate");
const stability = require("./stability");

const providers = Object.freeze({
  mock,
  openai,
  replicate,
  stability,
});

function getPilotProvider(id) {
  return Object.prototype.hasOwnProperty.call(providers, id) ? providers[id] : null;
}

function listPilotProviders() {
  return Object.values(providers).map((provider) => ({
    id: provider.id,
    label: provider.label,
    implemented: provider.implemented,
    requiresConfirmation: provider.requiresConfirmation,
  }));
}

module.exports = {
  getPilotProvider,
  listPilotProviders,
  pilotProviderIds: Object.freeze(Object.keys(providers)),
};
