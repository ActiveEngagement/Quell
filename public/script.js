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


fetch('/upload', { method: 'POST', body: formData })
    .then(response => {
        console.log('Response status:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('Received data from server:', data);
        if (Object.keys(data).length === 0) {
            console.log('No links found in the email');
            results.innerHTML = '<p>No links found in the email.</p>';
        } else {
            displayResults(data);
        }
    })
    .catch(error => console.error('Error:', error));


    function displayResults(data) {
        console.log('Displaying results:', data);
        results.innerHTML = '';
        for (const [link, info] of Object.entries(data)) {
            const linkItem = document.createElement('div');
            linkItem.className = 'link-item';
            linkItem.innerHTML = `
                <div class="link-header">
                    <div>
                        <p><span class="link-count"><p style="color: #8e8e93; display:inline;"></p>${info.count}<p style="color: #8e8e93;display:inline;"> - </p></span><a href="${info.originalLink}" target="_blank" class="link-url">${info.originalLink}</a></p>
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
    
