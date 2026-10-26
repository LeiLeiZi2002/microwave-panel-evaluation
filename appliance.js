(function () {
  "use strict";

  window.createAppliance = function (panelHtml, variant) {
    return `
      <div class="appliance-scene">
        <div class="appliance__ground-shadow" aria-hidden="true"></div>
        <div class="appliance">
          <div class="appliance__top" aria-hidden="true"></div>
          <div class="appliance__side" aria-hidden="true"></div>
          <div class="appliance__foot appliance__foot--left" aria-hidden="true"></div>
          <div class="appliance__foot appliance__foot--right" aria-hidden="true"></div>
          <div class="appliance__face" aria-hidden="true"></div>
          <div class="appliance__door" aria-hidden="true">
            <div class="appliance__brand">GE</div>
            <div class="appliance__wordmark">MICROWAVE</div>
            <div class="appliance__window">
              <div class="appliance__cavity"></div>
              <div class="appliance__turntable"></div>
              <div class="appliance__mesh"></div>
              <div class="appliance__reflection"></div>
            </div>
            <div class="appliance__handle"><span></span></div>
            <div class="appliance__door-inset"></div>
          </div>
          <section class="control-panel control-panel--${variant}" aria-label="Microwave control panel">
            ${panelHtml}
          </section>
        </div>
      </div>`;
  };
})();
