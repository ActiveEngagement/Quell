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
    console.log('Handling files:', files);
    if (files.length > 0 && files[0].name.endsWith('.eml')) {
        const formData = new FormData();
        formData.append('emlFile', files[0]);

        fetch('/upload', { method: 'POST', body: formData })
            .then(response => response.json())
            .then(data => {
                console.log('Received data from server:', data);
                displayResults(data);
            })
            .catch(error => console.error('Error:', error));
    } else {
        alert('Please select a valid .eml file.');
    }
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
        if (Object.keys(data).length === 0) {
            results.innerHTML = '<p>No links found in the email.</p>';
        } else {
            for (const [link, info] of Object.entries(data)) {
                const linkItem = document.createElement('div');
                linkItem.className = 'link-item';
                linkItem.innerHTML = `
                    <p><strong>Link:</strong> <a href="${info.originalLink}" target="_blank">${info.originalLink}</a></p>
                    <p><strong>Count:</strong> ${info.count}</p>
                    <button onclick="toggleWrapperHistory(this)">Show Wrapper History</button>
                    <div class="wrapper-history" style="display: none;">
                        ${info.wrapperHistory.map(wrapper => `<p>${wrapper}</p>`).join('')}
                    </div>
                `;
                results.appendChild(linkItem);
            }
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
