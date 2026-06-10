const RecordingsView = (() => {
    const PAGE_SIZE = 5;
    let recordings = [];
    let currentPage = 1;
    let selectHandler = null;
    let dom = {};

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
        currentPage = Math.min(Math.max(page, 1), getPageCount());
        render();
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

            const info = document.createElement('div');
            info.className = 'recording-row__info';
            const title = document.createElement('strong');
            title.textContent = recording.title;
            const metadata = document.createElement('span');
            metadata.textContent = `${formatDate(recording.created_at)} · ${Utils.formatBytes(recording.bytes_written)}`;
            info.append(title, metadata);

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn--ghost btn--sm';
            button.textContent = 'Trascrivi';
            button.addEventListener('click', () => selectHandler(recording, button));

            row.append(info, button);
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
