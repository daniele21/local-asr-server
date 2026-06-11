const RecordingsView = (() => {
    const PAGE_SIZE = 5;
    let recordings = [];
    let currentPage = 1;
    let selectHandler = null;
    let renameHandler = null;
    let dom = {};

    let currentPlayingAudio = null;
    let currentPlayingBtn = null;

    function formatDate(value) {
        try {
            return new Intl.DateTimeFormat('it-IT', {
                dateStyle: 'medium',
                timeStyle: 'short',
            }).format(new Date(value));
        } catch {
            return value;
        }
    }

    function init(options) {
        dom = {
            container: options.container,
            pagination: options.pagination,
            previous: options.previous,
            next: options.next,
            status: options.status,
        };
        selectHandler = options.onSelect;
        renameHandler = options.onRename;
        dom.previous.addEventListener('click', () => setPage(currentPage - 1));
        dom.next.addEventListener('click', () => setPage(currentPage + 1));
    }

    function setItems(items) {
        recordings = items.filter(item => item.audio_file);
        const pageCount = getPageCount();
        currentPage = Math.min(currentPage, pageCount);
        render();
        return recordings.length;
    }

    function getPageCount() {
        return Math.max(1, Math.ceil(recordings.length / PAGE_SIZE));
    }

    function setPage(page) {
        // Stop playing audio when changing page
        stopCurrentAudio();
        currentPage = Math.min(Math.max(page, 1), getPageCount());
        render();
    }

    function stopCurrentAudio() {
        if (currentPlayingAudio) {
            currentPlayingAudio.pause();
            currentPlayingAudio = null;
        }
        if (currentPlayingBtn) {
            currentPlayingBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>`;
            currentPlayingBtn.title = 'Ascolta';
            currentPlayingBtn = null;
        }
    }

    function togglePlay(recording, button) {
        const audioUrl = `/v1/recordings/${recording.id}/audio`;

        if (currentPlayingAudio && currentPlayingBtn === button) {
            // Toggle same audio
            if (currentPlayingAudio.paused) {
                currentPlayingAudio.play();
                button.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>
                    </svg>`;
                button.title = 'Pausa';
            } else {
                currentPlayingAudio.pause();
                button.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>`;
                button.title = 'Ascolta';
            }
            return;
        }

        // Stop current playing
        stopCurrentAudio();

        // Start new audio
        const audio = new Audio(audioUrl);
        currentPlayingAudio = audio;
        currentPlayingBtn = button;

        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>
            </svg>`;
        button.title = 'Pausa';

        audio.play().catch(err => {
            console.error('Audio playback failed:', err);
            Toast.show('Errore durante la riproduzione audio', 'error');
            stopCurrentAudio();
        });

        audio.addEventListener('ended', () => {
            stopCurrentAudio();
        });
    }

    function render() {
        dom.container.replaceChildren();

        if (recordings.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'recordings-list__empty';
            empty.textContent = 'Non ci sono ancora registrazioni.';
            dom.container.appendChild(empty);
            dom.pagination.hidden = true;
            return;
        }

        const start = (currentPage - 1) * PAGE_SIZE;
        recordings.slice(start, start + PAGE_SIZE).forEach(recording => {
            const row = document.createElement('article');
            row.className = 'recording-row';

            // 1. Play Button
            const playBtn = document.createElement('button');
            playBtn.type = 'button';
            playBtn.className = 'row-play-btn';
            playBtn.title = 'Ascolta';
            playBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>`;
            playBtn.addEventListener('click', () => togglePlay(recording, playBtn));

            // 2. Info block (Title and Metadata)
            const info = document.createElement('div');
            info.className = 'recording-row__info';

            const titleContainer = document.createElement('div');
            titleContainer.className = 'recording-title-container';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'recording-title-text';
            titleSpan.textContent = recording.title;

            // Pencil Edit button
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'edit-title-btn';
            editBtn.title = 'Modifica titolo';
            editBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>`;

            // Editing state logic
            editBtn.addEventListener('click', () => {
                // Stop any playing audio
                stopCurrentAudio();

                titleContainer.replaceChildren();

                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'edit-title-input';
                input.value = recording.title;
                input.maxLength = 200;

                const actionContainer = document.createElement('div');
                actionContainer.className = 'edit-title-actions';

                const saveBtn = document.createElement('button');
                saveBtn.type = 'button';
                saveBtn.className = 'edit-title-save';
                saveBtn.title = 'Salva';
                saveBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>`;

                const cancelBtn = document.createElement('button');
                cancelBtn.type = 'button';
                cancelBtn.className = 'edit-title-cancel';
                cancelBtn.title = 'Annulla';
                cancelBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>`;

                async function saveRename() {
                    const newTitle = input.value.trim();
                    saveBtn.disabled = true;
                    cancelBtn.disabled = true;
                    try {
                        const updated = await ApiClient.updateRecording(recording.id, newTitle);
                        recording.title = updated.title;
                        Toast.show('Titolo aggiornato con successo', 'success');
                        if (renameHandler) renameHandler();
                    } catch (error) {
                        Toast.show(`Errore durante il salvataggio: ${error.message}`, 'error');
                        // Restore view
                        render();
                    }
                }

                saveBtn.addEventListener('click', saveRename);
                cancelBtn.addEventListener('click', () => render());

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') saveRename();
                    if (e.key === 'Escape') render();
                });

                actionContainer.append(saveBtn, cancelBtn);
                titleContainer.append(input, actionContainer);
                input.focus();
            });

            titleContainer.append(titleSpan, editBtn);

            const metadata = document.createElement('span');
            metadata.textContent = `${formatDate(recording.created_at)} · ${Utils.formatBytes(recording.bytes_written)}`;
            
            info.append(titleContainer, metadata);

            // 3. Transcribe Button
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn--ghost btn--sm';
            button.textContent = 'Trascrivi';
            button.addEventListener('click', () => {
                stopCurrentAudio();
                selectHandler(recording, button);
            });

            row.append(playBtn, info, button);
            dom.container.appendChild(row);
        });

        const pageCount = getPageCount();
        dom.pagination.hidden = pageCount <= 1;
        dom.previous.disabled = currentPage === 1;
        dom.next.disabled = currentPage === pageCount;
        dom.status.textContent = `Pagina ${currentPage} di ${pageCount}`;
    }

    return { init, setItems };
})();
