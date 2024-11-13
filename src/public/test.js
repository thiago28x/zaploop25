
let serverIP = 'http://209.145.62.86:4001/';
let sessionId = 'default';

//   curl http://209.145.62.86:4001/session-chats/default


fetch(`${serverIP}session-chats/${sessionId}`)
    .then(response => response.json())
    .then(data => console.log(data))
    .catch(error => console.error('Error:', error));

fetch(`${serverIP}session-contacts/${sessionId}`)
    .then(response => response.json())
    .then(data => console.log(data))
    .catch(error => console.error('Error:', error));

fetch(`${serverIP}session-chats-direct/${sessionId}`)
    .then(response => response.json())
    .then(data => console.log(data))
    .catch(error => console.error('Error:', error));

fetch(`${serverIP}session-contacts-direct/${sessionId}`)
    .then(response => response.json())
    .then(data => console.log(data))
    .catch(error => console.error('Error:', error));



    /* 
    // For store-based retrieval
curl ${serverIP}/session-chats/${sessionId}
curl ${serverIP}/session-contacts/${sessionId}

// For direct socket retrieval
curl ${serverIP}/session-chats-direct/${sessionId}
curl ${serverIP}/session-contacts-direct/${sessionId}
    
    
    */