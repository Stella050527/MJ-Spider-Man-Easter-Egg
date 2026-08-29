const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../src/config.js");
const { hasMjToken } = require("../src/trigger-detector.js");
const { isAddressBarMjNavigation, isMjSearchUrl } = require("../src/navigation-detector.js");

test("ships with an editable Ctrl+M shortcut configuration", () => {
  assert.deepEqual(config.shortcut, { enabled: true, key: "m" });
  assert.equal(config.genericClearTriggerEnabled, false);
  assert.equal(config.effectAudioEnabled, true);
});

test("matches an independent mj token immediately before the caret", () => {
  for (const value of ["mj", "MJ", "Mj", "mJ", "abc mj", "abc\tmj", "第一行\nmj"]) {
    assert.equal(hasMjToken(value), true, value);
  }
});

test("does not match mj embedded in another token", () => {
  for (const value of ["", "hello", "image", "emoji", "somethingmj", "mj ", "mj!", "abc-mj"]) {
    assert.equal(hasMjToken(value), false, value);
  }
});

test("effect selection divides the random range into equal halves", () => {
  const { chooseEffect } = require("../src/effect-player.js");
  assert.equal(chooseEffect(0).id, "hang");
  assert.equal(chooseEffect(0.499999).id, "hang");
  assert.equal(chooseEffect(0.5).id, "pose");
  assert.equal(chooseEffect(0.999999).id, "pose");
});

test("recognizes exact mj searches in common search URL parameters", () => {
  assert.equal(isMjSearchUrl("https://www.google.com/search?q=mj"), true);
  assert.equal(isMjSearchUrl("https://www.baidu.com/s?wd=MJ"), true);
  assert.equal(isMjSearchUrl("https://example.com/#/search?query=mJ"), true);
  assert.equal(isMjSearchUrl("https://example.com/search?q=mj%20spider"), false);
  assert.equal(isMjSearchUrl("https://example.com/?id=mj"), false);
});

test("requires a top-frame address-bar navigation", () => {
  const navigation = {
    frameId: 0,
    transitionQualifiers: ["from_address_bar"],
    url: "https://www.google.com/search?q=mj",
  };
  assert.equal(isAddressBarMjNavigation(navigation), true);
  assert.equal(isAddressBarMjNavigation({ ...navigation, frameId: 2 }), false);
  assert.equal(isAddressBarMjNavigation({ ...navigation, transitionQualifiers: [] }), false);
});
