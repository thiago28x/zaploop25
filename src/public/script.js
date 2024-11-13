async function deleteSession(sessionId) {
    console.log(`deleteSession: sessionId: ${sessionId}\n`);
    
    try {
        let response = await fetch(`/session/${sessionId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete session');

        toastr.success('Session deleted successfully');
        refreshSessions();
    } catch (error) {
        console.error(`deleteSession: Error deleting session: ${error}\n`);
        toastr.error('Failed to delete session');
    }
}

//DO NOT DELETE REST OF THE CODE

// Fetch and display active sessions
async function refreshSessions() {
    let sessionsList = document.getElementById('sessionsList');
    let placeholder = document.getElementById('sessionListPlaceholder');
    
    try {
        let response = await fetch('/list-sessions');
        let data = await response.json();
        
        sessionsList.innerHTML = '';
        
        if (data.sessions && data.sessions.length > 0) {
            placeholder.style.display = 'none';
            
            for (let sessionId of data.sessions) {
                // Get status for each session
                let statusResponse = await fetch(`/session-status/${sessionId}`);
                let statusData = await statusResponse.json();
                
                let isConnected = statusData.connectionState.state === 'open';
                let statusIcon = isConnected ? 
                    '<i class="ph ph-circle-fill" style="color: #4CAF50;"></i>' : 
                    '<i class="ph ph-circle-fill" style="color: #f44336;"></i>';
                
                sessionsList.innerHTML += `
                    <div class="session-item">
                        ${statusIcon}
                        <span>${sessionId}</span>
                        <span class="status-text">${isConnected ? 'Connected' : 'Disconnected'}</span>
                        <button onclick="deleteSession('${sessionId}')" class="delete-btn">
                            <i class="ph ph-trash"></i>
                        </button>
                    </div>
                `;
            }
        } else {
            placeholder.style.display = 'block';
        }
    } catch (error) {
        console.error(`refreshSessions: Error refreshing sessions: ${error}\n`);
        toastr.error('Failed to refresh sessions');
    }
}

async function createSession() {
    let sessionId = document.getElementById('sessionId').value.trim();
    console.log(`createSession: sessionId: ${sessionId}\n`);

    if (!sessionId) {
        toastr.error('Please enter a session ID');
        return;
    }

    try {
        let response = await fetch('/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId })
        });

        if (!response.ok) throw new Error('Failed to create session');
        
        let data = await response.json();
        
        // Clear any existing QR code modal
        let existingModal = document.querySelector('.modal');
        if (existingModal) existingModal.remove();

        // Create modal for QR code
        let modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Creating session: ${sessionId}</h3>
                <div class="loading-spinner"></div>
            </div>
        `;
        document.body.appendChild(modal);

        // Generate QR code if available
        if (data.qrCode) {
            // Convert the comma-separated string to a proper format
            let qrData = data.qrCode;
            if (typeof qrData === 'string' && qrData.includes(',')) {
                // If it's the comma-separated format, join it
                qrData = qrData.split(',').join('');
            }

            // Create new QR code
            let qrContainer = document.getElementById(`qrcode-${sessionId}`);
            qrContainer.innerHTML = ''; // Clear existing content
            
            new QRCode(qrContainer, {
                text: qrData,
                width: 256,
                height: 256,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });

            toastr.success('Session created. Scan the QR code to connect.');
        } else {
            toastr.warning('Session created but no QR code was generated.');
        }

        document.getElementById('sessionId').value = '';
    } catch (error) {
        console.error(`createSession: Error creating session: ${error}\n`);
        toastr.error('Failed to create session');
    }
}

async function sendMessage() {
    let sessionId = document.getElementById('sessionSelect').value;
    let jid = document.getElementById('jid').value.trim();
    let message = document.getElementById('message').value.trim();

    if (!sessionId || !jid || !message) {
        toastr.error('Please fill in all fields');
        return;
    }

    console.log(`sendMessage: sessionId: ${sessionId}, jid: ${jid}, message: ${message}\n`);

    try {
        let response = await fetch('/send-message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId, jid, message })
        });

        if (!response.ok) throw new Error('Failed to send message');

        toastr.success('Message sent successfully!');
        document.getElementById('jid').value = '';
        document.getElementById('message').value = '';
    } catch (error) {
        console.error(`sendMessage: Error sending message: ${error}\n`);
        toastr.error('Failed to send message');
    }
}

//send image
async function sendImage() {
    let sessionId = document.getElementById('imageSessionSelect').value;
    let jid = document.getElementById('imageJid').value.trim();
    let imageUrl = document.getElementById('imageUrl').value.trim();
    let caption = document.getElementById('imageCaption').value.trim();

    console.log(`sendImage: sessionId: ${sessionId}, jid: ${jid}, imageUrl: ${imageUrl}, caption: ${caption}\n`);

    try {
        let response = await fetch('/send-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId, jid, imageUrl, caption })
        });

        if (!response.ok) throw new Error('Failed to send image');

        toastr.success('Image sent successfully!');
      //  document.getElementById('imageUrl').value = '';
      //  document.getElementById('caption').value = '';
    } catch (error) {
        console.error(`sendImage: Error sending image: ${error}\n`);
        toastr.error('Failed to send image');
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


async function getServerStatus() {
    try {
        let response = await fetch('/server-status');
        let data = await response.json();

        updateResourceBar('ramBar', data.ram.used, data.ram.total);
        updateResourceBar('cpuBar', data.cpu.used, data.cpu.total);
        updateResourceBar('diskBar', data.disk.used, data.disk.total);
    } catch (error) {
        console.error('Error fetching server status:', error);
        toastr.error('Failed to fetch server status');
    }
}

function updateResourceBar(barId, used, total) {
    let bar = document.getElementById(barId);
    let fill = bar.querySelector('.bar-fill');
    let text = bar.querySelector('.bar-text');

    let percentage = (parseFloat(used) / parseFloat(total)) * 100;
    fill.style.width = `${percentage}%`;
    text.textContent = `${used} / ${total}`;
}


// Add session info viewer
async function viewSessionInfo(sessionId) {
    console.log(`viewSessionInfo: sessionId: ${sessionId}\n`);
    
    try {
        let response = await fetch(`/session-info/${sessionId}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch session info');
        }

        let data = await response.json();
        
        // Create a modal to display the info
        let modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
            <h3>Session Info: ${sessionId}</h3>
            <div class="info-tabs">
                <button onclick="showTab('contacts')">Contacts (${Object.keys(data.contacts).length})</button>
                <button onclick="showTab('chats')">Chats (${data.chats.length})</button>
                <button onclick="showTab('messages')">Messages (${data.messages.length})</button>
            </div>
            <div class="info-content">
                <pre>${JSON.stringify(data.info, null, 2)}</pre>
            </div>
            <button onclick="this.parentElement.parentElement.remove()">Close</button>
            </div>
        `;
        document.body.appendChild(modal);
    } catch (error) {
        console.error(`viewSessionInfo: Error fetching session info: ${error}\n`);
        toastr.error('Failed to fetch session info');
    }
}
// Refresh sessions when page loads
document.addEventListener('DOMContentLoaded', refreshSessions);

// Refresh sessions every 30 seconds
//setInterval(refreshSessions, 30000); 

async function getSessionChats(sessionId) {
    try {
        let response = await fetch(`/session-chats-direct/${sessionId}`);
        let data = await response.json();
        
        if (data.status === "success") {
            console.log(`Retrieved ${data.count} chats`);
            return data.chats;
        }
    } catch (error) {
        console.error(`Error fetching chats: ${error}\n`);
        toastr.error('Failed to fetch chats');
    }
    return [];
}

async function getSessionContacts(sessionId) {
    try {
        let response = await fetch(`/session-contacts-direct/${sessionId}`);
        let data = await response.json();
        
        if (data.status === "success") {
            console.log(`Retrieved ${data.count} contacts`);
            return data.contacts;
        }
    } catch (error) {
        console.error(`Error fetching contacts: ${error}\n`);
        toastr.error('Failed to fetch contacts');
    }
    return [];
}

async function updateSessionSelect() {
    let select = document.getElementById('detailsSessionSelect');
    let response = await fetch('/list-sessions');
    let data = await response.json();
    
    select.innerHTML = '<option value="">Select a session</option>';
    
    if (data.sessions) {
        data.sessions.forEach(sessionId => {
            select.innerHTML += `<option value="${sessionId}">${sessionId}</option>`;
        });
    }
}

function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(`${tabName}Tab`).classList.add('active');
    document.querySelector(`[onclick="showTab('${tabName}')"]`).classList.add('active');
    
    // Load data if needed
    let sessionId = document.getElementById('detailsSessionSelect').value;
    if (sessionId) {
        if (tabName === 'chats') {
            loadChats(sessionId);
        } else if (tabName === 'contacts') {
            loadContacts(sessionId);
        }
    }
}

async function loadChats(sessionId) {
    let chatsList = document.getElementById('chatsList');
    let placeholder = document.getElementById('chatsPlaceholder');
    
    try {
        let chats = await getSessionChats(sessionId);
        
        chatsList.innerHTML = '';
        
        if (chats.length > 0) {
            placeholder.style.display = 'none';
            chats.forEach(chat => {
                chatsList.innerHTML += `
                    <div class="chat-item">
                        <i class="ph ${chat.isGroup ? 'ph-users' : 'ph-user'}"></i>
                        <div class="item-info">
                            <div class="item-name">${chat.name || chat.id}</div>
                            <div class="item-details">
                                ${chat.isGroup ? 'Group' : 'Private Chat'} • 
                                ${chat.unreadCount ? `${chat.unreadCount} unread` : 'No unread messages'}
                            </div>
                        </div>
                    </div>
                `;
            });
        } else {
            placeholder.style.display = 'block';
        }
    } catch (error) {
        console.error(`loadChats: Error: ${error}\n`);
        toastr.error('Failed to load chats');
    }
}

async function loadContacts(sessionId) {
    let contactsList = document.getElementById('contactsList');
    let placeholder = document.getElementById('contactsPlaceholder');
    
    try {
        let contacts = await getSessionContacts(sessionId);
        
        contactsList.innerHTML = '';
        
        if (contacts.length > 0) {
            placeholder.style.display = 'none';
            contacts.forEach(contact => {
                contactsList.innerHTML += `
                    <div class="contact-item">
                        <i class="ph ${contact.isBusiness ? 'ph-storefront' : 'ph-user'}"></i>
                        <div class="item-info">
                            <div class="item-name">${contact.name}</div>
                            <div class="item-details">
                                ${contact.number} • 
                                ${contact.isBusiness ? 'Business' : 'Personal'}
                            </div>
                        </div>
                    </div>
                `;
            });
        } else {
            placeholder.style.display = 'block';
        }
    } catch (error) {
        console.error(`loadContacts: Error: ${error}\n`);
        toastr.error('Failed to load contacts');
    }
}
