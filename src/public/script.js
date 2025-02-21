// Initialize Notyf at the very top of the file, before any other code
let notyf;

// Initialize notyf in a self-executing function to ensure it runs immediately
(function initializeNotyf() {
    notyf = new Notyf({
        duration: 3000,
        position: {
            x: 'right',
            y: 'top',
        },
        types: [
            {
                type: 'warning',
                background: 'orange',
                icon: false
            },
            {
                type: 'info',
                background: '#0099ff',
                icon: false
            }
        ]
    });
})();

let ws;
let qrCheckInterval;
const ipAddress = '209.145.62.86';

document.getElementById('detailsSessionSelect').value;
const detailsSelect = document.getElementById('detailsSessionSelect');
detailsSelect.value = detailsSelect.options.length > 0 ? detailsSelect.options[0].value : 'default';

//log the browser user css dark mode preference
console.log(`Browser user CSS dark mode preference: ${window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'Dark' : 'Light'}`);

function updateServer() {
    fetch('/update-server', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            notyf[data.type](data.message);
        })
        .catch(error => {
            notyf.error('Failed to update server: ' + error.message);
        });
}

// Fetch and display active sessions
async function refreshSessions() {
    // Declare variables at the top
    let sessionsList = document.getElementById('sessionsList');
    let placeholder = document.getElementById('sessionListPlaceholder');
    let detailsSelect = document.getElementById('detailsSessionSelect');
    let existingSessions = new Set();
    
    console.log(`refreshSessions #773: Starting refresh of sessions`);
    
    try {
        let response = await fetch('/list-sessions');
        let data = await response.json();
        
        // Update sessions list
        sessionsList.innerHTML = '';
        // Update details select
        detailsSelect.innerHTML = '<option value="">default</option>';
        
        if (data.sessions && data.sessions.length > 0) {
            placeholder.style.display = 'none';
            
            for (let sessionId of data.sessions) {
                // Skip if session already exists
                if (existingSessions.has(sessionId)) {
                    console.log(`refreshSessions #774: Skipping duplicate session: ${sessionId}`);
                    continue;
                }
                
                // Add to tracking Set
                existingSessions.add(sessionId);
                
                // Get status for each session
                let statusResponse = await fetch(`/session-status/${sessionId}`);
                let statusData = await statusResponse.json();
                
                let isConnected = statusData.connectionState.state === 'open';
                let statusIcon = isConnected ? 
                    '<i class="ph ph-circle-fill" style="color: #4CAF50;"></i>' : 
                    '<i class="ph ph-circle-fill" style="color: #f44336;"></i>';
                
                // Add to sessions list
                sessionsList.innerHTML += `
                    <div class="session-item">
                        ${statusIcon}
                        <span>${sessionId}</span>
                        <span class="status-text">${isConnected ? 'Connected' : 'Disconnected'}</span>
                        <button onclick="viewSessionDetails('${sessionId}')" class="view-btn">
                            <i class="ph ph-eye"></i>
                        </button>
                        <button onclick="deleteSession('${sessionId}')" class="delete-btn">
                            <i class="ph ph-trash"></i>
                        </button>
                    </div>
                `;
                
                // Add to details select if not already present
                if (!detailsSelect.querySelector(`option[value="${sessionId}"]`)) {
                    detailsSelect.innerHTML += `<option value="${sessionId}">${sessionId}</option>`;
                }
            }
        } else {
            placeholder.style.display = 'block';
        }
    } catch (error) {
        console.error(`refreshSessions: Error refreshing sessions: ${error}\n`);
        notyf.error('Failed to refresh sessions');
    }
}

async function startQRCheck(sessionId) {
    // Declare variables at the top
    let statusResponse, statusData;

    console.log(`startQRCheck #020: Starting QR check for session ${sessionId}`);
    
    // Check if session is already connected
    try {
        statusResponse = await fetch(`/session-status/${sessionId}`);
        statusData = await statusResponse.json();
        
        if (statusData.connectionState.state === 'open') {
            console.log(`startQRCheck #021: Session ${sessionId} is already connected, skipping QR check`);
            return;
        }
    } catch (error) {
        console.error(`startQRCheck #022: Error checking session status: ${error}`);
    }

    // Clear any existing interval
    if (qrCheckInterval) {
        clearInterval(qrCheckInterval);
    }

    // Check immediately
    checkQRCode(sessionId);

    // Then check every 5 seconds
    qrCheckInterval = setInterval(() => checkQRCode(sessionId), 10000);

    setTimeout(() => {
        if (qrCheckInterval) {
            clearInterval(qrCheckInterval);
            console.log(`startQRCheck #544: Stopped QR check for session ${sessionId}`);
            document.getElementById('qrcode-placeholder').innerHTML = 
                'QR code expired. Please try creating a new session.';
        }
    }, 20000);
}

function initializeWebSocket() {
    // If WebSocket exists and is in OPEN state, don't create new connection
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log(`initializeWebSocket: Connection already exists and is open`);
        return;
    }
    
    console.log(`initializeWebSocket #003: Attempting connection`);
    ws = new WebSocket(`ws://${ipAddress}:4002`);

    ws.onopen = () => {
        console.log(`WebSocket: Connected successfully`);
    };
    ws.addEventListener('open', () => {
        notyf.success('WebSocket connection established');
    });

    ws.addEventListener('message', () => {
        notyf.success('New message received');
    });

    ws.addEventListener('error', () => {
        notyf.error('WebSocket encountered an error');
    });

    ws.addEventListener('close', () => {
        notyf.warning('WebSocket connection closed');
    });
    ws.onmessage = (event) => {
        try {
            let data = JSON.parse(event.data);
            console.log(`WebSocket message received:`, data);
            
            // Handle existing QR code case
            if (data.type === 'qr') {
                let qrImage = document.getElementById('qr-image');
                let placeholder = document.getElementById('qrcode-placeholder');
                
                if (qrImage && placeholder) {
                    qrImage.src = data.qr;
                    qrImage.style.display = 'block';
                    placeholder.style.display = 'none';
                }
            }
            
            // Add handler for incoming messages
            if (data.type === 'incoming_message') {
                // Show notification
                notyf.success(`New message from ${data.sender}`);
                
                // Create message element
                const messageHtml = `
                    <div class="message-item">
                        <div class="message-header">
                            <span class="message-sender">${data.sender}</span>
                            <span class="message-time">${new Date(data.timestamp * 1000).toLocaleTimeString()}</span>
                        </div>
                        <div class="message-text">${data.text}</div>
                    </div>
                `;
                
                // Add to messages container
                const messagesContainer = document.getElementById('messages-container');
                if (messagesContainer) {
                    messagesContainer.insertAdjacentHTML('afterbegin', messageHtml);
                }
            }
        } catch (error) {
            console.error(`Error processing WebSocket message: ${error}`);
        }
    };

    ws.onerror = (error) => {
        console.error(`initializeWebSocket #547: WebSocket error: ${error}`);
    };

    ws.onclose = () => {
        console.log(`initializeWebSocket #548: Connection closed, attempting reconnect in 5s`);
        setTimeout(initializeWebSocket, 5000);
    };
}

async function deleteSession(sessionId) {
    console.log(`deleteSession: sessionId: ${sessionId}\n`);
    
    try {
        let response = await fetch(`/session/${sessionId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete session');

        notyf.success('Session deleted successfully');
        refreshSessions();
    } catch (error) {
        console.error(`deleteSession: Error deleting session: ${error}\n`);
        notyf.error('Failed to delete session');
    }
}

async function createSession() {
    // Declare all variables at the top
    let sessionId = getGlobalSessionId();
    let qrImage = document.getElementById('qr-image');
    let placeholder = document.getElementById('qrcode-placeholder');
    let maxAttempts = 10;
    let attempts = 0;
    let qrFound = false;

    //return if sessionId is empty
    if (!sessionId) {
        notyf.error('Please enter a session ID');
        return;
    }
    
    console.log(`createSession #543: Creating session with ID: ${sessionId}`);

    try {
        // Show loading state
        if (qrImage && placeholder) {
            qrImage.style.display = 'none';
            placeholder.style.display = 'block';
            placeholder.innerHTML = 'Loading QR code...';
        }

        // First create the session
        let response = await fetch('/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sessionId })
        });

        if (!response.ok) {
            let errorData = await response.json();
            throw new Error(errorData.message || 'Failed to create session');
        }

        // Wait for QR code to be available
        while (attempts < maxAttempts && !qrFound) {
            console.log(`createSession #544: Attempting to fetch QR code, attempt ${attempts + 1}`);
            try {
                let qrResponse = await fetch(`/session-qr/${sessionId}`);
                if (qrResponse.ok) {
                    qrFound = true;
                    let blob = await qrResponse.blob();
                    let imageUrl = URL.createObjectURL(blob);
                    
                    if (qrImage && placeholder) {
                        qrImage.src = imageUrl;
                        qrImage.style.display = 'block';
                        placeholder.style.display = 'none';
                        
                        // Clean up the object URL after the image loads
                        qrImage.onload = () => URL.revokeObjectURL(imageUrl);
                    }
                }
            } catch (error) {
                console.error(`createSession #545: Error: ${error}`);
                if (placeholder) {
                    placeholder.innerHTML = 'Error generating QR code';
                }
                notyf.error(error.message || 'Failed to create session');
            }
        }

        // Start checking for QR code
        startQRCheck(sessionId);

    } catch (error) {
        console.error(`createSession #546: Error: ${error}`);
        if (placeholder) {
            placeholder.innerHTML = 'Error generating QR code';
        }
        notyf.error(error.message || 'Failed to create session');
    }
}

async function sendMessage() {
    let sessionId = getGlobalSessionId();
    let jid = document.getElementById('jid').value.trim();
    let message = document.getElementById('message').value.trim();

    if (!sessionId || !jid || !message) {
        notyf.error('Please fill in all fields');
        return;
    }

    console.log(`sending message:\nsessionId: ${sessionId}, jid: ${jid}, message: ${message}\n`);

    try {
        let response = await fetch('/send-message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId, jid, message })
        });

        if (!response.ok) throw new Error('Failed to send message');
        if (response.ok) {
    console.log(`sendMessage #432: Response: ${response}`);

            notyf.success('Message sent');
        }
        document.getElementById('message').value = '';
    } catch (error) {
        console.error(`sendMessage: Error sending message: ${error}\n`);
        notyf.error('Failed to send message');
    }
}

//send image
async function sendImage() {
    let sessionId = getGlobalSessionId();
    let jid = document.getElementById('imageJid').value.trim();
    let imageUrl = document.getElementById('imageUrl').value.trim();
    let caption = document.getElementById('imageCaption').value.trim();
    let viewOnce = document.getElementById('viewonce').value;                       

    console.log(`sendImage: sessionId: ${sessionId}, jid: ${jid}, imageUrl: ${imageUrl}, caption: ${caption}, viewOnce: ${viewOnce}\n`);

    try {
        let response = await fetch('/send-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId, jid, imageUrl, caption, viewOnce })
        });

        if (!response.ok) throw new Error('Failed to send image');

        notyf.success('Image sent successfully!');
      //  document.getElementById('imageUrl').value = '';
      //  document.getElementById('caption').value = '';
    } catch (error) {
        console.error(`sendImage: Error sending image: ${error}\n`);
        notyf.error('Failed to send image');
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
async function reconnectSession() {
    const sessionId = document.getElementById('detailsSessionSelect').value;
    
    console.log(`reconnectSession #891: Attempting to reconnect session: ${sessionId}`);
    
    if (!sessionId) {
        notyf.error('Please select a session first');
        return;
    }

    try {
        const response = await fetch(`/reconnect/${sessionId}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            notyf.success(`Session ${sessionId} reconnected successfully`);
            // Refresh the sessions list
            await refreshSessions();
        } else {
            notyf.error(`Failed to reconnect: ${data.error}`);
        }
    } catch (error) {
        console.error(`reconnectSession #892: Error: ${error}`);
        notyf.error('Failed to reconnect session');
    }
}

async function getServerStatus() {
    // Declare variables at the top
    let response, data;
        response = await fetch('/server-status');
        data = await response.json();

        // Check if data contains the expected properties
        if (data && data.ram && data.cpu && data.disk) {
            updateResourceBar('ramBar', data.ram.used, data.ram.total);
            updateResourceBar('cpuBar', data.cpu.used, data.cpu.total);
            updateResourceBar('diskBar', data.disk.used, data.disk.total);
        } else {
            throw new Error('Invalid server status data format');
        }

}

// Keep only this one at the top level, and add version tracking
document.addEventListener('DOMContentLoaded', () => {
    const version = "00005"; // Increment this when making changes
    console.log(`DOMContentLoaded: Initializing version ${version}`);
    
    // Initialize all required functionality
    initializeWebSocket();
    updateSessionSelect();
    getBlockedPhones();
    refreshSessions();
    
    initializeNavigation();
});

function updateResourceBar(barId, used, total) {
    // Declare variables at the top
    let convertToGB = (value) => {
        let numValue = parseFloat(value);
        let strValue = String(value); // Convert to string for includes check
        if (strValue.includes('MB')) {
            return numValue / 1024;
        }
        return numValue;
    };
    let usedGB = convertToGB(used);
    let totalGB = convertToGB(total);
    let percentage = (usedGB / totalGB) * 100;
    
    
    let bar = document.getElementById(barId);
    let fill = bar.querySelector('.bar-fill');
    let text = bar.querySelector('.bar-text');

    // Update the bar fill
    fill.style.width = `${percentage}%`;
    
    // Format the text to include percentage
    text.textContent = `${used} / ${total} (${percentage.toFixed(1)}%)`;

}



async function getSessionChats(sessionId) {
    console.log(`getSessionChats: sessionId: ${sessionId}\n`);
    //if sessionId is empty, return an empty array
    if (!sessionId) {
        //send response with status 404 and message "No session ID provided"
        return { status: "error", message: "No session ID provided" };      
    }

    try {
        let response = await fetch(`/session-chats/${sessionId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        let data = await response.json();
        
        if (data) {
            console.log(`getSessionChats: Raw response data: ${JSON.stringify(data)}`);
            console.log(`getSessionChats: Retrieved ${data.count} chats\n`);
            return data.chats;
        }
    } catch (error) {
        console.error(`getSessionChats: Error fetching chats: ${error}\n`);
        notyf.error('Failed to fetch chats');
    }
    return [];
}

async function getSessionContacts(sessionId) {
    console.log(`getSessionContacts #654: Fetching contacts for sessionId: ${sessionId}`);
    
    if (!sessionId) {
        console.error(`getSessionContacts: No sessionId provided`);
        return { 
            status: "error", 
            message: "No session ID provided",
            contacts: [] 
        };      
    }
    
    try {
        const response = await fetch(`/contacts?session=${sessionId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        return {
            status: "success",
            contacts: data.contacts,
            count: data.count
        };
        
    } catch (error) {
        console.error(`getSessionContacts: Error:`, error);
        return {
            status: "error",
            message: error.message,
            contacts: []
        };
    }
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



async function loadChats(sessionId) {
    // Declare variables at the top
    let chatsList = document.getElementById('chatsList');
    let placeholder = document.getElementById('chatsPlaceholder');

    if (!sessionId) { //get first value from sessionId from select
        sessionId = document.getElementById('detailsSessionSelect').value;  
    }
    
    console.log(`loadChats #331: Starting with sessionId: ${sessionId}, chatsList exists: ${!!chatsList}, placeholder exists: ${!!placeholder}`);
    
    if (!chatsList || !placeholder) {
        console.error(`loadChats #332: Required elements not found. chatsList: ${!!chatsList}, placeholder: ${!!placeholder}`);
        notyf.error('UI elements not found. Please check the HTML structure.');
        return;
    }
    
    try {
        console.log(`loadChats #333: Loading chats for session ${sessionId}`);
        chatsList.innerHTML = '<div class="loading">Loading chats...</div>';
        
        let chats = await getSessionChats(sessionId);
        chatsList.innerHTML = '';
        
        if (chats && chats.length > 0) {
            placeholder.style.display = 'none';
            chats.forEach(chat => {
                // Safely handle undefined values
                let chatName = chat.name || chat.id || 'Unknown';
                let unreadCount = chat.unreadCount || 0;
                
                chatsList.innerHTML += `
                    <div class="chat-item">
                        <i class="ph ${chat.isGroup ? 'ph-users' : 'ph-user'}"></i>
                        <div class="item-info">
                            <div class="item-name">${chatName}</div>
                            <div class="item-details">
                                ${chat.isGroup ? 'Group' : 'Private Chat'} • 
                                ${unreadCount ? `${unreadCount} unread` : 'No unread messages'}
                            </div>
                        </div>
                        <button onclick="copyToClipboard('${chat.id}')" class="copy-btn">
                            <i class="ph ph-copy"></i>
                        </button>
                    </div>
                `;
            });
        } else {
            placeholder.style.display = 'block';
        }
    } catch (error) {
        console.error(`loadChats: Error: ${error}\n`);
        notyf.error('Failed to load chats');
    }
}

async function loadContacts(sessionId) {
    // Variables at the top
    const select = document.getElementById('detailsSessionSelect');
    const contactsList = document.getElementById('contactsList');
    const placeholder = document.getElementById('contactsPlaceholder');
    
    // Get sessionId if not provided
    if (!sessionId) {
        sessionId = select.options[0]?.value;
    }
    
    console.log(`loadContacts: Loading contacts for session ${sessionId}`);
    
    // Validate elements exist
    if (!contactsList || !placeholder) {
        console.error(`loadContacts: Required elements not found`);
        return;
    }
    
    try {
        const response = await getSessionContacts(sessionId);
        contactsList.innerHTML = '';
        
        // Check if we have valid contacts
        if (response?.status === 'success' && Array.isArray(response.contacts) && response.contacts.length > 0) {
            placeholder.style.display = 'none';
            
            response.contacts.forEach(contact => {
                // Safely handle undefined values
                const contactName = contact.name || contact.number || 'Unknown';
                const contactNumber = contact.number || contact.id?.split('@')[0] || 'No number';
                
                contactsList.innerHTML += `
                    <div class="contact-item">
                        <i class="ph ${contact.isBusiness ? 'ph-storefront' : 'ph-user'}"></i>
                        <div class="item-info">
                            <div class="item-name">${contactName}</div>
                            <div class="item-details">
                                ${contactNumber} • 
                                ${contact.isBusiness ? 'Business' : 'Personal'}
                            </div>
                        </div>
                        <button onclick="copyToClipboard('${contactNumber}')" class="copy-btn">
                            <i class="ph ph-copy"></i>
                        </button>
                    </div>
                `;
            });
        } else {
            console.log(`loadContacts: No contacts found for session ${sessionId}`);
            placeholder.style.display = 'block';
        }
    } catch (error) {
        console.error(`loadContacts: Error loading contacts:`, error);
        placeholder.style.display = 'block';
        contactsList.innerHTML = `<div class="error-message">Error loading contacts: ${error.message}</div>`;
    }
}


async function fetchChats(sessionId) {
    try {
        console.log(`fetchChats #8675: Fetching chats for session ${sessionId}`);
        let response = await fetch(`/session-chats/${sessionId}`);
        let data = await response.json();
        console.log(`fetchChats #8675: Received ${data?.chats?.length || 0} chats`);
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch chats');
        }

        // Clear existing chats
        let chatsContainer = document.getElementById('chats-list');
        chatsContainer.innerHTML = '';

        // Add header/count
        chatsContainer.innerHTML = `<h3>Chats (${data.count})</h3>`;

        // Create chat list
        let chatList = document.createElement('ul');
        chatList.className = 'chat-list';

        data.chats.forEach(chat => {
            let li = document.createElement('li');
            li.className = 'chat-item';
            li.innerHTML = `
                <div class="chat-info">
                    <span class="chat-name">${escapeHtml(chat.name)}</span>
                    <span class="chat-details">
                        ${chat.isGroup ? '👥 Group' : '👤 Individual'} 
                        ${chat.isGroup ? `(${chat.participants} members)` : ''}
                    </span>
                    <span class="chat-id">${chat.id}</span>
                </div>
            `;
            chatList.appendChild(li);
        });

        chatsContainer.appendChild(chatList);
    } catch (error) {
        console.error('Error fetching chats:', error);
        showError(`Failed to fetch chats: ${error.message}`);
    }
}

// Add this helper function if not already present
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Add function to view session details
function viewSessionDetails(sessionId) {
    let detailsSelect = document.getElementById('detailsSessionSelect');
    detailsSelect.value = sessionId;
    detailsSelect.dispatchEvent(new Event('change'));
    
    // Scroll to details section
    document.querySelector('.session-details').scrollIntoView({ 
        behavior: 'smooth' 
    });
}

// Update the session select change handler
document.getElementById('detailsSessionSelect')?.addEventListener('change', function() {
    let sessionId = this.value;
    if (sessionId) {
        // Show active tab content
        let activeTab = document.querySelector('.tab-btn.active');
        if (activeTab) {
            showTab(activeTab.getAttribute('data-tab'));
        } else {
            showTab('chats'); // Default to chats tab
        }
    } else {
        // Clear both lists if no session selected
        document.getElementById('chatsList').innerHTML = '';
        document.getElementById('contactsList').innerHTML = '';
        document.getElementById('chatsPlaceholder').style.display = 'block';
        document.getElementById('contactsPlaceholder').style.display = 'block';
    }
});

function copyToClipboard(text) {
    console.log(`copyToClipboard: copying text: ${text}\n`);
    
    try {
        navigator.clipboard.writeText(text);
        notyf.success('Copied to clipboard');
    } catch (error) {
        console.error(`copyToClipboard: Error: ${error}\n`);
        notyf.error('Failed to copy to clipboard');
    }
}

async function checkQRCode(sessionId) {
    console.log(`checkQRCode #543: Checking QR for session ${sessionId}`);
    
    try {
        let response = await fetch(`/session-qr/${sessionId}`);
        if (response.ok) {
            let blob = await response.blob();
            let imageUrl = URL.createObjectURL(blob);
            
            let qrImage = document.getElementById('qr-image');
            let placeholder = document.getElementById('qrcode-placeholder');
            
            if (qrImage && placeholder) {
                qrImage.src = imageUrl;
                qrImage.style.display = 'block';
                placeholder.style.display = 'none';
                
                // Clean up the object URL after the image loads
                qrImage.onload = () => URL.revokeObjectURL(imageUrl);
            }
        } else {
            throw new Error('QR code not available');
        }
    } catch (error) {
        console.error(`checkQRCode #544: Error: ${error}`);
        let placeholder = document.getElementById('qrcode-placeholder');
        if (placeholder) {
            placeholder.innerHTML = 'QR code not available. Please try again.';
        }
    }
}

let apiserverport = 3000;

//blocked phones
async function getBlockedPhones() {
    // Declare variables at the top
    let blockedPhonesList = document.getElementById('blockedPhonesList');
    
    console.log(`getBlockedPhones #765: Fetching blocked phones list`);
    
    try {
        let response = await fetch(`http://${ipAddress}:${apiserverport}/blocked-phones`, {
            headers: {
                'origin': 'zaploop'
            }
        });
        let data = await response.json();
        
        // Clear existing list
        blockedPhonesList.innerHTML = '';
        
        if (data && data.length > 0) {
            data.forEach(phone => {
                blockedPhonesList.innerHTML += `
                    <div class="blocked-phone-item">
                        <i class="ph ph-phone-x"></i>
                        <span>${phone}</span>
                        <button onclick="unblockPhone('${phone}')" class="unblock-btn">
                            <i class="ph ph-trash"></i>
                        </button>
                    </div>
                `;
            });
        } else {
            blockedPhonesList.innerHTML = '<div class="no-blocked">No blocked phones</div>';
        }
    } catch (error) {
        console.error(`getBlockedPhones #766: Error fetching blocked phones: ${error}`);
        notyf.error('Failed to fetch blocked phones');
    }
}

async function blockPhone() {
    // Declare variables at the top
    let phoneNumber = document.getElementById('blockedPhoneNumber').value.trim();
    
    console.log(`blockPhone #432: Attempting to block phone: ${phoneNumber}`);
    
    if (!phoneNumber) {
        notyf.error('Please enter a phone number');
        return;
    }

    try {
        let response = await fetch(`http://${ipAddress}:${apiserverport}/blockuser`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'origin': 'zaploop'
            },
            body: JSON.stringify({ userPhone: phoneNumber })
        });

        if (!response.ok) {
            throw new Error('Failed to block phone');
        }

        notyf.success(`Phone number ${phoneNumber} blocked successfully`);
        document.getElementById('blockedPhoneNumber').value = '';
        
        await getBlockedPhones();
    } catch (error) {
        console.error(`blockPhone #433: Error blocking phone: ${error}`);
        notyf.error('Failed to block phone number');
    }
}

// Similarly, update unblockPhone and getBlockedPhones functions
async function unblockPhone(phoneNumber) {
    console.log(`unblockPhone #544: Attempting to unblock phone: ${phoneNumber}`);
    
    try {
        let response = await fetch(`http://${ipAddress}:${apiserverport}/unblockuser`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'origin': 'zaploop'
            },
            body: JSON.stringify({ userPhone: phoneNumber })
        });

        if (!response.ok) {
            throw new Error('Failed to unblock phone');
        }

        notyf.success(`Phone number ${phoneNumber} unblocked successfully`);
        
        await getBlockedPhones();
    } catch (error) {
        console.error(`unblockPhone #545: Error unblocking phone: ${error}`);
        notyf.error('Failed to unblock phone number');
    }
}

// Add function to track initialization
function isInitialized() {
    // Use a global flag to prevent multiple initializations
    if (window._isInitialized) {
        console.log('Application already initialized, skipping...');
        return true;
    }
    window._isInitialized = true;
    return false;
}

async function sendVideo() {
    // Declare variables at the top
    let sessionId = getGlobalSessionId();
    let jid = document.getElementById('videoJid').value.trim();
    let videoUrl = document.getElementById('videoUrl').value.trim();
    let caption = document.getElementById('videoCaption').value.trim();
    let viewOnce = document.getElementById('videoViewonce').value;
    let gifPlayback = document.getElementById('gifPlayback').value;

    console.log(`sendVideo #776: sessionId: ${sessionId}, jid: ${jid}, videoUrl: ${videoUrl}, caption: ${caption}, viewOnce: ${viewOnce}, gifPlayback: ${gifPlayback}`);

    // Validate required fields
    if (!sessionId || !jid || !videoUrl) {
        notyf.error('Please fill in all required fields');
        return;
    }

    try {
        let response = await fetch('/send-video', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                sessionId, 
                jid, 
                videoUrl, 
                caption, 
                viewOnce: viewOnce === 'true',
                gifPlayback: gifPlayback === 'true'
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send video');
        }

        notyf.success('Video sent successfully!');
    } catch (error) {
        console.error(`sendVideo #777: Error sending video: ${error}`);
        notyf.error('Failed to send video');
    }
}

async function sendVoiceNote() {
    // Variables at the top
    let sessionId = getGlobalSessionId();
    let jid = document.getElementById('audioJid').value.trim();
    let audioUrl = document.getElementById('audioUrl').value.trim();
    let seconds = parseInt(document.getElementById('audioDuration').value) || 0;
    
    console.log(` BAILE 🧜‍♀️🧜‍♀️ sendVoiceNote #432: Sending voice note to ${jid} from session ${sessionId}`);

    // Validate required fields
    if (!sessionId || !jid || !audioUrl) {
        notyf.error('Please fill in all required fields');
        return;
    }

    try {
        let response = await fetch('/send-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                sessionId, 
                jid, 
                audioUrl,
                seconds
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send voice note');
        }

        notyf.success('Voice note sent successfully!');
    } catch (error) {
        console.error(` BAILE 🧜‍♀️🧜‍♀️ sendVoiceNote #433: Error sending voice note: ${error}`);
        notyf.error('Failed to send voice note');
    }
}

// Function to get the global session ID
function getGlobalSessionId() {
    return document.getElementById('globalSessionId').value;
}

// New function to check the server status and trigger a Toasty notification.
function checkServerStatusToast() {
    // Place variables at the top of the function.
    const functionName = "checkServerStatusToast";
    
    // Log the function call (no arguments to log).
    console.log(`${functionName}: called with no arguments`);
    
    // Log before calling getServerStatus (using a template literal).
    console.log(`${functionName}: calling getServerStatus() with no arguments`);
    getServerStatus();
    
    // Check if notyf is initialized before using it
    if (notyf) {
        notyf.success(` Server status checked.`);
    } else {
        console.error(`${functionName}: Notification system not initialized`);
    }
}

// Make sure checkServerStatusToast is available globally
window.checkServerStatusToast = checkServerStatusToast;

// Add this new function
async function restoreAllSessions() {
    const functionName = 'restoreAllSessions';
    console.log(`${functionName}: Initiating restore of all sessions`);
    
    try {
        const response = await fetch('/restart-all-sessions', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            notyf.success(`Restored ${data.summary.successful} sessions successfully`);
            if (data.summary.failed > 0) {
                notyf.warning(`Failed to restore ${data.summary.failed} sessions`);
            }
            await refreshSessions();
        } else {
            throw new Error(data.message || 'Failed to restore sessions');
        }
    } catch (error) {
        console.error(`${functionName}: Error:`, error);
        notyf.error('Failed to restore sessions: ' + error.message);
    }
}

// Add at the end of the file
document.getElementById('openSidemenu')?.addEventListener('click', () => {
    document.getElementById('sidemenu').classList.add('open');
});

document.getElementById('closeSidemenu')?.addEventListener('click', () => {
    document.getElementById('sidemenu').classList.remove('open');
});

function initializeNavigation() {
    const menuItems = document.querySelectorAll('.menu-item');
    
    // Show first section by default
    document.querySelector('.section').classList.add('active');
    menuItems[0]?.classList.add('active');
    
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active class from all sections and menu items
            document.querySelectorAll('.section').forEach(section => {
                section.classList.remove('active');
            });
            menuItems.forEach(menuItem => {
                menuItem.classList.remove('active');
            });
            
            // Add active class to clicked item and corresponding section
            item.classList.add('active');
            const sectionId = item.getAttribute('data-section');
            document.querySelector(`.section[id="${sectionId}"]`)?.classList.add('active');
        });
    });
}
