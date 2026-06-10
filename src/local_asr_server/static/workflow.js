const Workflow = (() => {
    const listeners = new Set();
    const state = {
        step: 'upload',
        sourcePanel: null,
        selectedFile: null,
        isProcessing: false,
    };

    function getState() {
        return { ...state };
    }

    function update(patch) {
        Object.assign(state, patch);
        listeners.forEach(listener => listener(getState()));
    }

    function subscribe(listener) {
        listeners.add(listener);
        listener(getState());
        return () => listeners.delete(listener);
    }

    return { getState, update, subscribe };
})();
