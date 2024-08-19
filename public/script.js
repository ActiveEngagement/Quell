const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const results = document.getElementById('results');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('highlight');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('highlight'));
dropZone.addEventListener('drop', handleDrop);
fileInput.addEventListener('change', handleFileSelect);

function handleDrop(e) {
    e.preventDefault();
    dropZone.classList.remove('highlight');
    handleFiles(e.dataTransfer.files);
}

function handleFileSelect(e) {
    handleFiles(e.target.files);
}

function handleFiles(files) {
    if (files.length > 0 && files[0].name.endsWith('.eml')) {
        const formData = new FormData();
        formData.append('emlFile', files[0]);

        fetch('/upload', { method: 'POST', body: formData })
            .then(response => response.json())
            .then(displayResults)
            .catch(error => console.error('Error:', error));
    } else {
        alert('Please select a valid .eml file.');
    }
}

function displayResults(data) {
    results.innerHTML = '';
    for (const [link, info] of Object.entries(data)) {
        const linkItem = document.createElement('div');
        linkItem.className = 'link-item';
        linkItem.innerHTML = `
            <p><strong>Link:</strong> ${link} <strong>Count:</strong> ${info.count}</p>
            <button onclick="toggleWrapperHistory(this)">Show Wrapper History</button>
            <div class="wrapper-history">
                ${info.wrapperHistory.map(wrapper => `<p>${wrapper}</p>`).join('')}
            </div>
        `;
        results.appendChild(linkItem);
    }
}

function toggleWrapperHistory(button) {
    const history = button.nextElementSibling;
    if (history.style.display === 'none' || history.style.display === '') {
        history.style.display = 'block';
        button.textContent = 'Hide Wrapper History';
    } else {
        history.style.display = 'none';
        button.textContent = 'Show Wrapper History';
    }
}
