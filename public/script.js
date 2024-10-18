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
            showEmailMenu(id);
        })
        .catch(error => {
            console.error('Error loading or processing email:', error);
            loadingBar.style.display = 'none';
        });
}

function showEmailMenu(emailId) {
    const emailMenu = document.getElementById('emailMenu');
    emailMenu.style.display = 'flex';

    const previewButton = document.getElementById('previewButton');
    const approveButton = document.getElementById('approveButton');
    const rejectButton = document.getElementById('rejectButton');
    const closeButton = document.getElementById('closeButton');
    const deleteButton = document.getElementById('deleteButton');

    previewButton.onclick = () => previewEmail(emailId);
    approveButton.onclick = () => approveEmail(emailId);
    rejectButton.onclick = toggleDropdown; // Change this line
    closeButton.onclick = closeResults;
    deleteButton.onclick = () => deleteEmail(emailId);

    // Set up reject buttons
    const rejectReasons = {
        'rejectSubject': 'Please correct the subject line. Thank you.',
        'rejectFromName': 'Please correct the from name. Thank you.',
        'rejectSourceCode': 'Please correct/add the source code. Thank you.',
        'rejectFirstName': 'Please fix the first name tags. Thank you.',
        'rejectUnsubscribe': 'Please fix the unsubscribe link. Thank you.'
    };

    Object.keys(rejectReasons).forEach(buttonId => {
        document.getElementById(buttonId).onclick = () => {
            rejectEmail(emailId, rejectReasons[buttonId]);
            toggleDropdown(); // Close the dropdown after selecting an option
        };
    });
}

function closeResults() {
    document.getElementById('emailMenu').style.display = 'none';
    document.getElementById('results').innerHTML = '';
}

function previewEmail(emailId) {
    window.open(`/preview/${emailId}`, '_blank');
}

function approveEmail(emailId) {
    console.log(`Approving email: ${emailId}`);
    const approveButton = document.getElementById('approveButton');
    approveButton.disabled = true;
    approveButton.innerHTML = 'Approving...';

    fetch(`/approve/${emailId}`, { method: 'POST' })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          console.log('Email approved successfully');
          approveButton.innerHTML = 'Success!';
          setTimeout(() => {
            closeResults(); // Close the view
            deleteEmail(emailId, false); // Delete the email from the database without confirmation
            loadEmails(currentPage); // Refresh the email list
            approveButton.disabled = false;
            approveButton.innerHTML = '<i class="fas fa-check"></i> Approve'; // Reset button text with icon
          }, 500); // Wait before closing and refreshing
        } else {
          console.error('Error approving email:', data.message);
          alert('Error approving email: ' + data.message);
          approveButton.disabled = false;
          approveButton.innerHTML = '<i class="fas fa-check"></i> Approve';
        }
      })
      .catch(error => {
        console.error('Error:', error);
        alert('An error occurred while approving the email.');
        approveButton.disabled = false;
        approveButton.innerHTML = '<i class="fas fa-check"></i> Approve';
      });
}

function deleteEmail(id, showConfirmation = true) {
    const performDelete = () => {
        fetch(`/emails/${id}`, { method: 'DELETE' })
            .then(response => response.json())
            .then(() => {
                loadEmails(currentPage);
                document.getElementById('emailMenu').style.display = 'none';
                document.getElementById('results').innerHTML = '';
            });
    };

    if (showConfirmation) {
        if (confirm('Are you sure you want to delete this email?')) {
            performDelete();
        }
    } else {
        performDelete();
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
            
            if (data.emails.length === 0) {
                showAllDoneScreen();
            } else {
                hideAllDoneScreen();
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
                            <button onclick="loadEmail(${email.id})"><i class="fas fa-folder-open"></i> Load</button>
                            <button class="delete" onclick="deleteEmail(${email.id})"><i class="fas fa-trash"></i> Delete</button>
                        </div>
                    `;
                    emailRows.appendChild(row);
                });
            }
            
            updatePagination(data.currentPage, Math.ceil(data.totalCount / 10));
        });
}

function showAllDoneScreen() {
    const emailRows = document.getElementById('emailRows');
    emailRows.innerHTML = `
        <div class="all-done-screen">
            <div class="all-done-content">
                <i class="fas fa-check-circle"></i>
                <h2>All done!</h2>
                <p>No emails waiting for approval.</p>
            </div>
        </div>
    `;
}

function hideAllDoneScreen() {
    const allDoneScreen = document.querySelector('.all-done-screen');
    if (allDoneScreen) {
        allDoneScreen.remove();
    }
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

function rejectEmail(emailId, reason) {
    console.log(`Rejecting email: ${emailId} with reason: ${reason}`);
    const rejectButton = document.getElementById('rejectButton');
    rejectButton.disabled = true;
    rejectButton.innerHTML = 'Rejecting...';

    fetch(`/reject/${emailId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: reason }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('Email rejected successfully');
            rejectButton.innerHTML = 'Success!';
            setTimeout(() => {
                closeResults();
                deleteEmail(emailId, false);
                loadEmails(currentPage);
                rejectButton.disabled = false;
                rejectButton.innerHTML = '<i class="fas fa-times"></i> Reject';
            }, 500);
        } else {
            console.error('Error rejecting email:', data.message);
            alert('Error rejecting email: ' + data.message);
            rejectButton.disabled = false;
            rejectButton.innerHTML = '<i class="fas fa-times"></i> Reject';
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred while rejecting the email.');
        rejectButton.disabled = false;
        rejectButton.innerHTML = '<i class="fas fa-times"></i> Reject';
    });
}

// Add this new function
function toggleDropdown() {
    const dropdownContent = document.querySelector('.dropdown-content');
    dropdownContent.classList.toggle('show');
}

// Add this event listener to close the dropdown when clicking outside
document.addEventListener('click', function(event) {
    if (!event.target.matches('#rejectButton') && !event.target.closest('.dropdown-content')) {
        const dropdowns = document.getElementsByClassName('dropdown-content');
        for (let i = 0; i < dropdowns.length; i++) {
            const openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
        }
    }
});
