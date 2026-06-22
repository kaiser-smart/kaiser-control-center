function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function useUnsavedChangesGuard({
  isDirty,
  saveChanges,
  discardChanges,
  render
}) {
  const state = {
    open: false,
    saving: false,
    error: "",
    pendingNavigation: null
  };

  function hasChanges() {
    try {
      return Boolean(isDirty?.());
    } catch (error) {
      console.error("smart_odpady_unsaved_dirty_check_failed", error);
      return false;
    }
  }

  function resetPrompt() {
    state.open = false;
    state.saving = false;
    state.error = "";
    state.pendingNavigation = null;
  }

  function unmountModal() {
    document
      .querySelectorAll("[data-unsaved-modal-root]")
      .forEach((element) => element.remove());
  }

  function syncModal() {
    unmountModal();

    if (state.open) {
      document.body.insertAdjacentHTML("beforeend", api.renderModal());
    }
  }

  async function runPendingNavigation() {
    const pendingNavigation = state.pendingNavigation;
    resetPrompt();
    unmountModal();

    if (typeof pendingNavigation === "function") {
      await pendingNavigation();
    }
  }

  const api = {
    isDirty: hasChanges,
    unmountModal,

    confirm(pendingNavigation) {
      if (!hasChanges()) {
        if (typeof pendingNavigation === "function") {
          pendingNavigation();
        }
        return true;
      }

      state.open = true;
      state.saving = false;
      state.error = "";
      state.pendingNavigation = pendingNavigation;
      syncModal();
      return false;
    },

    async saveAndContinue() {
      if (!state.open || state.saving) {
        return;
      }

      state.saving = true;
      state.error = "";

      const saved = await saveChanges?.();

      if (!saved) {
        state.saving = false;
        state.error = "Změny se nepodařilo uložit. Zůstáváte na stránce.";
        syncModal();
        return;
      }

      await runPendingNavigation();
    },

    async discardAndContinue() {
      if (!state.open || state.saving) {
        return;
      }

      const pendingNavigation = state.pendingNavigation;
      resetPrompt();
      unmountModal();
      discardChanges?.();

      if (typeof pendingNavigation === "function") {
        await pendingNavigation();
      }
    },

    stay() {
      if (state.saving) {
        return;
      }

      resetPrompt();
      unmountModal();
    },

    beforeUnload(event) {
      if (!hasChanges()) {
        return undefined;
      }

      event.preventDefault();
      event.returnValue = "";
      return "";
    },

    renderModal() {
      if (!state.open) {
        return "";
      }

      const savingAttribute = state.saving ? "disabled" : "";
      const savingText = state.saving ? "Ukládám..." : "Uložit a odejít";

      return `
        <div class="unsaved-changes-backdrop" role="presentation" data-unsaved-modal-root>
          <section
            class="unsaved-changes-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-changes-title"
            aria-describedby="unsaved-changes-description"
          >
            <h2 id="unsaved-changes-title">Neuložené změny</h2>
            <p id="unsaved-changes-description">
              Máte neuložené změny. Chcete je uložit před odchodem?
            </p>
            ${state.error ? `<p class="unsaved-changes-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
            <div class="unsaved-changes-actions">
              <button class="primary-action" type="button" data-unsaved-action="save" ${savingAttribute}>
                ${savingText}
              </button>
              <button class="secondary-link" type="button" data-unsaved-action="discard" ${savingAttribute}>
                Odejít bez uložení
              </button>
              <button class="text-action" type="button" data-unsaved-action="stay" ${savingAttribute}>
                Zůstat na stránce
              </button>
            </div>
          </section>
        </div>
      `;
    }
  };

  return api;
}
