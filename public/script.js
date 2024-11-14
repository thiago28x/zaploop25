async function fetchChats(sessionId) {
    try {
        let response = await fetch(`/session-chats-direct/${sessionId}`);
        let data = await response.json();
        
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