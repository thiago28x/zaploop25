// Fetch and display active sessions
async function refreshSessions() {
    try {
        let response = await fetch('/list-sessions');
        let data = await response.json();
        
        let sessionsList = document.getElementById('sessionsList');
        let sessionSelect = document.getElementById('sessionSelect');
        
        // Clear existing options except the first one
        sessionSelect.innerHTML = '<option value="">Select Session</option>';
        sessionsList.innerHTML = '';

        data.sessions.forEach(sessionId => {
            // Add to sessions list
            let sessionCard = document.createElement('div');
            sessionCard.className = 'session-card';
            sessionCard.innerHTML = `
                <div class="session-info">
                    <span>${sessionId}</span>
                    <div id="status-${sessionId}" class="status-indicator"></div>
                </div>
                <div class="session-actions">
                    <button onclick="viewSessionInfo('${sessionId}')" style="background-color: #2196F3;">Info</button>
                    <button onclick="deleteSession('${sessionId}')" style="background-color: #ff4444;">Delete</button>
                </div>
            `;
            sessionsList.appendChild(sessionCard);

            // Add to select dropdown
            let option = document.createElement('option');
            option.value = sessionId;
            option.textContent = sessionId;
            sessionSelect.appendChild(option);

            // Update status immediately
            updateSessionStatus(sessionId);
        });
    } catch (error) {
        console.error('Error fetching sessions:', error);
        alert('Failed to fetch sessions');
    }
}

async function createSession() {
    let sessionId = document.getElementById('sessionId').value.trim();
    if (!sessionId) {
        alert('Please enter a session ID');
        return;
    }

    try {
        let response = await fetch('/create-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId })
        });

        if (!response.ok) throw new Error('Failed to create session');
        
        alert('Session created successfully! Check the terminal for QR code.');
        document.getElementById('sessionId').value = '';
        refreshSessions();
    } catch (error) {
        console.error('Error creating session:', error);
        alert('Failed to create session');
    }
}

async function sendMessage() {
    let sessionId = document.getElementById('sessionSelect').value;
    let jid = document.getElementById('jid').value.trim();
    let message = document.getElementById('message').value.trim();

    if (!sessionId || !jid || !message) {
        alert('Please fill in all fields');
        return;
    }

    try {
        let response = await fetch('/send-message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId, jid, message })
        });

        if (!response.ok) throw new Error('Failed to send message');

        alert('Message sent successfully!');
        document.getElementById('message').value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message');
    }
}

// Add status indicators to session cards
async function updateSessionStatus(sessionId) {
    try {
        let response = await fetch(`/session-status/${sessionId}`);
        let data = await response.json();
        
        let statusElement = document.querySelector(`#status-${sessionId}`);
        if (statusElement) {
            let state = data.connectionState.state;
            let color = state === 'open' ? '#4CAF50' : 
                       state === 'connecting' ? '#FFA500' : '#ff4444';
            
            statusElement.style.backgroundColor = color;
            statusElement.title = `Status: ${state}`;
        }
    } catch (error) {
        console.error(`Error updating status for ${sessionId}:`, error);
    }
}

// Add session info viewer
async function viewSessionInfo(sessionId) {
    try {
        let response = await fetch(`/session-info/${sessionId}`);
        let data = await response.json();
        
        // Create a modal to display the info
        let modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Session Info: ${sessionId}</h3>
                <div class="info-tabs">
                    <button onclick="showTab('contacts')">Contacts (${Object.keys(data.info.contacts).length})</button>
                    <button onclick="showTab('chats')">Chats (${data.info.chats.length})</button>
                </div>
                <div class="info-content">
                    <pre>${JSON.stringify(data.info, null, 2)}</pre>
                </div>
                <button onclick="this.parentElement.parentElement.remove()">Close</button>
            </div>
        `;
        document.body.appendChild(modal);
    } catch (error) {
        console.error('Error fetching session info:', error);
        alert('Failed to fetch session info');
    }
}

// Refresh sessions when page loads
document.addEventListener('DOMContentLoaded', refreshSessions);

// Refresh sessions every 30 seconds
setInterval(refreshSessions, 30000); 