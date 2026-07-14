const STATUS_READY = "Připraven";
const STATUS_LISTENING = "Poslouchám…";
const STATUS_RECOGNIZING = "Rozpoznávám…";
const STATUS_DONE = "Hotovo";
const STATUS_MIC_DENIED = "Mikrofon není povolený";
const STATUS_UNSUPPORTED = "Hlasové ovládání není podporované";

const MIC_DENIED_NOTICE = "Mikrofon není povolený. Povol mikrofon v nastavení prohlížeče a zkus to znovu.";
const UNSUPPORTED_NOTICE = "Hlasové ovládání v tomto prohlížeči nejde. Použij textový dotaz.";
const INSECURE_CONTEXT_NOTICE = "Mikrofon jde spustit jen přes zabezpečené HTTPS připojení.";
const MEDIA_DEVICES_UNSUPPORTED_NOTICE = "Prohlížeč nepodporuje přístup k mikrofonu. Použij textový dotaz.";

function speechRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function errorPayload(errorCode) {
  if ([
    "not-allowed",
    "service-not-allowed",
    "audio-capture",
    "NotAllowedError",
    "PermissionDeniedError",
    "SecurityError",
    "AbortError"
  ].includes(errorCode)) {
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

function mediaPermissionErrorPayload(error) {
  const errorName = error?.name || error?.message || "";

  if (!window.isSecureContext) {
    return {
      status: STATUS_UNSUPPORTED,
      message: INSECURE_CONTEXT_NOTICE
    };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      status: STATUS_UNSUPPORTED,
      message: MEDIA_DEVICES_UNSUPPORTED_NOTICE
    };
  }

  return errorPayload(errorName);
}

async function requestMicrophonePermission() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      ok: false,
      ...errorPayload("unsupported")
    };
  }

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      ...mediaPermissionErrorPayload()
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      ...mediaPermissionErrorPayload(error)
    };
  }
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

  async function start() {
    if (!Recognition) {
      onStatusChange(STATUS_UNSUPPORTED);
      setListening(false);
      onError({
        status: STATUS_UNSUPPORTED,
        message: UNSUPPORTED_NOTICE
      });
      return false;
    }

    const permission = await requestMicrophonePermission();
    if (!permission.ok) {
      onStatusChange(permission.status);
      setListening(false);
      onError({
        status: permission.status,
        message: permission.message
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
