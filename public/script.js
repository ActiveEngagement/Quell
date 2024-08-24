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
fileInput.addEventListener('change', (e) => {
    handleFileSelect(e);
    fileInput.value = ''; // Reset the input value
});

function handleDrop(e) {
    e.preventDefault();
    dropZone.classList.remove('highlight');
    handleFiles(e.dataTransfer.files);
}

function handleFileSelect(e) {
    handleFiles(e.target.files);
}

function resetUI() {
    results.innerHTML = '';
    loadingBar.style.display = 'none';
    const bar = loadingBar.querySelector('.loading-bar');
    bar.style.width = '0%';
}

let currentPage = 1;

function loadEmails(page = 1) {
    fetch(`/emails?page=${page}`)
        .then(response => response.json())
        .then(data => {
            const emailRows = document.getElementById('emailRows');
            emailRows.innerHTML = '';
            data.emails.forEach(email => {
                const row = document.createElement('div');
                row.className = 'email-row';
                row.innerHTML = `
                    <div class="email-info">
                        <span class="email-subject">${email.subject}</span>
                        <span class="email-from">${email.from}</span>
                        <span class="email-date">${new Date(email.received_at).toLocaleString()}</span>
                    </div>
                    <div class="email-actions">
                        <button onclick="loadEmail(${email.id})">Load</button>
                        <button class="delete" onclick="deleteEmail(${email.id})">Delete</button>
                    </div>
                `;
                emailRows.appendChild(row);
            });
            updatePagination(data.currentPage, Math.ceil(data.totalCount / 10));
        });
}


function updatePagination(currentPage, totalPages) {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';
    if (totalPages > 1) {
        const prevButton = document.createElement('button');
        prevButton.textContent = 'Previous';
        prevButton.disabled = currentPage === 1;
        prevButton.onclick = () => loadEmails(currentPage - 1);
        pagination.appendChild(prevButton);

        const nextButton = document.createElement('button');
        nextButton.textContent = 'Next';
        nextButton.disabled = currentPage === totalPages;
        nextButton.onclick = () => loadEmails(currentPage + 1);
        pagination.appendChild(nextButton);
    }
}


function loadEmail(id) {
    resetUI();
    loadingBar.style.display = 'block';
    animateLoadingBar();

    fetch(`/emails/${id}`)
        .then(response => response.json())
        .then(data => {
            const formData = new FormData();
            formData.append('emailContent', data.email_content);
            
            return fetch('/upload', {
                method: 'POST',
                body: formData
            });
        })
        .then(response => response.json())
        .then(processedData => {
            loadingBar.style.display = 'none';
            displayResults(processedData);
        })
        .catch(error => {
            console.error('Error loading or processing email:', error);
            loadingBar.style.display = 'none';
        });
}







function deleteEmail(id) {
    if (confirm('Are you sure you want to delete this email?')) {
        fetch(`/emails/${id}`, { method: 'DELETE' })
            .then(response => response.json())
            .then(() => {
                loadEmails(currentPage);
            });
    }
}

// Load emails when the page loads
document.addEventListener('DOMContentLoaded', () => {
    loadEmails();
    
    const refreshButton = document.getElementById('refreshButton');
    refreshButton.addEventListener('click', () => {
        refreshButton.classList.add('spinning');
        loadEmails().then(() => {
            setTimeout(() => {
                refreshButton.classList.remove('spinning');
            }, 500);
        });
    });
});

function loadEmails(page = 1) {
    return fetch(`/emails?page=${page}`)
        .then(response => response.json())
        .then(data => {
            const emailRows = document.getElementById('emailRows');
            emailRows.innerHTML = '';
            data.emails.forEach(email => {
                const row = document.createElement('div');
                row.className = 'email-row';
                row.innerHTML = `
                    <div class="email-info">
                        <span class="email-subject">${email.subject}</span>
                        <span class="email-from">${email.from}</span>
                        <span class="email-date">${new Date(email.received_at).toLocaleString()}</span>
                    </div>
                    <div class="email-actions">
                        <button onclick="loadEmail(${email.id})">Load</button>
                        <button class="delete" onclick="deleteEmail(${email.id})">Delete</button>
                    </div>
                `;
                emailRows.appendChild(row);
            });
            updatePagination(data.currentPage, Math.ceil(data.totalCount / 10));
        });
}

const loadingBar = document.getElementById('loadingBar');

function handleFiles(files) {
    console.log('Handling files:', files);
    if (files.length > 0 && files[0].name.endsWith('.eml')) {
        resetUI();
        const formData = new FormData();
        formData.append('emlFile', files[0]);

        loadingBar.style.display = 'block';
        const bar = loadingBar.querySelector('.loading-bar');
        bar.style.width = '0%';

        fetch('/upload', { method: 'POST', body: formData })
            .then(response => response.json())
            .then(data => {
                console.log('Received data from server:', data);
                loadingBar.style.display = 'none';
                displayResults(data);
            })
            .catch(error => {
                console.error('Error:', error);
                loadingBar.style.display = 'none';
            });

        animateLoadingBar();
    } else {
        alert('Please select a valid .eml file.');
    }
}

function animateLoadingBar() {
    const bar = loadingBar.querySelector('.loading-bar');
    let width = 30;
    const interval = setInterval(() => {
        if (width >= 90) {
            clearInterval(interval);
        } else {
            width += 5;
            bar.style.width = width + '%';
        }
    }, 500);
}

function displayResults(data) {
    console.log('Displaying results:', data);
    results.innerHTML = '';
    for (const [link, info] of Object.entries(data)) {
        const linkItem = document.createElement('div');
        linkItem.className = 'link-item';
        linkItem.innerHTML = `
            <div class="link-context">${info.contexts.join(' <span class="separator">|</span> ')}</div>
            <div class="link-header">
                <div>
                    <p><span class="link-count">${info.count} - </span><a href="${info.originalLink}" target="_blank" class="link-url">${info.originalLink}</a></p>
                </div>
                <i class="fas fa-chevron-down dropdown-arrow" onclick="toggleWrapperHistory(this)"></i>
            </div>
            <div class="wrapper-history">
                ${info.wrapperHistory.map(wrapper => `<p class="wrapper-url">${wrapper}</p>`).join('')}
            </div>
        `;
        results.appendChild(linkItem);
    }
}


function toggleWrapperHistory(arrow) {
    const linkItem = arrow.closest('.link-item');
    const history = linkItem.querySelector('.wrapper-history');
    arrow.classList.toggle('open');
    history.style.maxHeight = history.style.maxHeight ? null : history.scrollHeight + "px";
}
