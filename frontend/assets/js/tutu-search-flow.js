(function () {
  "use strict";

  document.addEventListener("tutu-native:search", function (event) {
    const target = event.target;
    const status = target && typeof target.querySelector === "function"
      ? target.querySelector(".tutu-search-status")
      : null;
    try {
      const request = window.TutuSearchAdapter.mapSearchDetail(event.detail);
      if (status) status.textContent = "";
      window.AppRoutes.goToSearchResults(request);
    } catch (error) {
      event.preventDefault();
      if (status) status.textContent = window.TutuSearchAdapter.messageForLocalError(error);
    }
  });
})();
