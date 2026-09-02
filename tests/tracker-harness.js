window.chrome = {
  runtime: {
    lastError: null,
    sendMessage(message, callback) {
      window.lastTrackedSelection = message.selection;
      const output = document.querySelector("#tracked-selection");
      if (output) output.textContent = `${message.selection.elementName}: ${message.selection.text}`;
      callback?.();
    },
  },
};
