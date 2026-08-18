(function () {
  "use strict";

  var releaseBase = typeof window.TRAVEL_RELEASE_API_BASE === "string"
    ? window.TRAVEL_RELEASE_API_BASE
    : "";

  if (typeof window.TRAVEL_API_BASE !== "string") {
    window.TRAVEL_API_BASE = releaseBase;
  }
}());
