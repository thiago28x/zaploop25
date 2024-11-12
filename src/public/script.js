
async function deleteSession(sessionId) {
    console.log(`deleteSession: sessionId: ${sessionId}\n`);
    
    try {
        let response = await fetch(`/delete-session/${sessionId}`, {
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

            /* if not empty, change placeholder to empty */
            if (sessionId) {
                document.getElementById('sessionListPlaceholder').innerHTML = '';
            }

            // Update status immediately
            updateSessionStatus(sessionId);
        });
    } catch (error) {
        console.error('Error fetching sessions:', error);
        //toastr.error('Failed to fetch sessions');
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
        
        // Create modal for QR code
        let modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Scan QR Code for Session: ${sessionId}</h3>
                <div id="qrcode-${sessionId}"></div>
                <p>Scan this QR code with WhatsApp to connect</p>
                <button onclick="this.parentElement.parentElement.remove()">Close</button>
            </div>
        `;
        document.body.appendChild(modal);

/* 
sample qr code data
{
    "status": "New connection created",
    "sessionId": "luana",
    "qrCode": "2@isXQMr9qaNDhpdwWZFLM/PIY59/LtWY9ZKT3qI3I7eHp0ClGOhruQeHd+O6D5NWsVG8557IZQyFBHzL7zUm1HXoxAlTTgNnpKTk=,DokWTivKJqEJchkG36o/Pv+gkocM/FHJQWO694AWxnA=,5Uu0/qKzBRbEXpZhnQqSMXAFK0ipZwNfGOo3S7Hqfxg=,GAFNb8CcgXqKaVYO8sc8WlAdFLXC0XF0qEgXF4QUe7Q="
}

*/
        // Generate QR code if available
        if (data.qrCode) {
            // Using qrcode.js library
            new QRCode(document.getElementById(`qrcode-${sessionId}`), {
                text: data.qrCode,
                width: 256,
                height: 256
            });
            toastr.success('Session created. Scan the QR code to connect.');
        } else {
            toastr.warning('Session created but no QR code was generated.');
        }

        document.getElementById('sessionId').value = '';
       // refreshSessions();
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
