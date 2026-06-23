const STATUS_READY = "Připraven";
const STATUS_LISTENING = "Poslouchám…";
const STATUS_RECOGNIZING = "Rozpoznávám…";
const STATUS_DONE = "Hotovo";
const STATUS_MIC_DENIED = "Mikrofon není povolený";
const STATUS_UNSUPPORTED = "Hlasové ovládání není podporované";

const MIC_DENIED_NOTICE = "Mikrofon není povolený. Povol ho v prohlížeči nebo použij textový dotaz.";
const UNSUPPORTED_NOTICE = "Hlasové ovládání v tomto prohlížeči nejde. Použij textový dotaz.";

function speechRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function errorPayload(errorCode) {
  if (["not-allowed", "service-not-allowed", "audio-capture"].includes(errorCode)) {
    return {
      status: STATUS_MIC_DENIED,
      message: MIC_DENIED_NOTICE
    };
  }

  if (errorCode === "no-speech" || errorCode === "aborted") {
    return {
      status: STATUS_DONE,
      message: ""
    };
  }

  return {
    status: STATUS_UNSUPPORTED,
    message: UNSUPPORTED_NOTICE
  };
}

export function useSpeechRecognition({
  lang = "cs-CZ",
  onResult = () => {},
  onStatusChange = () => {},
  onListeningChange = () => {},
  onError = () => {}
} = {}) {
  const Recognition = speechRecognitionConstructor();
  let recognition = null;
  let active = false;

  function setListening(nextActive) {
    active = nextActive;
    onListeningChange(active);
  }

  function stop(options = {}) {
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        recognition = null;
      }
    }

    recognition = null;
    setListening(false);

    if (options.status !== false) {
      onStatusChange(STATUS_DONE);
    }
  }

  function start() {
    if (!Recognition) {
      onStatusChange(STATUS_UNSUPPORTED);
      setListening(false);
      onError({
        status: STATUS_UNSUPPORTED,
        message: UNSUPPORTED_NOTICE
      });
      return false;
    }

    stop({ status: false });
    recognition = new Recognition();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      onStatusChange(STATUS_LISTENING);
    };

    recognition.onspeechend = () => {
      onStatusChange(STATUS_RECOGNIZING);
      try {
        recognition?.stop();
      } catch {
        setListening(false);
      }
    };

    recognition.onresult = (event) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || "").trim();
      onStatusChange(STATUS_DONE);
      setListening(false);

      if (transcript) {
        onResult(transcript);
      }
    };

    recognition.onerror = (event) => {
      const payload = errorPayload(event.error);
      onStatusChange(payload.status);
      setListening(false);

      if (payload.message) {
        onError(payload);
      }
    };

    recognition.onend = () => {
      recognition = null;

      if (active) {
        setListening(false);
        onStatusChange(STATUS_DONE);
      }
    };

    try {
      recognition.start();
      return true;
    } catch {
      recognition = null;
      onStatusChange(STATUS_MIC_DENIED);
      setListening(false);
      onError({
        status: STATUS_MIC_DENIED,
        message: MIC_DENIED_NOTICE
      });
      return false;
    }
  }

  return {
    supported: Boolean(Recognition),
    start,
    stop,
    isListening: () => active,
    readyStatus: STATUS_READY
  };
}
